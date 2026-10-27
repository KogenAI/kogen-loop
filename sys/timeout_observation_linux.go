//go:build linux

package sys

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

func timeoutGroupAlive(pgid int) (bool, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return false, err
	}
	alive := false
	for _, entry := range entries {
		if _, err := strconv.Atoi(entry.Name()); err != nil {
			continue
		}
		data, err := os.ReadFile("/proc/" + entry.Name() + "/stat")
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return false, err
		}
		// comm may itself contain spaces and parentheses. Required fields after it
		// are state, ppid, pgrp; do not discard zombie state Z.
		end := strings.LastIndexByte(string(data), ')')
		if end < 0 {
			return false, fmt.Errorf("invalid proc stat")
		}
		fields := strings.Fields(string(data[end+1:]))
		if len(fields) < 3 {
			return false, fmt.Errorf("short proc stat")
		}
		group, err := strconv.Atoi(fields[2])
		if err != nil {
			return false, err
		}
		if group == pgid {
			alive = true
		}
	}
	return alive, nil
}
