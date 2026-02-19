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

app.use('/api/v1/files', uploadRoutes);
app.get('/stream/:fileId', streamFile);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});

console.log(`Starting server on port ${PORT}...`);
initRedis().then(() => {
    app.listen(PORT, () => {
        console.log(`Storage HTTP worker listening on port ${PORT}`);
    });
});
