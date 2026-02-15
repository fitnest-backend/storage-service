const teraboxService = require('../services/terabox.service');
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
        console.log(`Uploading to TeraBox directory: ${finalDirectory}`);

        const result = await teraboxService.uploadFile(file.path, finalDirectory);
        console.log('TeraBox service result:', JSON.stringify(result));

        // Clean up temp file
        try {
            await fs.unlink(file.path);
        } catch (cleanupErr) {
            console.error('Failed to clean up temp file:', cleanupErr);
        }

        if (result.success) {
            // Clean up extra root directories after successful upload
            try {
                const cleanupResult = await teraboxService.cleanupRoot();
                console.log('Cleanup result:', cleanupResult);
            } catch (cleanupErr) {
                console.error('Failed to clean up root directories:', cleanupErr);
            }

            res.json({
                success: true,
                message: 'File uploaded successfully',
                data: result.fileDetails
            });
        } else {
            console.error('TeraBox upload failed logic:', result.message);
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
                // Log the error but don't fail the main request because of cleanup failure
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
        const result = await teraboxService.fetchFileList(directory);
        if (result.success && result.data && result.data.list) {
            // Add download URLs for files
            const files = result.data.list.filter(item => item.isdir === 0); // files only
            const urlPromises = files.map(async (file) => {
                try {
                    const downloadResult = await teraboxService.downloadFile(file.fs_id);
                    file.download_url = downloadResult; // assuming downloadFile returns the URL
                } catch (err) {
                    console.error(`Failed to get download URL for ${file.fs_id}:`, err);
                    file.download_url = null;
                }
            });
            await Promise.all(urlPromises);
        }
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
        const paths = req.body;
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

async function cleanupRoot(req, res) {
    try {
        const result = await teraboxService.cleanupRoot();
        res.json(result);
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Cleanup failed'
        });
    }
}

module.exports = {
    uploadFile,
    getFileList,
    downloadFile,
    deleteFiles,
    moveFile,
    cleanupRoot
};
