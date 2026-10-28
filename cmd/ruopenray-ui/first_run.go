package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (s *serverState) ensureInitialPassword() error {
	if s.cfg.Password != "" {
		return nil
	}
	path := filepath.Join(s.cfg.DataDir, "initial-password")
	body, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		password := randomToken()
		if err = writeFileAtomic(path, []byte(password+"\n"), 0600); err != nil {
			return fmt.Errorf("не удалось сохранить пароль первого запуска: %w", err)
		}
		body = []byte(password)
	} else if err != nil {
		return err
	}
	password := strings.TrimSpace(string(body))
	if len(password) < 32 {
		return fmt.Errorf("initial-password повреждён; укажите пароль через UCI или RUOPENRAY_PASSWORD")
	}
	if err = os.Chmod(path, 0600); err != nil {
		return err
	}
	s.cfg.Password = password
	return nil
}
