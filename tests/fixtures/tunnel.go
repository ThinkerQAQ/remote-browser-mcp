// Synthetic local Tunnel used only by verify-startup.mjs; never calls OpenAI.
package main

import (
	"encoding/json"
	"net/http"
	"os"
)

func main() {
	if os.Getenv("OPENAI_API_KEY") != "synthetic-startup-key" {
		os.Exit(2)
	}
	var config struct {
		Health struct {
			Address string `json:"listen_addr"`
		} `json:"health"`
	}
	raw, err := os.ReadFile(os.Args[len(os.Args)-1])
	if err != nil {
		os.Exit(3)
	}
	if json.Unmarshal(raw, &config) != nil {
		os.Exit(4)
	}
	http.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	if http.ListenAndServe(config.Health.Address, nil) != nil {
		os.Exit(5)
	}
}
