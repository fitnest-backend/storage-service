import express from 'express';
import uploadController from '../controllers/upload.controller.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwtAuthMiddleware from '../utils/jwtAuthMiddleware.js';

const router = express.Router();
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

router.post('/upload', jwtAuthMiddleware, upload.single('file'), uploadController.uploadFile);
router.get('/', jwtAuthMiddleware, uploadController.getFileList);
router.get('/download', jwtAuthMiddleware, uploadController.downloadFile);
router.delete('/', jwtAuthMiddleware, uploadController.deleteFiles);
router.put('/move', jwtAuthMiddleware, uploadController.moveFile);
router.get('/stream/:fileId', jwtAuthMiddleware, uploadController.streamFile);

// If you want any route to be public, remove jwtAuthMiddleware from that route.

export default router;
