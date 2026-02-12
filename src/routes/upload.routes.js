const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('file'), uploadController.uploadFile);
router.get('/files', uploadController.getFileList);
router.get('/download/:fileId', uploadController.downloadFile);
router.delete('/files', uploadController.deleteFiles);
router.put('/move', uploadController.moveFile);

module.exports = router;
