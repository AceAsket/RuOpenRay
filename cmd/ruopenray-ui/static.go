package main

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
)

//go:embed web/*
var embeddedFiles embed.FS

func (s *serverState) handleStatic(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}
	fullPath := "web/" + filepath.ToSlash(path)
	body, err := embeddedFiles.ReadFile(fullPath)
	if err != nil {
		if _, statErr := fs.Stat(embeddedFiles, fullPath); statErr != nil {
			http.NotFound(w, r)
			return
		}
	}
	if ctype := mime.TypeByExtension(filepath.Ext(path)); ctype != "" {
		w.Header().Set("content-type", ctype)
	}
	_, _ = w.Write(body)
}
