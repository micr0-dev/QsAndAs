package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
	"github.com/russross/blackfriday/v2"
	"golang.org/x/crypto/bcrypt"
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
	db        *sql.DB
	adminHash []byte // Store the hash of the admin password
)

func init() {
	// Load config first
	config = loadConfig("config.toml")

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
	r.HandleFunc("/answer", handleAnswer).Methods("POST")
	r.HandleFunc("/questions", handleGetQuestions).Methods("GET")
	r.HandleFunc("/questions/{id}", handleGetQuestion).Methods("GET")

	r.HandleFunc("/config", handleConfig).Methods("GET")

	log.Fatal(http.ListenAndServe(":8080", r))
}

// Add config handler for UI
func handleConfig(w http.ResponseWriter, r *http.Request) {
	// Only send safe config values to UI
	uiConfig := struct {
		SiteName     string  `json:"siteName"`
		Description  string  `json:"description"`
		Timeline     bool    `json:"timeline"`
		ReadTracking bool    `json:"readTracking"`
		Theme        UITheme `json:"theme"`
	}{
		SiteName:     config.UI.SiteName,
		Description:  config.UI.Description,
		Timeline:     config.UI.Timeline,
		ReadTracking: config.UI.ReadTracking,
		Theme:        config.UI.Theme,
	}

	json.NewEncoder(w).Encode(uiConfig)
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	data := struct {
		SiteName    string
		Description string
	}{
		SiteName:    config.UI.SiteName,
		Description: config.UI.Description,
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

	id := generateID()
	_, err := db.Exec(
		"INSERT INTO questions (id, question, timestamp, answered) VALUES (?, ?, ?, ?)",
		id, question, time.Now(), false,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func handleAnswer(w http.ResponseWriter, r *http.Request) {
	password := r.FormValue("password")
	if err := bcrypt.CompareHashAndPassword(adminHash, []byte(password)); err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	id := r.FormValue("id")
	answer := r.FormValue("answer")

	_, err := db.Exec(
		"UPDATE questions SET answer = ?, answered = true WHERE id = ?",
		answer, id,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

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
	password := r.URL.Query().Get("password")

	var rows *sql.Rows
	var err error

	if showAll && bcrypt.CompareHashAndPassword(adminHash, []byte(password)) == nil {
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
