package storage

import (
	"testing"
)

func TestHashNodeID(t *testing.T) {
	tests := []struct {
		nodeID   string
		expected int64
	}{
		{"", 0},
		{"bpRBVTwa", 2024074758},
	}

	for _, tt := range tests {
		got := HashNodeID(tt.nodeID)
		if got != tt.expected {
			t.Errorf("HashNodeID(%q) = %d; want %d", tt.nodeID, got, tt.expected)
		}
	}
}
