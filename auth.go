package main

import (
	"crypto/rand"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt"
	"golang.org/x/crypto/bcrypt"
)

var (
	// Generate a random key on startup
	jwtKey = make([]byte, 32)
)

func init() {
	// Generate random key
	_, err := rand.Read(jwtKey)
	if err != nil {
		log.Fatal("Could not generate JWT key:", err)
	}
}

type Claims struct {
	jwt.StandardClaims
}

func generateToken() (string, error) {
	duration, err := time.ParseDuration(getConfig().Admin.TokenDuration)
	if err != nil {
		duration = 720 * time.Hour // Default to 30 days
	}

	claims := &Claims{
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: time.Now().Add(duration).Unix(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtKey)
}

func adminAuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check token
		authHeader := r.Header.Get("Authorization")

		if strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")

			isValid := validateToken(token)

			if isValid {
				log.Println("Token is valid, proceeding")
				next(w, r)
				return
			}
		}

		// Check password
		password := r.FormValue("password")
		if password != "" {
			err := bcrypt.CompareHashAndPassword(adminHash, []byte(password))

			if err == nil {
				// Generate and send new token
				token, err := generateToken()
				if err == nil {
					w.Header().Set("X-Admin-Token", token)
				} else {
					log.Printf("Error generating token: %v", err)
				}
				next(w, r)
				return
			}
		}

		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}
}

func validateToken(tokenString string) bool {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			log.Printf("Unexpected signing method: %v", token.Header["alg"])
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtKey, nil
	})

	if err != nil {
		log.Printf("Token validation error: %v", err)
		return false
	}

	return token.Valid
}
