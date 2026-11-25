package gcmd

import (
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestExecute(t *testing.T) {
	testString := "test execute"
	mockTerminate := make(chan struct{}, 1)
	got, err := Execute([]string{"echo", testString}, mockTerminate)
	if err != nil {
		t.Fatalf("execute returned an unexpected error: %+v", err)
	}
	if want := []byte(testString + "\n"); !reflect.DeepEqual(got, want) {
		t.Errorf("expected output of executed command to be %+v, got %+v", want, got)
	}
}

func TestExecute_err(t *testing.T) {
	testString := "test execute"
	mockTerminate := make(chan struct{}, 1)
	got, err := Execute([]string{"echo-broken", testString}, mockTerminate)
	if err == nil {
		t.Fatalf("expected error to be returned")
	}
	if got != nil {
		t.Errorf("expected output of executed command to be nil, got %+v", got)
	}
}

func TestExecute_done(t *testing.T) {
	testString := "test execute"
	mockTerminate := make(chan struct{}, 1)
	close(mockTerminate)
	got, err := Execute([]string{"echo", testString}, mockTerminate)
	if err == nil {
		t.Fatalf("expected error to be returned")
	}
	if err != ErrCmdTerminated {
		t.Errorf("expected a command terminated error")
	}
	if got != nil {
		t.Errorf("expected output of executed command to be nil, got %+v", got)
	}
}

// A terminated command takes the processes it started with it: the converter
// CLI is a wrapper whose node child (and its Chromium) used to survive.
func TestExecute_terminateKillsTheWholeGroup(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "child.pid")
	terminate := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		_, err := Execute([]string{"sh", "-c", "sleep 60 & echo $! > " + pidFile + "; wait"}, terminate)
		done <- err
	}()

	var child int
	for i := 0; i < 100 && child == 0; i++ {
		time.Sleep(20 * time.Millisecond)
		if b, err := os.ReadFile(pidFile); err == nil {
			child, _ = strconv.Atoi(strings.TrimSpace(string(b)))
		}
	}
	if child == 0 {
		t.Fatal("the child process never started")
	}

	close(terminate)
	if err := <-done; err != ErrCmdTerminated {
		t.Fatalf("expected ErrCmdTerminated, got %v", err)
	}
	for i := 0; i < 100; i++ {
		if syscall.Kill(child, 0) == syscall.ESRCH {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	syscall.Kill(child, syscall.SIGKILL)
	t.Fatalf("child %d outlived its terminated command", child)
}

// A command that exits on its own does not leave a child running either.
func TestExecute_exitKillsLeftoverChildren(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "child.pid")
	// The child does not hold the output pipe (as Chromium, started by puppeteer
	// with its own pipes, does not), so the command returns at once.
	_, err := Execute([]string{"sh", "-c", "sleep 60 >/dev/null 2>&1 & echo $! > " + pidFile}, make(chan struct{}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	child, _ := strconv.Atoi(strings.TrimSpace(string(b)))
	for i := 0; i < 100; i++ {
		if syscall.Kill(child, 0) == syscall.ESRCH {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	syscall.Kill(child, syscall.SIGKILL)
	t.Fatalf("child %d outlived its command", child)
}
