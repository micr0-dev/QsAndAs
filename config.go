package main

import (
	"log"
	"sync"

	"github.com/BurntSushi/toml"
	"github.com/fsnotify/fsnotify"
	"golang.org/x/crypto/bcrypt"
)

type Config struct {
	Server  ServerConfig  `toml:"server"`
	Admin   AdminConfig   `toml:"admin"`
	UI      UIConfig      `toml:"ui"`
	Limits  RateLimits    `toml:"limits"`
	Profile ProfileConfig `toml:"profile"`
}

type ServerConfig struct {
	Port    int    `toml:"port"`
	Host    string `toml:"host"`
	BaseURL string `toml:"base_url"`
}

type AdminConfig struct {
	Password      string `toml:"password"`
	TokenDuration string `toml:"token_duration"`
}

type UIConfig struct {
	SiteName     string  `toml:"site_name"`
	Description  string  `toml:"description"`
	Timeline     bool    `toml:"timeline"`
	ReadTracking bool    `toml:"read_tracking"`
	Theme        UITheme `toml:"theme"`
}

type UITheme struct {
	Text       string `toml:"text"`
	TextMuted  string `toml:"text_muted"`
	Surface    string `toml:"surface"`
	Background string `toml:"background"`
}

type RateLimits struct {
	QuestionsPerHour int `toml:"questions_per_hour"`
	QuestionsBurst   int `toml:"questions_burst"`
}

type ProfileConfig struct {
	Username    string            `toml:"username"`
	Bio         string            `toml:"bio"`
	Avatar      string            `toml:"avatar"`
	AccentColor string            `toml:"accent_color"`
	Social      map[string]string `toml:"social"`
}

var (
	config     Config
	configLock sync.RWMutex
	configPath = "config.toml"
)

func loadConfig(path string) Config {
	var conf Config
	if _, err := toml.DecodeFile(path, &conf); err != nil {
		log.Fatal("Failed to load config: ", err)
	}
	return conf
}
func watchConfig() {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatal("Failed to create watcher:", err)
	}

	done := make(chan bool)
	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					done <- true
					return
				}
				if event.Op&fsnotify.Write == fsnotify.Write {
					newConfig := loadConfig(configPath)
					configLock.Lock()
					config = newConfig
					adminHash, _ = bcrypt.GenerateFromPassword(
						[]byte(config.Admin.Password),
						bcrypt.DefaultCost,
					)
					configLock.Unlock()
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					done <- true
					return
				}
				log.Println("Config watch error:", err)
			}
		}
	}()

	err = watcher.Add(configPath)
	if err != nil {
		log.Fatal("Failed to add config watcher:", err)
	}

	<-done
	watcher.Close()
}

// Helper function to safely get config
func getConfig() Config {
	configLock.RLock()
	defer configLock.RUnlock()
	return config
}
