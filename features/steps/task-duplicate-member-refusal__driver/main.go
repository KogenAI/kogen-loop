package main

import (
	"encoding/json"
	"log"
	"os"

	"github.com/KogenAI/kogen-loop/api"
)

func main() {
	task, err := api.DecodeTask(os.Stdin)
	var result struct {
		Task  *api.Task `json:"task"`
		Error *string   `json:"error"`
	}
	if err != nil {
		detail := err.Error()
		result.Error = &detail
	} else {
		result.Task = &task
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		log.Fatal(err)
	}
}
