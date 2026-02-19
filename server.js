const config = require('./src/config/terabox.config');
const express = require('express');
const cors = require('cors');
const { initRedis } = require('./src/config/redis');

console.log('Loading routes...');
const uploadRoutes = require('./src/routes/upload.routes');
const authRoutes = require('./src/routes/auth.routes');
const { streamTeraboxFile } = require('./src/controllers/upload.controller');
console.log('Routes loaded');

const app = express();
const PORT = config.server.port || 9090;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/files', uploadRoutes);
app.use('/api/v1/auth', authRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});

console.log(`Starting server on port ${PORT}...`);
initRedis().then(() => {
    app.listen(PORT, () => {
        console.log(`TeraBox HTTP worker listening on port ${PORT}`);
    });
});
