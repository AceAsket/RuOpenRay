package main

import "github.com/AceAsket/RuOpenRay/internal/lan"

func dhcpLeases(dataDir string) []map[string]any {
	return lan.DHCPLeases(dataDir)
}

func dhcpLeaseReport(dataDir string) map[string]any {
	return lan.DHCPLeaseReport(dataDir)
}
