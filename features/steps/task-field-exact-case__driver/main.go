package main

import (
	"encoding/json"
	"log"
	"os"

	"github.com/KogenAI/kogen-loop/api"
)

func main() {
	var result struct {
		Task  *api.Task `json:"task"`
		Error *string   `json:"error"`
	}
	task, err := api.DecodeTask(os.Stdin)
	if err != nil {
		message := err.Error()
		result.Error = &message
	} else {
		result.Task = &task
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		log.Fatal(err)
	}
}
