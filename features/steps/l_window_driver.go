//go:build ignore

package main

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"

	"kogen-loop/loop"
	"kogen-loop/provider"
	"kogen-loop/sys"
	"kogen-loop/tools"
)

func main() {
	budget, err := strconv.Atoi(os.Args[1])
	if err != nil {
		panic(err)
	}
	size, err := strconv.Atoi(os.Args[2])
	if err != nil {
		panic(err)
	}
	client := provider.NewClient("")
	r := loop.Request{Role: provider.Role{Provider: "chatgpt", Model: "gpt-6.1-sol", Effort: "high"}, Input: []any{}}
	body := client.Body(provider.Request{Role: r.Role, Input: r.Input})
	m, err := tools.Measure(body, r.Role)
	if err != nil {
		panic(err)
	}
	if size < m.RenderedBytes {
		panic("requested size below fixture envelope")
	}
	r.Instructions = strings.Repeat("a", size-m.RenderedBytes)
	p := loop.FailOverBudget{Client: client}
	field := reflect.ValueOf(&p).Elem().FieldByName("InputBudgetBytes")
	if !field.IsValid() {
		fmt.Println("missing InputBudgetBytes option")
		return
	}
	field.SetInt(int64(budget))
	_, err = p.Prepare(context.Background(), r)
	if err == nil {
		fmt.Println("pass")
	} else if e, ok := sys.AsError(err); ok {
		fmt.Println(e.Class + "/" + e.Reason)
	} else {
		fmt.Println(err.Error())
	}
}
