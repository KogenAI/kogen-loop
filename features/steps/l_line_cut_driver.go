//go:build ignore

package main

import (
	"encoding/json"
	"os"

	"kogen-loop/tools"
)

func main() {
	var text string
	if err := json.NewDecoder(os.Stdin).Decode(&text); err != nil {
		panic(err)
	}
	cut := tools.Cut(text)
	if err := json.NewEncoder(os.Stdout).Encode([]string{cut, tools.Cut(cut)}); err != nil {
		panic(err)
	}
}
