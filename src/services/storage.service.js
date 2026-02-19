const { Storage } = require('megajs');
const fs = require('fs');
const path = require('path');
const config = require('../config/storage.config');

class StorageService {
    static hashNodeId(nodeId) {
        if (!nodeId) return 0;
        const hash = nodeId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return Math.abs(hash);
    }

    constructor() {
        this.storage = null;
        this.initialized = false;
        this.initializationPromise = this._initialize();
    }

    async _initialize() {
        if (this.initialized) return;
        try {
            console.log('[StorageService] Initializing storage...');
            this.storage = new Storage({
                email: config.credentials.email,
                password: config.credentials.password,
                autologin: true
            });

            await this.storage.ready;
            this.initialized = true;
            console.log('[StorageService] Storage service initialized. User:', this.storage.name);
        } catch (error) {
            console.error('[StorageService] Failed to initialize storage:', error);
            throw error;
        }
    }

    async ensureInitialized() {
        await this.initializationPromise;
        if (!this.initialized) {
            throw new Error('StorageService not initialized. Check credentials or network.');
        }
    }

    async uploadFile(filePath, directory = '/', oldPath = null) {
        await this.ensureInitialized();
        try {
            const fileName = path.basename(filePath);
            const fileSize = fs.statSync(filePath).size;

            console.log(`[StorageService] Uploading ${fileName} to ${directory}...`);

            // Find or create directory
            const targetFolder = await this._getOrCreateFolder(directory);

            // 1. Delete explicit old path if provided
            if (oldPath) {
                console.log(`[StorageService] Explicit old path provided: ${oldPath}. Deleting...`);
                try {
                    const oldFile = await this._getFileOrFolder(oldPath);
                    if (oldFile) {
                        await oldFile.delete();
                    }
                } catch (delErr) {
                    console.warn(`[StorageService] Failed to delete explicit old path ${oldPath}:`, delErr.message);
                }
            }

            // 2. Fallback: Delete existing file if it exists with the same name in the target folder
            const children = Array.isArray(targetFolder.children) ? targetFolder.children : Object.values(targetFolder.children || {});
            const existingFile = children.find(f => f.name === fileName && !f.directory);
            if (existingFile) {
                console.log(`[StorageService] Existing file found with same name: ${fileName}. Deleting...`);
                try {
                    await existingFile.delete();
                } catch (delErr) {
                    console.warn(`[StorageService] Failed to delete existing same-name file ${fileName}:`, delErr.message);
                }
            }

            console.log(`[StorageService] Starting upload of ${fileName}...`);
            const fileStream = fs.createReadStream(filePath);
            const upload = targetFolder.upload({
                name: fileName,
                size: fileSize
            });

            fileStream.pipe(upload);

            const uploadedFile = await upload.complete;
            console.log('[StorageService] Upload complete:', uploadedFile.name);

            return {
                success: true,
                message: 'File uploaded successfully',
                fileDetails: {
                    name: uploadedFile.name,
                    size: uploadedFile.size,
                    path: path.join(directory, uploadedFile.name),
                    nodeId: uploadedFile.nodeId
                }
            };
        } catch (error) {
            console.error('[StorageService] Upload failed:', error.message);
            return { success: false, message: error.message };
        }
    }

    async createDirectory(directoryPath) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Creating directory: ${directoryPath}`);
            await this._getOrCreateFolder(directoryPath);
            return { success: true, message: 'Directory created or already exists' };
        } catch (error) {
            console.error('[StorageService] Create directory failed:', error.message);
            return { success: false, message: error.message };
        }
    }

    async fetchFileList(directory = '/') {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Fetching file list for: ${directory}`);
            const folder = await this._getFolder(directory);
            if (!folder) throw new Error('Directory not found');

            const list = Object.values(folder.children || []).map(file => ({
                name: file.name,
                size: file.size,
                directory: file.directory,
                timestamp: file.timestamp,
                nodeId: file.nodeId
            }));

            return { success: true, data: { list } };
        } catch (error) {
            console.error('[StorageService] Fetch file list failed:', error.message);
            return { success: false, message: error.message };
        }
    }

    async deleteFiles(paths) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Deleting paths: ${JSON.stringify(paths)}`);
            for (const p of paths) {
                const file = await this._getFileOrFolder(p);
                if (file) {
                    await file.delete();
                }
            }
            return { success: true, message: 'Paths deleted successfully' };
        } catch (error) {
            console.error('[StorageService] Delete failed:', error.message);
            return { success: false, message: error.message };
        }
    }

    async moveFiles(fileList) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Moving files: ${JSON.stringify(fileList)}`);
            for (const item of fileList) {
                const file = await this._getFileOrFolder(item.path);
                const destFolder = await this._getOrCreateFolder(item.dest);
                if (file && destFolder) {
                    await file.moveTo(destFolder);
                    if (item.newname) {
                        await file.rename(item.newname);
                    }
                }
            }
            return { success: true, message: 'Files moved successfully' };
        } catch (error) {
            console.error('[StorageService] Move failed:', error.message);
            return { success: false, message: error.message };
        }
    }

    async downloadFile(fileId) {
        // MEGA uses nodeIds. This assumes fileId is the nodeId.
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Getting download URL for: ${fileId}`);
            const file = await this._getFileById(fileId);
            if (!file) throw new Error('File not found');

            const url = await file.link();
            return { success: true, dlink: url };
        } catch (error) {
            console.error('[StorageService] Download URL retrieval failed:', error.message);
            throw error;
        }
    }

    async getFileStream(fileId) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Getting file stream for: ${fileId}`);
            const file = await this._getFileById(fileId);
            if (!file) throw new Error('File not found');

            return {
                stream: file.download(),
                contentLength: file.size,
                contentType: 'application/octet-stream', // Generic
                filename: file.name
            };
        } catch (error) {
            console.error('[StorageService] Get file stream failed:', error.message);
            throw error;
        }
    }

    async _getFileById(id) {
        await this.ensureInitialized();
        const idNum = parseInt(id, 10);
        for (const f of Object.values(this.storage.files)) {
            // Check literal nodeId
            if (f.nodeId === id) return f;
            // Check hashed fsId
            if (!isNaN(idNum) && StorageService.hashNodeId(f.nodeId) === idNum) return f;
        }
        return null;
    }

    // Helper to traverse or create folder structure
    async _getOrCreateFolder(folderPath) {
        console.log(`[StorageService] _getOrCreateFolder: ${folderPath}`);
        if (folderPath === '/' || folderPath === '') return this.storage.root;

        const parts = folderPath.split('/').filter(p => p);
        let current = this.storage.root;

        for (const part of parts) {
            console.log(`[StorageService] Looking for part: ${part} in ${current.name || 'root'}`);
            // MEGA children might not be a simple array or might need refreshing
            if (!current.children) {
                console.log(`[StorageService] Folder ${current.name || 'root'} has no children property yet, attempting mkdir anyway or reloading...`);
            }

            let next = (current.children || []).find(f => f.name === part && f.directory);

            if (!next) {
                console.log(`[StorageService] Part ${part} not found. Creating...`);
                try {
                    next = await current.mkdir(part);
                    console.log(`[StorageService] Folder ${part} created successfully.`);
                } catch (mkdirErr) {
                    console.error(`[StorageService] Error creating folder ${part}:`, mkdirErr.message);
                    throw mkdirErr;
                }
            } else {
                console.log(`[StorageService] Part ${part} found.`);
            }
            current = next;
        }
        return current;
    }

    async _getFolder(folderPath) {
        console.log(`[StorageService] _getFolder: ${folderPath}`);
        if (folderPath === '/' || folderPath === '') return this.storage.root;

        const parts = folderPath.split('/').filter(p => p);
        let current = this.storage.root;

        for (const part of parts) {
            let next = (current.children || []).find(f => f.name === part && f.directory);
            if (!next) {
                console.log(`[StorageService] Folder part not found: ${part}`);
                return null;
            }
            current = next;
        }
        return current;
    }

    async _getFileOrFolder(fullPath) {
        if (!fullPath || fullPath === '/' || fullPath === '') return this.storage.root;

        // If it looks like an ID/hash (no slashes), try finding by ID first
        if (!fullPath.includes('/') && fullPath !== '.' && fullPath !== '..') {
            const file = await this._getFileById(fullPath);
            if (file) return file;
        }

        const parts = fullPath.split('/').filter(p => p);
        const fileName = parts.pop();
        const folderPath = parts.join('/');

        const folder = await this._getFolder(folderPath);
        if (!folder) return null;

        return (folder.children || []).find(f => f.name === fileName);
    }
}

const instance = new StorageService();
module.exports = instance;
module.exports.StorageService = StorageService;
