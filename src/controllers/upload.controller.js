const storageService = require('../services/mega.service');
const fs = require('fs').promises;

async function uploadFile(req, res) {
    try {
        const file = req.file;
        if (!file) {
            console.error('Upload attempt with no file');
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        console.log(`Received file: ${file.originalname}, stored at: ${file.path}, size: ${file.size}`);

        const directory = req.query.directory || req.body.directory;
        let finalDirectory = '/uploads'; // default
        if (req.body.type === 'profile') {
            finalDirectory = '/profiles';
        } else if (req.body.type === 'goal') {
            finalDirectory = '/goals';
        } else if (directory) {
            finalDirectory = directory;
        }
        console.log(`Uploading to MEGA directory: ${finalDirectory}`);

        const result = await storageService.uploadFile(file.path, finalDirectory);
        console.log('MEGA service result:', JSON.stringify(result));

        // Clean up temp file
        try {
            await fs.unlink(file.path);
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
            console.error('MEGA upload failed logic:', result.message);
            res.status(500).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        console.error('Upload controller error:', error);
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Failed to clean up temp file in error handler:', unlinkError);
            }
        }
        res.status(500).json({
            success: false,
            message: error.message || 'Upload failed'
        });
    }
}

async function getFileList(req, res) {
    try {
        const directory = req.query.directory || '/';
        const result = await storageService.fetchFileList(directory);
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
        const fileId = req.query.fileId || req.params.fileId;
        if (!fileId) {
            return res.status(400).json({ success: false, message: 'fileId query parameter is required' });
        }

        const result = await storageService.downloadFile(fileId);
        res.json({
            success: true,
            message: 'Download URL generated',
            download_url: result.dlink
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
        const paths = req.body;
        if (!paths || !Array.isArray(paths)) {
            return res.status(400).json({ success: false, message: 'paths array is required' });
        }

        const result = await storageService.deleteFiles(paths);
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

        const result = await storageService.moveFiles([{ path: old_path, dest: new_path, newname: new_name }]);
        res.json(result);
    } catch (error) {
        console.error('Move error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Move failed'
        });
    }
}

async function streamFile(req, res) {
    try {
        const fileId = req.params.fileId || req.params.fsId;
        const { stream, contentLength, contentType, filename } = await storageService.getFileStream(fileId);

        if (contentType) res.setHeader("Content-Type", contentType);
        if (contentLength) res.setHeader("Content-Length", contentLength);
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.setHeader("Cache-Control", "public, max-age=3600");

        stream.pipe(res);

        stream.on('error', (err) => {
            console.error('[UploadController] Stream error:', err);
            if (!res.headersSent) {
                res.status(500).send('Stream error');
            }
        });
    } catch (e) {
        console.error('[UploadController] Stream failed:', e);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: e.message || "stream failed" });
        }
    }
}

module.exports = {
    uploadFile,
    getFileList,
    downloadFile,
    deleteFiles,
    moveFile,
    streamFile
};
