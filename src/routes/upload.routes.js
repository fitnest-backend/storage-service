const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = './temp_uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

router.post('/upload', upload.single('file'), uploadController.uploadFile);
router.get('/', uploadController.getFileList);
router.get('/download', uploadController.downloadFile);
router.delete('/', uploadController.deleteFiles);
router.put('/move', uploadController.moveFile);
router.delete('/cleanup', uploadController.cleanupRoot);

module.exports = router;
