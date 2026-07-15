package main

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
)

func serverModeAWGKeyPair() map[string]any {
	privateKey, publicKey, err := generateServerModeAWGKeyPair()
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return map[string]any{
		"ok":         true,
		"privateKey": privateKey,
		"publicKey":  publicKey,
	}
}

func generateServerModeAWGKeyPair() (string, string, error) {
	privateBytes := make([]byte, 32)
	if _, err := rand.Read(privateBytes); err != nil {
		return "", "", err
	}
	privateBytes[0] &= 248
	privateBytes[31] &= 127
	privateBytes[31] |= 64
	privateKey, err := ecdh.X25519().NewPrivateKey(privateBytes)
	if err != nil {
		return "", "", err
	}
	return base64.StdEncoding.EncodeToString(privateBytes), base64.StdEncoding.EncodeToString(privateKey.PublicKey().Bytes()), nil
}
