package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strconv"

	"github.com/KogenAI/kogen-loop/api"
	"github.com/KogenAI/kogen-loop/loop"
)

func count(text string) *int {
	var n int
	switch text {
	case "nil":
		return nil
	case "max":
		n = math.MaxInt
	case "max-1":
		n = math.MaxInt - 1
	case "max-2":
		n = math.MaxInt - 2
	default:
		var err error
		n, err = strconv.Atoi(text)
		if err != nil {
			panic(err)
		}
	}
	return &n
}

func run() error {
	var rows [][]string
	if err := json.NewDecoder(os.Stdin).Decode(&rows); err != nil {
		return err
	}
	usages := make([]api.Usage, 0, len(rows))
	for _, row := range rows {
		if len(row) != 4 {
			return fmt.Errorf("expected four category values, got %q", row)
		}
		usages = append(usages, api.Usage{
			Input: count(row[0]), Cached: count(row[1]), Output: count(row[2]), Reasoning: count(row[3]),
		})
	}
	return json.NewEncoder(os.Stdout).Encode(struct {
		IntSize int       `json:"int_size"`
		Usage   api.Usage `json:"usage"`
	}{strconv.IntSize, loop.SumUsage(usages...)})
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
