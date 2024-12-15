package main

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type limiterState struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type IPRateLimiter struct {
	ips     map[string]*limiterState
	mu      *sync.RWMutex
	rate    rate.Limit
	burst   int
	cleanup time.Duration
}

func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
	rl := &IPRateLimiter{
		ips:     make(map[string]*limiterState),
		mu:      &sync.RWMutex{},
		rate:    r,
		burst:   b,
		cleanup: time.Hour,
	}

	go rl.cleanupRoutine()
	return rl
}

func (rl *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	state, exists := rl.ips[ip]
	if !exists {
		state = &limiterState{
			limiter:  rate.NewLimiter(rl.rate, rl.burst),
			lastSeen: time.Now(),
		}
		rl.ips[ip] = state
	} else {
		state.lastSeen = time.Now()
	}

	return state.limiter
}

func (rl *IPRateLimiter) cleanupRoutine() {
	ticker := time.NewTicker(rl.cleanup)
	for range ticker.C {
		rl.mu.Lock()
		for ip, state := range rl.ips {
			if time.Since(state.lastSeen) > rl.cleanup {
				delete(rl.ips, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// Helper function to get IP address
func getIP(r *http.Request) string {
	// Check for X-Forwarded-For header
	ip := r.Header.Get("X-Forwarded-For")
	if ip != "" {
		// Strip port if present
		for i, c := range ip {
			if c == ':' {
				ip = ip[:i]
				break
			}
		}
		return ip
	}
	// Check for X-Real-IP header
	ip = r.Header.Get("X-Real-IP")
	if ip != "" {
		// Strip port if present
		for i, c := range ip {
			if c == ':' {
				ip = ip[:i]
				break
			}
		}
		return ip
	}
	// Fall back to RemoteAddr
	for i, c := range r.RemoteAddr {
		if c == ':' {
			ip = r.RemoteAddr[:i]
			break
		}
	}
	return ip
}
