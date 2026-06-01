import {Storage} from 'megajs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/storage.config.js';
import { redis } from '../config/redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '../../');
const LOCAL_STORAGE_DIR = path.join(ROOT_DIR, 'local_storage');

function generateTempNodeId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'temp_';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

class StorageService {
    constructor() {
        this.storage = null;
        this.initialized = false;
        this.initializationPromise = this._initialize();

        if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
            fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
        }
        const metadataPath = path.join(LOCAL_STORAGE_DIR, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
            fs.writeFileSync(metadataPath, JSON.stringify({}), 'utf8');
        }

        // Cache metadata in-memory at startup to avoid blocking synchronous disk reads
        try {
            this.metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch (e) {
            console.error('[StorageService] Error loading metadata.json, initializing empty:', e);
            this.metadata = {};
        }
    }

    static hashNodeId(nodeId) {
        if (!nodeId) return 0;
        const hash = nodeId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return Math.abs(hash);
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
            await this._loadMetadataFromRedis();
            this.initialized = true;
            console.log('[StorageService] Storage service initialized. User:', this.storage.name);
        } catch (error) {
            console.error('[StorageService] Failed to initialize storage:', error);
            throw error;
        }
    }

    async _loadMetadataFromRedis() {
        try {
            console.log('[StorageService] Loading metadata from Redis...');
            this.metadata = {};

            // Try loading from local file first as a fallback
            const metadataPath = path.join(LOCAL_STORAGE_DIR, 'metadata.json');
            if (fs.existsSync(metadataPath)) {
                try {
                    this.metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                } catch (e) {
                    console.error('[StorageService] Failed to parse local metadata.json:', e);
                }
            }

            // Sync with Redis keys
            const keys = await redis.keys('storage:metadata:*');
            console.log(`[StorageService] Found ${keys.length} metadata keys in Redis`);
            for (const key of keys) {
                const fsId = key.substring('storage:metadata:'.length);
                const val = await redis.get(key);
                if (val) {
                    this.metadata[fsId] = JSON.parse(val);
                }
            }
            console.log('[StorageService] Metadata loaded and merged in-memory');
        } catch (e) {
            console.error('[StorageService] Error loading metadata from Redis:', e);
        }
    }

    async ensureInitialized() {
        await this.initializationPromise;
        if (!this.initialized) {
            throw new Error('StorageService not initialized. Check credentials or network.');
        }
    }

    getMetadata(fsId) {
        return this.metadata[fsId] || null;
    }

    async setMetadata(fsId, value) {
        try {
            this.metadata[fsId] = value;
            const metadataPath = path.join(LOCAL_STORAGE_DIR, 'metadata.json');
            fs.writeFile(metadataPath, JSON.stringify(this.metadata, null, 2), 'utf8', (err) => {
                if (err) console.error('[StorageService] Error writing metadata to disk:', err);
            });
            await redis.set(`storage:metadata:${fsId}`, JSON.stringify(value));
        } catch (e) {
            console.error('[StorageService] Error saving metadata:', e);
        }
    }

    async deleteMetadata(fsId) {
        try {
            delete this.metadata[fsId];
            const metadataPath = path.join(LOCAL_STORAGE_DIR, 'metadata.json');
            fs.writeFile(metadataPath, JSON.stringify(this.metadata, null, 2), 'utf8', (err) => {
                if (err) console.error('[StorageService] Error writing metadata to disk:', err);
            });
            await redis.del(`storage:metadata:${fsId}`);
        } catch (e) {
            console.error('[StorageService] Error deleting metadata:', e);
        }
    }

    _extractIdFromUrl(url) {
        if (!url) return '';
        if (url.includes('/')) {
            const parts = url.split('/');
            return parts[parts.length - 1];
        }
        return url;
    }

    async uploadFile(filePath, directory = '/', oldPath = null) {
        await this.ensureInitialized();
        try {
            const fileName = path.basename(filePath);
            const fileSize = fs.statSync(filePath).size;

            const tempNodeId = generateTempNodeId();
            const tempFsId = StorageService.hashNodeId(tempNodeId);

            console.log(`[StorageService] Fast-track uploading ${fileName} to local storage with fsId: ${tempFsId}...`);

            if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
                fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
            }

            const localPath = path.join(LOCAL_STORAGE_DIR, String(tempFsId));
            fs.copyFileSync(filePath, localPath);

            this.setMetadata(tempFsId, {
                fileName,
                directory,
                size: fileSize,
                status: 'local',
                localPath: localPath,
                timestamp: Date.now()
            });

            // Start background upload to MEGA asynchronously using the safe local path copy
            this._backgroundUpload(filePath, directory, oldPath, tempFsId, fileName, fileSize, localPath);

            return {
                success: true,
                message: 'File uploaded successfully (cached)',
                fileDetails: {
                    name: fileName,
                    size: fileSize,
                    path: path.join(directory, fileName),
                    nodeId: tempNodeId
                }
            };
        } catch (error) {
            console.error('[StorageService] Upload failed:', error.message);
            return {success: false, message: error.message};
        }
    }

    async _backgroundUpload(filePath, directory, oldPath, tempFsId, fileName, fileSize, localPath) {
        try {
            console.log(`[StorageService] [Background] Starting MEGA upload for ${fileName} (${tempFsId})...`);
            const targetFolder = await this._getOrCreateFolder(directory);

            if (oldPath) {
                console.log(`[StorageService] [Background] Explicit old path provided: ${oldPath}. Deleting...`);
                try {
                    const oldFile = await this._getFileOrFolder(oldPath);
                    if (oldFile) {
                        await oldFile.delete();
                    }
                } catch (delErr) {
                    console.warn(`[StorageService] [Background] Failed to delete explicit old path ${oldPath}:`, delErr.message);
                }
            }

            const children = Array.isArray(targetFolder.children) ? targetFolder.children : Object.values(targetFolder.children || {});
            const existingFile = children.find(f => f.name === fileName && !f.directory);
            if (existingFile) {
                console.log(`[StorageService] [Background] Existing file found with same name: ${fileName}. Deleting...`);
                try {
                    await existingFile.delete();
                } catch (delErr) {
                    console.warn(`[StorageService] [Background] Failed to delete existing same-name file ${fileName}:`, delErr.message);
                }
            }

            console.log(`[StorageService] [Background] Starting actual MEGA pipe for ${fileName}...`);
            const fileStream = fs.createReadStream(localPath);
            const upload = targetFolder.upload({
                name: fileName,
                size: fileSize
            });

            fileStream.pipe(upload);
            const uploadedFile = await upload.complete;
            console.log('[StorageService] [Background] MEGA upload complete:', uploadedFile.name, 'nodeId:', uploadedFile.nodeId);

            // Update metadata to uploaded mapping
            this.setMetadata(tempFsId, {
                fileName,
                directory,
                size: fileSize,
                status: 'uploaded',
                realNodeId: uploadedFile.nodeId,
                timestamp: Date.now()
            });

            // Keep local cached file on disk for fast streaming
            console.log(`[StorageService] [Background] Retaining local cached file: ${localPath}`);
        } catch (error) {
            console.error('[StorageService] [Background] MEGA upload failed:', error.message);
        }
    }

    async createDirectory(directoryPath) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Creating directory: ${directoryPath}`);
            await this._getOrCreateFolder(directoryPath);
            return {success: true, message: 'Directory created or already exists'};
        } catch (error) {
            console.error('[StorageService] Create directory failed:', error.message);
            return {success: false, message: error.message};
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

            return {success: true, data: {list}};
        } catch (error) {
            console.error('[StorageService] Fetch file list failed:', error.message);
            return {success: false, message: error.message};
        }
    }

    async deleteFiles(paths) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Deleting paths: ${JSON.stringify(paths)}`);
            const megaPathsToDelete = [];
            for (const p of paths) {
                const id = this._extractIdFromUrl(p);

                // 1. Delete local file if exists
                const localPath = path.join(LOCAL_STORAGE_DIR, String(id));
                if (fs.existsSync(localPath)) {
                    fs.unlinkSync(localPath);
                }

                // 2. Check metadata mapping
                const metadata = this.getMetadata(id);
                if (metadata) {
                    if (metadata.status === 'uploaded' && metadata.realNodeId) {
                        megaPathsToDelete.push(metadata.realNodeId);
                    }
                    this.deleteMetadata(id);
                } else {
                    megaPathsToDelete.push(p);
                }
            }

            // 3. Delete from MEGA in background
            if (megaPathsToDelete.length > 0) {
                this._backgroundDelete(megaPathsToDelete);
            }

            return {success: true, message: 'Paths deleted successfully'};
        } catch (error) {
            console.error('[StorageService] Delete failed:', error.message);
            return {success: false, message: error.message};
        }
    }

    async _backgroundDelete(paths) {
        try {
            console.log(`[StorageService] [Background] Deleting from MEGA: ${JSON.stringify(paths)}`);
            for (const p of paths) {
                const file = await this._getFileOrFolder(p);
                if (file) {
                    await file.delete();
                }
            }
            console.log(`[StorageService] [Background] MEGA deletion complete`);
        } catch (error) {
            console.error('[StorageService] [Background] MEGA deletion failed:', error.message);
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
            return {success: true, message: 'Files moved successfully'};
        } catch (error) {
            console.error('[StorageService] Move failed:', error.message);
            return {success: false, message: error.message};
        }
    }

    async downloadFile(fileId) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Getting download URL for: ${fileId}`);
            const id = this._extractIdFromUrl(fileId);

            // Wait if currently uploading in background
            let metadata = this.getMetadata(id);
            if (metadata && metadata.status === 'local') {
                console.log(`[StorageService] File ${id} is currently local. Waiting for MEGA upload to complete...`);
                for (let i = 0; i < 50; i++) { // 10s max wait
                    await new Promise(resolve => setTimeout(resolve, 200));
                    metadata = this.getMetadata(id);
                    if (!metadata || metadata.status === 'uploaded') {
                        break;
                    }
                }
            }

            const file = await this._getFileById(id);
            if (!file) throw new Error('File not found');

            const url = await file.link();
            return {success: true, dlink: url};
        } catch (error) {
            console.error('[StorageService] Download URL retrieval failed:', error.message);
            throw error;
        }
    }

    async getFileStream(fileId) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Getting file stream for: ${fileId}`);
            const id = this._extractIdFromUrl(fileId);
            const localPath = path.join(LOCAL_STORAGE_DIR, String(id));

            // 1. If still stored locally, stream directly from disk (fast)
            if (fs.existsSync(localPath)) {
                const metadata = this.getMetadata(id);
                const filename = metadata ? metadata.fileName : 'file';
                const size = metadata ? metadata.size : fs.statSync(localPath).size;
                return {
                    stream: fs.createReadStream(localPath),
                    contentLength: size,
                    contentType: 'application/octet-stream',
                    filename: filename
                };
            }

            // 2. Otherwise fall back to downloading from MEGA and caching locally
            const file = await this._getFileById(id);
            if (!file) throw new Error('File not found');

            console.log(`[StorageService] File not found locally. Downloading from MEGA to cache: ${id}...`);
            
            // Download and save to local disk
            await new Promise((resolve, reject) => {
                const megaStream = file.download();
                const writeStream = fs.createWriteStream(localPath);
                megaStream.pipe(writeStream);
                writeStream.on('finish', resolve);
                writeStream.on('error', (err) => {
                    fs.unlink(localPath, () => {});
                    reject(err);
                });
                megaStream.on('error', (err) => {
                    fs.unlink(localPath, () => {});
                    reject(err);
                });
            });

            console.log(`[StorageService] File cached locally: ${id}`);

            return {
                stream: fs.createReadStream(localPath),
                contentLength: file.size,
                contentType: 'application/octet-stream',
                filename: file.name
            };
        } catch (error) {
            console.error('[StorageService] Get file stream failed:', error.message);
            throw error;
        }
    }

    async _getFileById(id) {
        await this.ensureInitialized();
        let targetId = id;

        const metadata = this.getMetadata(id);
        if (metadata && metadata.status === 'uploaded' && metadata.realNodeId) {
            targetId = metadata.realNodeId;
        }

        const idNum = parseInt(targetId, 10);
        for (const f of Object.values(this.storage.files)) {
            if (f.nodeId === targetId) return f;
            if (!isNaN(idNum) && StorageService.hashNodeId(f.nodeId) === idNum) return f;
        }
        return null;
    }

    async _getOrCreateFolder(folderPath) {
        console.log(`[StorageService] _getOrCreateFolder: ${folderPath}`);
        if (folderPath === '/' || folderPath === '') return this.storage.root;

        const parts = folderPath.split('/').filter(p => p);
        let current = this.storage.root;

        for (const part of parts) {
            if (!current.children) {
                console.log(`[StorageService] Folder has no children property yet...`);
            }

            let next = (current.children || []).find(f => f.name === part && f.directory);

            if (!next) {
                try {
                    next = await current.mkdir(part);
                } catch (mkdirErr) {
                    console.error(`[StorageService] Error creating folder ${part}:`, mkdirErr.message);
                    throw mkdirErr;
                }
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
                return null;
            }
            current = next;
        }
        return current;
    }

    async _getFileOrFolder(fullPath) {
        if (!fullPath || fullPath === '/' || fullPath === '') return this.storage.root;

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

    async ensureFileCached(fileId) {
        await this.ensureInitialized();
        const id = this._extractIdFromUrl(fileId);
        const localPath = path.join(LOCAL_STORAGE_DIR, String(id));

        // 1. If already on disk, just return path and filename
        if (fs.existsSync(localPath)) {
            const metadata = this.getMetadata(id);
            const filename = metadata ? metadata.fileName : 'file';
            return { localPath, filename };
        }

        // 2. Otherwise download and save to disk first
        const file = await this._getFileById(id);
        if (!file) throw new Error('File not found');

        console.log(`[StorageService] Downloading from MEGA to cache: ${id}...`);
        await new Promise((resolve, reject) => {
            const megaStream = file.download();
            const writeStream = fs.createWriteStream(localPath);
            megaStream.pipe(writeStream);
            writeStream.on('finish', resolve);
            writeStream.on('error', (err) => {
                fs.unlink(localPath, () => {});
                reject(err);
            });
            megaStream.on('error', (err) => {
                fs.unlink(localPath, () => {});
                reject(err);
            });
        });

        console.log(`[StorageService] File cached locally: ${id}`);
        this.setMetadata(id, {
            fileName: file.name,
            size: file.size,
            status: 'uploaded',
            realNodeId: file.nodeId,
            timestamp: Date.now()
        });
        return { localPath, filename: file.name };
    }
}

const instance = new StorageService();
export default instance;
export { StorageService };
