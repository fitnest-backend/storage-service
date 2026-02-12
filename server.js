const express = require('express');
const cors = require('cors');

const uploadRoutes = require('./src/routes/upload.routes');

const app = express();
const PORT = process.env.TERABOX_WORKER_PORT || 9090;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/upload', uploadRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});

app.listen(PORT, () => {
    console.log(`TeraBox HTTP worker listening on port ${PORT}`);
});
