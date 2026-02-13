const TeraboxUploader = require('terabox-upload-tool');
const config = require('../config/terabox.config');

class TeraboxService {
    constructor() {
        this.uploader = new TeraboxUploader(config.credentials);
    }

    async uploadFile(filePath, directory = '/uploads', showProgress = false) {
        try {
            // Re-order arguments if needed by the tool, media-service uses (filePath, showProgress, directory)
            const result = await this.uploader.uploadFile(filePath, showProgress, directory);
            return {
                success: result.success,
                fileDetails: result.fileDetails,
                message: result.message
            };
        } catch (error) {
            console.error('TeraBoxUploader.uploadFile error:', error);
            throw new Error(`Upload failed: ${error.message}`);
        }
    }

    async fetchFileList(directory = '/') {
        try {
            const fileList = await this.uploader.fetchFileList(directory);
            return fileList;
        } catch (error) {
            throw new Error(`Failed to fetch files: ${error.message}`);
        }
    }

    async downloadFile(fileId) {
        try {
            const result = await this.uploader.downloadFile(fileId);
            return result;
        } catch (error) {
            throw new Error(`Download failed: ${error.message}`);
        }
    }

    async deleteFiles(filePaths) {
        try {
            const result = await this.uploader.deleteFiles(filePaths);
            return result;
        } catch (error) {
            throw new Error(`Delete failed: ${error.message}`);
        }
    }

    async moveFile(oldPath, newPath, newName) {
        try {
            const result = await this.uploader.moveFiles(oldPath, newPath, newName);
            return result;
        } catch (error) {
            throw new Error(`Move failed: ${error.message}`);
        }
    }
}

module.exports = new TeraboxService();
