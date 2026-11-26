package main

import (
	"fmt"
	"math"
	"os"
	"strconv"

	"github.com/KogenAI/kogen-loop/provider"
)

func count(s string) *int {
	var n int
	switch s {
	case "max":
		n = math.MaxInt
	case "max-1":
		n = math.MaxInt - 1
	case "max-2":
		n = math.MaxInt - 2
	default:
		var err error
		n, err = strconv.Atoi(s)
		if err != nil || n < 0 {
			fmt.Fprintf(os.Stderr, "invalid fixture count %q\n", s)
			os.Exit(2)
		}
	}
	return &n
}

func main() {
	if len(os.Args) != 8 {
		fmt.Fprintln(os.Stderr, "expected input cached write write30m write12h output reasoning")
		os.Exit(2)
	}
	a := os.Args[1:]
	u := provider.KnownUsage{
		Input: count(a[0]), Cached: count(a[1]), Write: count(a[2]),
		Write30m: count(a[3]), Write12h: count(a[4]),
		Output: count(a[5]), Reasoning: count(a[6]),
	}
	fmt.Println(u.State())
}
