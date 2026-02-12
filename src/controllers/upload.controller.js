const teraboxService = require('../services/terabox.service');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function uploadFile(req, res) {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Save the file temporarily
        const tempPath = path.join(os.tmpdir(), 'upload-' + Date.now() + path.extname(file.originalname));
        fs.writeFileSync(tempPath, file.buffer);

        const directory = req.body.directory || '/uploads';
        const result = await teraboxService.uploadFile(tempPath, directory);

        // Clean up temp file
        try {
            fs.unlinkSync(tempPath);
        } catch (cleanupErr) {
            console.error('Failed to clean up temp file:', cleanupErr);
        }

        if (result.success) {
            res.json({
                success: true,
                message: 'File uploaded successfully',
                data: result.fileDetails
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Upload failed'
        });
    }
}

async function getFileList(req, res) {
    try {
        const directory = req.query.directory || '/';
        const result = await teraboxService.fetchFileList(directory);
        res.json(result);
    } catch (error) {
        console.error('Fetch file list error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Fetch file list failed'
        });
    }
}

async function downloadFile(req, res) {
    try {
        const fileId = req.params.fileId;
        if (!fileId) {
            return res.status(400).json({ success: false, message: 'fileId is required' });
        }

        const result = await teraboxService.downloadFile(fileId);
        res.json({
            success: true,
            message: 'Download URL generated',
            download_url: result
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Download failed'
        });
    }
}

async function deleteFiles(req, res) {
    try {
        const paths = req.body.paths;
        if (!paths || !Array.isArray(paths)) {
            return res.status(400).json({ success: false, message: 'paths array is required' });
        }

        const result = await teraboxService.deleteFiles(paths);
        res.json(result);
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Delete failed'
        });
    }
}

async function moveFile(req, res) {
    try {
        const { old_path, new_path, new_name } = req.body;
        if (!old_path || !new_path) {
            return res.status(400).json({ success: false, message: 'old_path and new_path are required' });
        }

        const result = await teraboxService.moveFile(old_path, new_path, new_name);
        res.json(result);
    } catch (error) {
        console.error('Move error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Move failed'
        });
    }
}

module.exports = {
    uploadFile,
    getFileList,
    downloadFile,
    deleteFiles,
    moveFile
};
