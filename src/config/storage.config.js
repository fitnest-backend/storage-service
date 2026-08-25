const config = {
    azure: {
        connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
        containerName: process.env.AZURE_STORAGE_CONTAINER || 'media'
    },
    credentials: {
        email: process.env.STORAGE_EMAIL || '',
        password: process.env.STORAGE_PASSWORD || ''
    },
    server: {
        port: process.env.STORAGE_PORT || 9090,
        logLevel: process.env.LOG_LEVEL || 'info'
    }
};

export default config;

