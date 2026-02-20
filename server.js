if (!globalThis.crypto) {
    const { webcrypto } = require('node:crypto');
    globalThis.crypto = webcrypto;
}

const config = require('./src/config/storage.config');
const express = require('express');
const cors = require('cors');
const { initRedis } = require('./src/config/redis');

console.log('Loading routes...');
const uploadRoutes = require('./src/routes/upload.routes');
const { streamFile } = require('./src/controllers/upload.controller');
console.log('Routes loaded');

const app = express();
const PORT = config.server.port || 9090;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const patternAMiddleware = (req, res, next) => {
    const gatewayFlag = req.header('X-From-Gateway');
    const userId = req.header('X-User-Id');
    const requestId = req.header('X-Request-Id');
    const caller = req.header('X-Service-Name');

    if (gatewayFlag === '1' && userId) {
        req.user = {
            id: userId,
            requestId: requestId,
            caller: caller,
            tenantId: req.header('X-Tenant-Id'),
            scopes: req.header('X-Scopes')?.split(' ') || []
        };
        console.log(`[HTTP] Authenticated user ${userId} via Pattern A (from ${caller})`);
    }
    next();
};

app.use(patternAMiddleware);

app.use('/api/v1/files', uploadRoutes);
app.get('/stream/:fileId', streamFile);
// New: expose a media streaming endpoint matching other services' URL pattern
app.get('/api/v1/media/stream/:fileId', streamFile);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});

console.log(`Starting server on port ${PORT}...`);
initRedis().then(() => {
    app.listen(PORT, () => {
        console.log(`Storage HTTP worker listening on port ${PORT}`);
    });
});
