package vault

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	vault "github.com/hashicorp/vault/api"
)

type Client struct {
	client *vault.Client
}

func NewClient(vaultAddr string) (*Client, error) {
	if vaultAddr == "" {
		vaultAddr = os.Getenv("VAULT_ADDR")
	}
	if vaultAddr == "" {
		vaultAddr = "https://vault.fitnest.az"
	}

	config := vault.DefaultConfig()
	config.Address = vaultAddr

	// Configure TLS: allow insecure in internal kubernetes cluster if needed
	if os.Getenv("NODE_TLS_REJECT_UNAUTHORIZED") == "0" || os.Getenv("VAULT_SKIP_VERIFY") == "true" {
		if err := config.ConfigureTLS(&vault.TLSConfig{Insecure: true}); err != nil {
			return nil, fmt.Errorf("failed to configure TLS: %w", err)
		}
	}

	client, err := vault.NewClient(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create vault client: %w", err)
	}

	return &Client{client: client}, nil
}

func (c *Client) LoginAppRole(roleID, secretID string) error {
	if roleID == "" {
		roleID = os.Getenv("VAULT_ROLE_ID")
	}
	if secretID == "" {
		secretID = os.Getenv("VAULT_SECRET_ID")
	}

	if roleID == "" || secretID == "" {
		return fmt.Errorf("VAULT_ROLE_ID and VAULT_SECRET_ID must be provided")
	}

	data := map[string]interface{}{
		"role_id":   roleID,
		"secret_id": secretID,
	}

	resp, err := c.client.Logical().Write("auth/approle/login", data)
	if err != nil {
		return fmt.Errorf("approle login failed: %w", err)
	}

	if resp.Auth == nil || resp.Auth.ClientToken == "" {
		return fmt.Errorf("no client token returned from approle login")
	}

	c.client.SetToken(resp.Auth.ClientToken)
	return nil
}

func (c *Client) LoadSecrets(secretPath string) (map[string]string, error) {
	if secretPath == "" {
		secretPath = "secrets/data/storage-backend/production"
	}

	// Normalize kv v2 path
	normalizedPath := secretPath
	if strings.HasPrefix(normalizedPath, "secrets/") && !strings.HasPrefix(normalizedPath, "secrets/data/") {
		normalizedPath = strings.Replace(normalizedPath, "secrets/", "secrets/data/", 1)
	}

	secret, err := c.client.Logical().Read(normalizedPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read secret at %s: %w", normalizedPath, err)
	}

	if secret == nil || secret.Data == nil {
		return nil, fmt.Errorf("no secret data found at %s", normalizedPath)
	}

	// KV v2 stores data inside secret.Data["data"]
	var dataMap map[string]interface{}
	if inner, ok := secret.Data["data"].(map[string]interface{}); ok {
		dataMap = inner
	} else {
		dataMap = secret.Data
	}

	result := make(map[string]string)
	for k, v := range dataMap {
		if strVal, ok := v.(string); ok {
			result[k] = strVal
			// Also set in os.Environ for parity
			os.Setenv(k, strVal)
		} else {
			str := fmt.Sprintf("%v", v)
			result[k] = str
			os.Setenv(k, str)
		}
	}

	return result, nil
}

// StartAutoRenew renews the AppRole token periodically
func (c *Client) StartAutoRenew(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if _, err := c.client.Auth().Token().RenewSelf(0); err != nil {
					fmt.Printf("[Vault] Warning: token renew failed: %v\n", err)
				}
			}
		}
	}()
}
