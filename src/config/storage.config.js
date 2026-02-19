const config = {
    credentials: {
        email: process.env.STORAGE_EMAIL || 'fitnestazerbaijan@gmail.com',
        password: process.env.STORAGE_PASSWORD || 'Fitnest@@'
    },
    server: {
        port: process.env.STORAGE_PORT || 9090,
        logLevel: process.env.LOG_LEVEL || 'info'
    }
};

module.exports = config;
