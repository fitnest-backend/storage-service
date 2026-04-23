import crypto from 'node:crypto';
if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto;
}

import config from './src/config/storage.config.js';
import express from 'express';
import cors from 'cors';
import { initRedis } from './src/config/redis.js';
import 'dotenv/config';

console.log('Loading routes...');
import uploadRoutes from './src/routes/upload.routes.js';
import uploadController from './src/controllers/upload.controller.js';
const { streamFile } = uploadController;
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

// Global 404 handler for standardized response
import { getMessage, ApiResponse, ApiError } from './src/utils/response_util.js';
app.use((req, res) => {
    const lang = req.header('Accept-Language')?.startsWith('az') ? 'az' : (req.header('Accept-Language')?.startsWith('ru') ? 'ru' : 'en');
    const error = ApiError.builder()
        .code('NOT_FOUND')
        .message(getMessage('error.resource_not_found', lang))
        .status(404)
        .path(req.originalUrl)
        .build();
    res.status(404).json(ApiResponse.error(error));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Global Error Handler]', err);
    const lang = req.header('Accept-Language')?.startsWith('az') ? 'az' : (req.header('Accept-Language')?.startsWith('ru') ? 'ru' : 'en');
    const status = err.status || 500;
    const error = ApiError.builder()
        .code(status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR')
        .message(getMessage(status === 404 ? 'error.resource_not_found' : 'error.internal_server_error', lang))
        .status(status)
        .path(req.originalUrl)
        .build();
    res.status(status).json(ApiResponse.error(error));
});

console.log(`Starting server on port ${PORT}...`);
initRedis().then(() => {
    app.listen(PORT, () => {
        console.log(`Storage HTTP worker listening on port ${PORT}`);
    });
});
