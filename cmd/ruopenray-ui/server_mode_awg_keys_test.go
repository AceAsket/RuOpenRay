package main

import (
	"encoding/base64"
	"testing"
)

func TestGenerateServerModeAWGKeyPair(t *testing.T) {
	privateKey, publicKey, err := generateServerModeAWGKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	privateBytes, err := base64.StdEncoding.DecodeString(privateKey)
	if err != nil || len(privateBytes) != 32 {
		t.Fatalf("invalid private key: len=%d err=%v", len(privateBytes), err)
	}
	publicBytes, err := base64.StdEncoding.DecodeString(publicKey)
	if err != nil || len(publicBytes) != 32 {
		t.Fatalf("invalid public key: len=%d err=%v", len(publicBytes), err)
	}
	if privateBytes[0]&7 != 0 || privateBytes[31]&128 != 0 || privateBytes[31]&64 == 0 {
		t.Fatalf("private key is not clamped: first=%08b last=%08b", privateBytes[0], privateBytes[31])
	}
	if !amneziaLooksLikeWGKey(privateKey) || !amneziaLooksLikeWGKey(publicKey) {
		t.Fatalf("generated keys do not pass AWG validation")
	}
}
