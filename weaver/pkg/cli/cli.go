package cli

import (
	"log"
	"strings"
	"weaver/pkg/converter"
	"weaver/pkg/gcmd"
)

// Cli represents a conversion job for htmlconverter CLI.
// Cli implements the Converter interface with a custom Convert method.
type Cli struct {
	// Cli inherits properties from UploadConversion, and as such,
	// it supports uploading of its results to S3
	// (if the necessary credentials are given).
	// See UploadConversion for more information.
	converter.UploadConversion
	// CMD is the base htmlconverter CLI command that will be executed.
	// e.g. 'htmlconverter -S -T 120'
	CMD string
	// Aggressive will alter the htmlconverter CLI conversion behaviour by passing
	// an '-A' command-line flag to indicate aggressive content extraction
	// (ideal for a clutter-free reading experience).
	Aggressive bool
	// WaitForStatus will wait until window.status === WINDOW_STATUS
	WaitForStatus bool
}

// constructCMD returns a string array containing the Cli command to be
// executed by Go's os/exec Output. It does this using a base command, and path
// string.
// It will set an additional '-A' flag if aggressive is set to true.
// See htmlconverter CLI for more information regarding the aggressive mode.
func constructCMD(base string, path string, format string, aggressive bool, waitForStatus bool) []string {
	args := strings.Fields(base)
	args = append(args, path)
	if aggressive {
		args = append(args, "-A")
	}

	if format == "pdf" {
		args = append(args, "--pdf")
	} else {
		args = append(args, "--png")
	}

	if waitForStatus {
		args = append(args, "--wait-for-status")
	}
	return args
}

// Convert returns a byte slice containing a PDF converted from HTML
// using htmlconverter CLI.
// See the Convert method for Conversion for more information.
func (c Cli) Convert(s converter.ConversionSource, done <-chan struct{}) ([]byte, error) {
	format := s.GetConversionFormat()

	log.Printf("[CLI] converting to %s: %s\n", format, s.GetActualURI())

	// Construct the command to execute
	cmd := constructCMD(c.CMD, s.URI, format, c.Aggressive, c.WaitForStatus)

	log.Printf("[CLI] executing: %s\n", cmd)

	out, err := gcmd.Execute(cmd, done)
	if err != nil {
		return nil, err
	}

	return out, nil
}
