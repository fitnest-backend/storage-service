const TeraboxUploader = require('terabox-upload-tool');
const config = require('../config/terabox.config');

const uploader = new TeraboxUploader(config.credentials);

async function uploadFile(filePath, directory = '/') {
    try {
        const result = await uploader.uploadFile(filePath, false, directory);
        return result;
    } catch (error) {
        throw error;
    }
}

async function fetchFileList(directory = '/') {
    try {
        const result = await uploader.fetchFileList(directory);
        return result;
    } catch (error) {
        throw error;
    }
}

async function downloadFile(fileId) {
    try {
        const result = await uploader.downloadFile(fileId);
        return result;
    } catch (error) {
        throw error;
    }
}

async function deleteFiles(paths) {
    try {
        const result = await uploader.deleteFiles(paths.map(path => ({ path })));
        return result;
    } catch (error) {
        throw error;
    }
}

async function moveFile(oldPath, newPath, newName) {
    try {
        const result = await uploader.moveFiles(oldPath, newPath, newName);
        return result;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    uploadFile,
    fetchFileList,
    downloadFile,
    deleteFiles,
    moveFile
};
