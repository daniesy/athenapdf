package gcmd

import (
	"bytes"
	"errors"
	"fmt"
	"log"
	"os/exec"
	"syscall"
)

var (
	ErrCmdTerminated = errors.New("command terminated")
)

// Execute is a concurrent wrapper around Go's os/exec Output() method.
// It runs a command, and returns its standard output as a byte slice.
// If a long-running command is being executed, it can easily be killed at
// any time using the terminate channel as the process is spawned in a
// Goroutine.
func Execute(c []string, terminate <-chan struct{}) ([]byte, error) {
	cmd := exec.Command(c[0], c[1:]...)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
	cout := make(chan []byte, 1)
	cerr := make(chan error, 1)

	go func(cmd *exec.Cmd, cout chan<- []byte, cerr chan<- error) {
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		out, err := cmd.Output()
		// Whatever the command left behind in its group (a browser that outlived
		// its CLI) goes with it.
		killGroup(cmd)
		if err != nil {
			cerr <- fmt.Errorf("%+v : %+v", err, stderr.String())
			return
		}
		cout <- out
	}(cmd, cout, cerr)

	select {
	case out := <-cout:
		close(cerr)
		return out, nil
	case err := <-cerr:
		close(cout)
		return nil, err
	case <-terminate:
		log.Println("exiting")
		if err := killGroup(cmd); err != nil {
			return nil, err
		}
		return nil, ErrCmdTerminated
	}
}

// killGroup kills the command's whole process group. The converter command is
// a wrapper that spawns node, which spawns Chromium: killing only the wrapper
// (cmd.Process.Kill) left node and Chromium running for good — 11 abandoned
// conversions were still holding CPU and memory 214 days later (2026-11-25).
// Setpgid made the wrapper the leader of its own group, so -pid reaches every
// process it started. A group that is already gone is not an error.
func killGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err != nil && err != syscall.ESRCH {
		return err
	}
	return nil
}
