const express = require('express');
const cors = require('cors');

console.log('Loading routes...');
const uploadRoutes = require('./src/routes/upload.routes');
const authRoutes = require('./src/routes/auth.routes');
const { streamTeraboxFile } = require('./src/controllers/upload.controller');
console.log('Routes loaded');

const app = express();
const PORT = process.env.TERABOX_WORKER_PORT || 9090;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Internal auth middleware
const internalAuthMiddleware = (req, res, next) => {
    const token = req.headers['x-internal-token'];
    console.log('Auth middleware: Headers:', JSON.stringify(req.headers));
    console.log(`Auth middleware: Token: ${token}`);

    if (token === 'shared-secret-token') {
        return next();
    }
    return res.status(403).json({ error: 'Forbidden: Invalid internal token' });
};

// Apply to upload routes
app.use('/api/v1/files', internalAuthMiddleware);

app.use('/api/v1/files', uploadRoutes);
app.use('/api/v1/auth', authRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});

console.log(`Starting server on port ${PORT}...`);
app.listen(PORT, () => {
    console.log(`TeraBox HTTP worker listening on port ${PORT}`);
});
