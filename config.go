package main

import (
	"log"

	"github.com/BurntSushi/toml"
)

type Config struct {
	Server ServerConfig `toml:"server"`
	Admin  AdminConfig  `toml:"admin"`
	UI     UIConfig     `toml:"ui"`
}

type ServerConfig struct {
	Port    int    `toml:"port"`
	Host    string `toml:"host"`
	BaseURL string `toml:"base_url"`
}

type AdminConfig struct {
	Password string `toml:"password"`
}

type UIConfig struct {
	SiteName     string  `toml:"site_name"`
	Description  string  `toml:"description"`
	Timeline     bool    `toml:"timeline"`
	ReadTracking bool    `toml:"read_tracking"`
	Theme        UITheme `toml:"theme"`
}

type UITheme struct {
	Primary    string `toml:"primary"`
	Secondary  string `toml:"secondary"`
	Text       string `toml:"text"`
	TextMuted  string `toml:"text_muted"`
	Surface    string `toml:"surface"`
	Background string `toml:"background"`
}

var config Config

func loadConfig(path string) Config {
	var conf Config
	if _, err := toml.DecodeFile(path, &conf); err != nil {
		log.Fatal("Failed to load config: ", err)
	}
	return conf
}
