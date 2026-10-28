package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	rsystem "github.com/AceAsket/RuOpenRay/internal/system"
)

func main() {
	// The independent updater must not depend on a working config or API lock.
	if len(os.Args) > 2 && os.Args[1] == "--app-update-watchdog" {
		os.Exit(runAppUpdateWatchdog(os.Args[2]))
	}
	if len(os.Args) > 1 && os.Args[1] == "--self-check" {
		if panelSelfCheck(embeddedFiles) != nil {
			os.Exit(1)
		}
		printJSON(map[string]any{"ok": true, "version": appVersion})
		return
	}
	cfg := loadAppConfig()
	state := &serverState{cfg: cfg, sessions: map[string]bool{}, started: time.Now(), systemSampler: rsystem.NewSampler()}
	if len(os.Args) > 1 && os.Args[1] != "serve" {
		unlock, err := state.beginMutation()
		if err != nil {
			log.Fatal(err)
		}
		defer unlock()
	}
	var dataErr error
	if len(os.Args) > 1 && os.Args[1] != "serve" {
		dataErr = state.ensureMaintenanceDirs()
	} else {
		dataErr = state.ensureData()
	}
	if dataErr != nil {
		log.Fatal(dataErr)
	}
	if len(os.Args) == 1 || os.Args[1] == "serve" {
		if err := state.ensureInitialPassword(); err != nil {
			log.Fatal(err)
		}
	}
	if len(os.Args) > 1 && os.Args[1] == "--firewall-reload" {
		payload := state.reloadFirewall()
		body, _ := json.Marshal(payload)
		fmt.Println(string(body))
		if payload["ok"] != true {
			os.Exit(1)
		}
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "--firewall-disable" {
		payload := state.disableFirewall()
		body, _ := json.Marshal(payload)
		fmt.Println(string(body))
		if payload["ok"] != true {
			os.Exit(1)
		}
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "--geo-update-scheduled" {
		payload := state.runScheduledGeoUpdate()
		body, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println(string(body))
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "--b4-direct-restore" {
		state.restoreB4Direct()
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "--route-presets-update-scheduled" {
		payload := state.runScheduledRoutePresetSourceUpdate()
		body, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println(string(body))
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "--subscriptions-update-scheduled" {
		payload := state.runScheduledSubscriptionUpdate()
		body, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println(string(body))
		return
	}
	if len(os.Args) > 1 && os.Args[1] != "serve" {
		os.Exit(state.runCLI(os.Args[1:]))
	}
	state.startLogMaintenance()
	mux := http.NewServeMux()
	go state.maintainB4Direct()
	mux.HandleFunc("/api/", state.handleAPI)
	mux.HandleFunc("/", state.handleStatic)
	addr := net.JoinHostPort(strings.Trim(cfg.Host, "[]"), cfg.Port)
	log.Printf("RuOpenRay UI слушает http://%s", addr)
	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 * 1024,
	}
	log.Fatal(server.ListenAndServe())
}
