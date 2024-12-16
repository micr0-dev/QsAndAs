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
