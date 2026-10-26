# kogen-loop

Standalone Go agent-loop library and CLI. Kogen owns delivery policy; this component owns model requests, tool execution and conversation handling.

## Current work

This first commit is a runnable foundation only. The loop extraction and caller contract are the next native Kogen feature. The existing external implementation remains a separate reference candidate; this scaffold does not claim that implementation.

## Start here

Run `go run . --help`, then `go test ./...`, `go vet ./...` and `go build ./...`.

## Folder map

- `main.go`: temporary standard-library CLI entry point.
- `go.mod`: official Go module initializer output.
- `.gitignore`: local build and operating-system outputs.

## Bootstrap provenance

26 October 2026: read live Studio guidance and fresh stack.menu generator policy. Selected the documented standard-library CLI route, so the initializer is `go mod init kogen-loop`; Cobra and Viper are not selected. Go produces module metadata only; this README and minimal runnable entry point are supplied application pieces. Native Kogen initialization and configuration review follow separately.
