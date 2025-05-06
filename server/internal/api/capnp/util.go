package net

import (
	"log"
	"path"
	"reflect"
	"runtime"

	"capnproto.org/go/capnp/v3"
)

// CopyCapnValue calls get(); on error it logs "failed to get <getterName>: <err>"
// Otherwise it calls set(v); on error it logs "failed to set <setterName>: <err>".
// Returns false on any error, true on success.
func CopyErrorValue[T any](get func() (T, error), set func(T) error) bool {
	v, err := get()
	if err != nil {
		log.Printf("failed to get %s: %v", funcName(get), err)
		return false
	}
	if err := set(v); err != nil {
		log.Printf("failed to set %s: %v", funcName(set), err)
		return false
	}
	return true
}

func Deserialize[T any](data []byte, get func(*capnp.Message) (T, error)) (T, error) {
	msg, err := capnp.Unmarshal(data)
	if err != nil {
		log.Printf("unmarshal error: %v", err)
		var zero T
		return zero, err
	}
	return get(msg)
}

// funcName extracts the base name of any function via reflection/runtime.
func funcName(fn interface{}) string {
	pc := reflect.ValueOf(fn).Pointer()
	f := runtime.FuncForPC(pc)
	if f == nil {
		return "<unknown>"
	}
	// strip path, leave only package+func or closure name
	return path.Base(f.Name())
}
