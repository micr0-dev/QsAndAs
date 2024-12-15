package main

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type WSClient struct {
	conn *websocket.Conn
	send chan WSMessage
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	clients    = make(map[*WSClient]bool)
	clientsMux sync.RWMutex
	broadcast  = make(chan WSMessage)
)

func init() {
	// Start broadcast handler
	go handleBroadcasts()
}

func handleBroadcasts() {
	for msg := range broadcast {
		clientsMux.RLock()
		for client := range clients {
			select {
			case client.send <- msg:
			default:
				close(client.send)
				delete(clients, client)
			}
		}
		clientsMux.RUnlock()
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &WSClient{
		conn: conn,
		send: make(chan WSMessage, 256),
	}

	clientsMux.Lock()
	clients[client] = true
	clientsMux.Unlock()

	// Start the write pump in a goroutine
	go writePump(client)

	// Start the read pump in the main goroutine
	readPump(client)
}

func writePump(client *WSClient) {
	defer func() {
		client.conn.Close()
		clientsMux.Lock()
		delete(clients, client)
		close(client.send)
		clientsMux.Unlock()
	}()

	for msg := range client.send {
		err := client.conn.WriteJSON(msg)
		if err != nil {
			log.Printf("Error writing to WebSocket: %v", err)
			return
		}
	}
}

func readPump(client *WSClient) {
	defer client.conn.Close()

	for {
		// Read messages (if needed)
		_, _, err := client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}
	}
}

func broadcastUpdate(msgType string, payload interface{}) {
	msg := WSMessage{
		Type:    msgType,
		Payload: payload,
	}
	broadcast <- msg
}
