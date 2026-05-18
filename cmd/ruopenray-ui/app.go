package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	cfg := loadAppConfig()
	state := &serverState{cfg: cfg, sessions: map[string]bool{}, started: time.Now()}
	if err := state.ensureData(); err != nil {
		log.Fatal(err)
	}
	state.startLogMaintenance()
	if len(os.Args) > 1 && os.Args[1] == "--geo-update-scheduled" {
		payload := state.runScheduledGeoUpdate()
		body, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println(string(body))
		return
	}
	if len(os.Args) > 1 && os.Args[1] != "serve" {
		os.Exit(state.runCLI(os.Args[1:]))
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/", state.handleAPI)
	mux.HandleFunc("/", state.handleStatic)
	addr := cfg.Host + ":" + cfg.Port
	log.Printf("RuOpenRay UI слушает http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
