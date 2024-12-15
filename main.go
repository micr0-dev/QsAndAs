package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
	"github.com/russross/blackfriday/v2"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/time/rate"
)

type Question struct {
	ID        string    `json:"id"`
	Question  string    `json:"question"`
	Answer    string    `json:"answer"`
	Timestamp time.Time `json:"timestamp"`
	Answered  bool      `json:"answered"`
}

type Stats struct {
	Total    int `json:"total"`
	Answered int `json:"answered"`
	Rate     int `json:"rate"`
}

var (
	db          *sql.DB
	adminHash   []byte // Store the hash of the admin password
	rateLimiter *IPRateLimiter
)

func init() {
	// Load config first
	config = loadConfig("config.toml")

	go watchConfig()

	var err error
	db, err = sql.Open("sqlite3", "./data/questions.db")
	if err != nil {
		log.Fatal(err)
	}

	// Create questions table if it doesn't exist
	_, err = db.Exec(`
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            question TEXT,
            answer TEXT,
            timestamp DATETIME,
            answered BOOLEAN
        )
    `)
	if err != nil {
		log.Fatal(err)
	}

	// Generate admin password hash (change 'adminpassword' to your desired password)
	adminHash, _ = bcrypt.GenerateFromPassword([]byte("adminpassword"), bcrypt.DefaultCost)

	// Initialize rate limiter
	questionsPerHour := float64(config.Limits.QuestionsPerHour)
	rateLimiter = NewIPRateLimiter(rate.Limit(questionsPerHour/3600), config.Limits.QuestionsBurst)
}

func generateID() string {
	bytes := make([]byte, 3)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func main() {
	r := mux.NewRouter()

	// Serve static files
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Routes
	r.HandleFunc("/", handleIndex).Methods("GET")
	r.HandleFunc("/ask", handleAsk).Methods("POST")
	answerHandler := adminAuthMiddleware(handleAnswer)
	r.HandleFunc("/answer", answerHandler).Methods("POST")

	r.HandleFunc("/questions", handleGetQuestions).Methods("GET") // This one handles auth internally
	r.HandleFunc("/questions/{id}", handleGetQuestion).Methods("GET")

	r.HandleFunc("/config", handleConfig).Methods("GET")

	r.HandleFunc("/ws", handleWebSocket)

	log.Fatal(http.ListenAndServe(":8080", r))
}

// Add config handler for UI
func handleConfig(w http.ResponseWriter, r *http.Request) {
	currentConfig := getConfig()

	// Only send safe config values to UI
	uiConfig := struct {
		SiteName     string  `json:"siteName"`
		Description  string  `json:"description"`
		Timeline     bool    `json:"timeline"`
		ReadTracking bool    `json:"readTracking"`
		Theme        UITheme `json:"theme"`
	}{
		SiteName:     currentConfig.UI.SiteName,
		Description:  currentConfig.UI.Description,
		Timeline:     currentConfig.UI.Timeline,
		ReadTracking: currentConfig.UI.ReadTracking,
		Theme:        currentConfig.UI.Theme,
	}

	json.NewEncoder(w).Encode(uiConfig)
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	currentConfig := getConfig()
	data := struct {
		SiteName    string
		Description string
		Theme       UITheme
	}{
		SiteName:    currentConfig.UI.SiteName,
		Description: currentConfig.UI.Description,
		Theme:       currentConfig.UI.Theme,
	}

	tmpl := template.Must(template.ParseFiles("templates/index.html"))
	tmpl.Execute(w, data)
}

func handleAsk(w http.ResponseWriter, r *http.Request) {
	question := r.FormValue("question")
	if question == "" {
		http.Error(w, "Question cannot be empty", http.StatusBadRequest)
		return
	}

	ip := getIP(r)
	limiter := rateLimiter.GetLimiter(ip)
	if !limiter.Allow() {
		remaining := time.Until(time.Now().Add(time.Hour))
		response := map[string]interface{}{
			"error":      "Rate limit exceeded",
			"retryAfter": remaining.String(),
			"limit":      config.Limits.QuestionsPerHour,
			"period":     "hour",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(response)
		return
	}

	id := generateID()
	_, err := db.Exec(
		"INSERT INTO questions (id, question, timestamp, answered) VALUES (?, ?, ?, ?)",
		id, question, time.Now(), false,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	broadcastUpdate("new_question", map[string]string{
		"id":        id,
		"timestamp": time.Now().Format(time.RFC3339),
	})

	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func handleAnswer(w http.ResponseWriter, r *http.Request) {
	// Parse form data
	err := r.ParseForm()
	if err != nil {
		log.Printf("Error parsing form: %v", err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	id := r.FormValue("id")
	answer := r.FormValue("answer")

	if id == "" || answer == "" {
		log.Printf("Missing required fields - id: %v, answer: %v", id != "", answer != "")
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	_, err = db.Exec(
		"UPDATE questions SET answer = ?, answered = true WHERE id = ?",
		answer, id,
	)
	if err != nil {
		log.Printf("Database error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	broadcastUpdate("new_answer", map[string]string{
		"id":        id,
		"timestamp": time.Now().Format(time.RFC3339),
	})

	w.WriteHeader(http.StatusOK)
}

// Add this function to get stats
func getStats(db *sql.DB) (Stats, error) {
	var stats Stats

	// Get total questions
	err := db.QueryRow("SELECT COUNT(*) FROM questions").Scan(&stats.Total)
	if err != nil {
		return stats, err
	}

	// Get answered questions
	err = db.QueryRow("SELECT COUNT(*) FROM questions WHERE answered = true").Scan(&stats.Answered)
	if err != nil {
		return stats, err
	}

	// Calculate rate
	if stats.Total > 0 {
		stats.Rate = (stats.Answered * 100) / stats.Total
	}

	return stats, nil
}

func handleGetQuestion(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var question Question
	var answer sql.NullString // Use NullString to handle NULL values

	err := db.QueryRow("SELECT * FROM questions WHERE id = ?", id).Scan(
		&question.ID,
		&question.Question,
		&answer, // Scan into NullString
		&question.Timestamp,
		&question.Answered,
	)

	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Convert NullString to string
	question.Answer = "" // Default to empty string
	if answer.Valid {    // If there is a value
		question.Answer = string(blackfriday.Run([]byte(answer.String)))
	}

	question.Question = string(blackfriday.Run([]byte(question.Question)))

	json.NewEncoder(w).Encode(question)
}

// Modify your handleGetQuestions function to include stats
func handleGetQuestions(w http.ResponseWriter, r *http.Request) {
	showAll := r.URL.Query().Get("all") == "true"
	isAdmin := false

	// Check token first
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		isAdmin = validateToken(token)
	}

	// Fall back to password if no valid token
	if !isAdmin {
		password := r.URL.Query().Get("password")
		isAdmin = password != "" && bcrypt.CompareHashAndPassword(adminHash, []byte(password)) == nil

		// Generate and send new token if using password
		if isAdmin {
			token, err := generateToken()
			if err == nil {
				w.Header().Set("X-Admin-Token", token)
			}
		}
	}

	var rows *sql.Rows
	var err error

	if showAll && isAdmin {
		rows, err = db.Query("SELECT * FROM questions ORDER BY timestamp DESC")
	} else {
		rows, err = db.Query("SELECT * FROM questions WHERE answered = true ORDER BY timestamp DESC")
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	questions := []Question{}
	for rows.Next() {
		var q Question
		rows.Scan(&q.ID, &q.Question, &q.Answer, &q.Timestamp, &q.Answered)

		// Convert markdown to HTML
		if q.Answer != "" {
			q.Answer = string(blackfriday.Run([]byte(q.Answer)))
		}
		q.Question = string(blackfriday.Run([]byte(q.Question)))

		questions = append(questions, q)
	}

	// Get stats
	stats, err := getStats(db)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Send both questions and stats
	response := struct {
		Questions []Question `json:"questions"`
		Stats     Stats      `json:"stats"`
	}{
		Questions: questions,
		Stats:     stats,
	}

	json.NewEncoder(w).Encode(response)
}

function createAttributionPanel() {
    const panel = document.createElement('div');
    panel.className = 'attribution-panel';
    
    panel.innerHTML = `
        <span class="attribution-text">by Micr0byte</span>
        
        <a href="https://github.com/yourusername/project" 
           class="attribution-link" 
           target="_blank" 
           title="View source on GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
        </a>
        
        <a href="https://ko-fi.com/yourusername" 
           class="attribution-link" 
           target="_blank" 
           title="Support on Ko-fi">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z"/>
            </svg>
        </a>
    `;
    
    document.body.appendChild(panel);
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', createAttributionPanel);