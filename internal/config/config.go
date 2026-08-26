package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	HTTPPort                   int
	GRPCPort                   int
	StorageDir                 string
	AzureStorageConnectionString string
	AzureStorageContainer        string
	RedisHost                  string
	RedisPort                  int
	RedisPassword              string
	RedisDB                    int
	LogLevel                   string
	JWTSecret                  string
}

func LoadConfig() (*Config, error) {
	httpPort := getEnvInt("HTTP_PORT", 8080)
	grpcPort := getEnvInt("STORAGE_PORT", getEnvInt("GRPC_PORT", 9090))
	storageDir := getEnv("LOCAL_STORAGE_DIR", "local_storage")

	connStr := getEnv("AZURE_STORAGE_CONNECTION_STRING", "")
	container := getEnv("AZURE_STORAGE_CONTAINER", "uploads")

	redisHost := getEnv("REDIS_HOST", "127.0.0.1")
	redisPort := getEnvInt("REDIS_PORT", 6379)
	redisPassword := getEnv("REDIS_PASSWORD", "")
	redisDB := getEnvInt("REDIS_DB", 0)

	logLevel := getEnv("LOG_LEVEL", "info")
	jwtSecret := getEnv("JWT_SECRET", "")

	return &Config{
		HTTPPort:                     httpPort,
		GRPCPort:                     grpcPort,
		StorageDir:                   storageDir,
		AzureStorageConnectionString: connStr,
		AzureStorageContainer:        container,
		RedisHost:                    redisHost,
		RedisPort:                    redisPort,
		RedisPassword:                redisPassword,
		RedisDB:                      redisDB,
		LogLevel:                     logLevel,
		JWTSecret:                    jwtSecret,
	}, nil
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if intVal, err := strconv.Atoi(val); err == nil {
			return intVal
		}
	}
	return defaultVal
}

func (c *Config) Validate() error {
	if c.AzureStorageConnectionString == "" {
		return fmt.Errorf("AZURE_STORAGE_CONNECTION_STRING is required")
	}
	if c.AzureStorageContainer == "" {
		return fmt.Errorf("AZURE_STORAGE_CONTAINER is required")
	}
	return nil
}
