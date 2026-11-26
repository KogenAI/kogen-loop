package main

import (
	"encoding/json"
	"log"
	"os"

	"github.com/KogenAI/kogen-loop/api"
)

func main() {
	var event api.Event
	if err := json.NewDecoder(os.Stdin).Decode(&event); err != nil {
		log.Fatal(err)
	}
	data, err := event.MarshalJSON()
	result := struct {
		JSON  string  `json:"json"`
		Error *string `json:"error"`
	}{JSON: string(data)}
	if err != nil {
		message := err.Error()
		result.Error = &message
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		log.Fatal(err)
	}
}
