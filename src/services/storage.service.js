import crypto from 'node:crypto';
if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto || crypto;
}
if (!globalThis.crypto.randomUUID && crypto.randomUUID) {
    globalThis.crypto.randomUUID = crypto.randomUUID.bind(crypto);
}

import { BlobServiceClient } from '@azure/storage-blob';
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
        this.containerClient = null;
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
            console.log('[StorageService] Initializing Azure Blob Storage...');
            const blobServiceClient = BlobServiceClient.fromConnectionString(config.azure.connectionString);
            this.containerClient = blobServiceClient.getContainerClient(config.azure.containerName);

            // Ensure container exists
            await this.containerClient.createIfNotExists();

            await this._loadMetadataFromRedis();
            this.initialized = true;
            console.log('[StorageService] Azure Blob Storage initialized. Container:', config.azure.containerName);
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
            throw new Error('StorageService not initialized. Check Azure credentials or network.');
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

    _getContentType(filename) {
        const lower = (filename || '').toLowerCase();
        if (lower.endsWith('.svg')) return 'image/svg+xml';
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
        if (lower.endsWith('.webp')) return 'image/webp';
        if (lower.endsWith('.gif')) return 'image/gif';
        return 'application/octet-stream';
    }

    async uploadFile(filePath, directory = '/', oldPath = null) {
        await this.ensureInitialized();
        try {
            const fileName = path.basename(filePath);
            const fileSize = fs.statSync(filePath).size;

            const tempNodeId = generateTempNodeId();
            const tempFsId = StorageService.hashNodeId(tempNodeId);

            console.log(`[StorageService] Uploading ${fileName} to Azure Blob with fsId: ${tempFsId}...`);

            if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
                fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
            }

            // Save to local cache
            const localPath = path.join(LOCAL_STORAGE_DIR, String(tempFsId));
            fs.copyFileSync(filePath, localPath);

            // Upload to Azure Blob Storage
            const blockBlobClient = this.containerClient.getBlockBlobClient(String(tempFsId));
            const contentType = this._getContentType(fileName);
            await blockBlobClient.uploadFile(localPath, {
                blobHTTPHeaders: { blobContentType: contentType },
                metadata: {
                    filename: encodeURIComponent(fileName),
                    directory: encodeURIComponent(directory),
                    hashid: String(tempFsId)
                }
            });

            console.log(`[StorageService] File uploaded to Azure Blob: ${tempFsId}`);

            this.setMetadata(tempFsId, {
                fileName,
                directory,
                size: fileSize,
                status: 'uploaded',
                timestamp: Date.now()
            });

            // Delete old file if specified
            if (oldPath) {
                console.log(`[StorageService] Deleting old path: ${oldPath}`);
                try {
                    const oldId = this._extractIdFromUrl(oldPath);
                    await this.containerClient.getBlockBlobClient(String(oldId)).deleteIfExists();
                    const oldLocalPath = path.join(LOCAL_STORAGE_DIR, String(oldId));
                    if (fs.existsSync(oldLocalPath)) fs.unlinkSync(oldLocalPath);
                } catch (delErr) {
                    console.warn(`[StorageService] Failed to delete old path ${oldPath}:`, delErr.message);
                }
            }

            return {
                success: true,
                message: 'File uploaded successfully',
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

    async createDirectory(directoryPath) {
        // Azure Blob Storage uses flat namespace; directories are virtual via blob name prefixes.
        // No-op but return success for API compatibility.
        return {success: true, message: 'Directory created or already exists'};
    }

    async fetchFileList(directory = '/') {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Fetching file list for: ${directory}`);
            const list = [];
            for await (const blob of this.containerClient.listBlobsFlat({ includeMetadata: true })) {
                if (blob.name === 'manifest.json') continue;
                const meta = blob.metadata || {};
                const blobDir = meta.directory ? decodeURIComponent(meta.directory) : '/';
                if (directory === '/' || blobDir === directory) {
                    list.push({
                        name: meta.filename ? decodeURIComponent(meta.filename) : blob.name,
                        size: blob.properties.contentLength,
                        directory: false,
                        timestamp: blob.properties.lastModified,
                        nodeId: blob.name
                    });
                }
            }
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
            for (const p of paths) {
                const id = this._extractIdFromUrl(p);

                // 1. Delete local file if exists
                const localPath = path.join(LOCAL_STORAGE_DIR, String(id));
                if (fs.existsSync(localPath)) {
                    fs.unlinkSync(localPath);
                }
                // Also delete any .png conversion cache
                if (fs.existsSync(localPath + '.png')) {
                    fs.unlinkSync(localPath + '.png');
                }

                // 2. Delete from Azure Blob
                try {
                    await this.containerClient.getBlockBlobClient(String(id)).deleteIfExists();
                } catch (blobErr) {
                    console.warn(`[StorageService] Failed to delete blob ${id}:`, blobErr.message);
                }

                // 3. Clean up metadata
                this.deleteMetadata(id);
            }

            return {success: true, message: 'Paths deleted successfully'};
        } catch (error) {
            console.error('[StorageService] Delete failed:', error.message);
            return {success: false, message: error.message};
        }
    }

    async moveFiles(fileList) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Moving files: ${JSON.stringify(fileList)}`);
            for (const item of fileList) {
                const id = this._extractIdFromUrl(item.path);
                const metadata = this.getMetadata(id);
                if (metadata) {
                    metadata.directory = item.dest;
                    if (item.newname) metadata.fileName = item.newname;
                    this.setMetadata(id, metadata);
                }
                // Update blob metadata in Azure
                try {
                    const blobClient = this.containerClient.getBlockBlobClient(String(id));
                    const props = await blobClient.getProperties();
                    const newMeta = { ...props.metadata };
                    newMeta.directory = encodeURIComponent(item.dest);
                    if (item.newname) newMeta.filename = encodeURIComponent(item.newname);
                    await blobClient.setMetadata(newMeta);
                } catch (blobErr) {
                    console.warn(`[StorageService] Failed to update blob metadata for ${id}:`, blobErr.message);
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

            const blobClient = this.containerClient.getBlockBlobClient(String(id));
            const exists = await blobClient.exists();
            if (!exists) throw new Error('File not found');

            // Generate a SAS URL for download (valid for 1 hour)
            const { generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = await import('@azure/storage-blob');

            // Parse connection string to get account name and key
            const connParts = {};
            config.azure.connectionString.split(';').forEach(part => {
                const [key, ...val] = part.split('=');
                connParts[key] = val.join('=');
            });

            const sharedKeyCredential = new StorageSharedKeyCredential(connParts.AccountName, connParts.AccountKey);
            const sasToken = generateBlobSASQueryParameters({
                containerName: config.azure.containerName,
                blobName: String(id),
                permissions: BlobSASPermissions.parse('r'),
                startsOn: new Date(),
                expiresOn: new Date(Date.now() + 3600 * 1000)
            }, sharedKeyCredential).toString();

            const url = `${blobClient.url}?${sasToken}`;
            return {success: true, dlink: url};
        } catch (error) {
            console.error('[StorageService] Download URL retrieval failed:', error.message);
            throw error;
        }
    }

    async _resolveBlobName(fileId) {
        const id = String(this._extractIdFromUrl(fileId));
        
        // 1. Direct match check: does blob exist with this id?
        const directClient = this.containerClient.getBlockBlobClient(id);
        if (await directClient.exists()) {
            return { blobName: id, metadata: this.getMetadata(id) };
        }

        // 2. Check metadata in-memory / Redis for realNodeId mapping
        let meta = this.getMetadata(id);
        if (!meta) {
            // Try fetching from Redis directly if not cached in-memory
            try {
                const val = await redis.get(`storage:metadata:${id}`);
                if (val) {
                    meta = JSON.parse(val);
                    this.metadata[id] = meta;
                }
            } catch (e) {}
        }

        if (meta && meta.realNodeId) {
            const realHash = String(StorageService.hashNodeId(meta.realNodeId));
            const realClient = this.containerClient.getBlockBlobClient(realHash);
            if (await realClient.exists()) {
                console.log(`[StorageService] Resolved ${id} -> realHash ${realHash} (nodeId: ${meta.realNodeId})`);
                return { blobName: realHash, metadata: meta };
            }
        }

        return { blobName: id, metadata: meta };
    }

    async getFileStream(fileId) {
        await this.ensureInitialized();
        try {
            console.log(`[StorageService] Getting file stream for: ${fileId}`);
            const id = this._extractIdFromUrl(fileId);
            const { blobName, metadata: mappedMeta } = await this._resolveBlobName(id);
            const localPath = path.join(LOCAL_STORAGE_DIR, String(blobName));

            // 1. If not stored locally, download from Azure Blob first
            if (!fs.existsSync(localPath)) {
                const blobClient = this.containerClient.getBlockBlobClient(String(blobName));
                const exists = await blobClient.exists();
                if (!exists) throw new Error('File not found');

                console.log(`[StorageService] File not found locally. Downloading from Azure Blob to cache: ${blobName}...`);
                await blobClient.downloadToFile(localPath);

                // Fetch blob properties for metadata
                const props = await blobClient.getProperties();
                const blobMeta = props.metadata || {};
                const metaToSave = mappedMeta || {
                    fileName: blobMeta.filename ? decodeURIComponent(blobMeta.filename) : 'file',
                    size: props.contentLength,
                    status: 'uploaded',
                    timestamp: Date.now()
                };
                this.setMetadata(blobName, metaToSave);
                if (id !== blobName) {
                    this.setMetadata(id, metaToSave);
                }

                console.log(`[StorageService] File cached locally: ${blobName}`);
            }

            const metadata = mappedMeta || this.getMetadata(blobName) || this.getMetadata(id);
            const filename = metadata ? metadata.fileName : 'file';

            // 2. Check and handle SVG to PNG conversion for mobile compatibility
            const pngPath = await this._ensurePngVersion(localPath, filename);
            if (pngPath) {
                const pngSize = fs.statSync(pngPath).size;
                const pngFilename = filename.substring(0, filename.length - 4) + '.png';
                return {
                    stream: fs.createReadStream(pngPath),
                    contentLength: pngSize,
                    contentType: 'image/png',
                    filename: pngFilename
                };
            }

            const size = metadata ? metadata.size : fs.statSync(localPath).size;
            let contentType = 'application/octet-stream';
            const lowerFilename = filename.toLowerCase();
            if (lowerFilename.endsWith('.svg')) {
                contentType = 'image/svg+xml';
            } else if (lowerFilename.endsWith('.png')) {
                contentType = 'image/png';
            } else if (lowerFilename.endsWith('.jpg') || lowerFilename.endsWith('.jpeg')) {
                contentType = 'image/jpeg';
            } else if (lowerFilename.endsWith('.gif')) {
                contentType = 'image/gif';
            }

            return {
                stream: fs.createReadStream(localPath),
                contentLength: size,
                contentType: contentType,
                filename: filename
            };
        } catch (error) {
            console.error('[StorageService] Get file stream failed:', error.message);
            throw error;
        }
    }

    async _ensurePngVersion(localPath, filename) {
        if (!filename.toLowerCase().endsWith('.svg')) {
            return null;
        }
        const pngCachePath = localPath + '.png';
        if (fs.existsSync(pngCachePath)) {
            return pngCachePath;
        }
        try {
            console.log(`[StorageService] Converting SVG to PNG: ${filename}...`);
            const { default: sharp } = await import('sharp');
            const svgBuffer = fs.readFileSync(localPath);
            const pngBuffer = await sharp(svgBuffer).png().toBuffer();
            fs.writeFileSync(pngCachePath, pngBuffer);
            console.log(`[StorageService] SVG to PNG conversion complete: ${pngCachePath}`);
            return pngCachePath;
        } catch (err) {
            console.error(`[StorageService] SVG to PNG conversion failed:`, err.message);
            return null;
        }
    }

    async ensureFileCached(fileId) {
        await this.ensureInitialized();
        const id = this._extractIdFromUrl(fileId);
        const { blobName, metadata: mappedMeta } = await this._resolveBlobName(id);
        const localPath = path.join(LOCAL_STORAGE_DIR, String(blobName));

        // 1. If not on disk, download from Azure Blob first
        if (!fs.existsSync(localPath)) {
            const blobClient = this.containerClient.getBlockBlobClient(String(blobName));
            const exists = await blobClient.exists();
            if (!exists) throw new Error('File not found');

            console.log(`[StorageService] Downloading from Azure Blob to cache: ${blobName}...`);
            await blobClient.downloadToFile(localPath);

            const props = await blobClient.getProperties();
            const blobMeta = props.metadata || {};
            const metaToSave = mappedMeta || {
                fileName: blobMeta.filename ? decodeURIComponent(blobMeta.filename) : 'file',
                size: props.contentLength,
                status: 'uploaded',
                timestamp: Date.now()
            };
            this.setMetadata(blobName, metaToSave);
            if (id !== blobName) {
                this.setMetadata(id, metaToSave);
            }

            console.log(`[StorageService] File cached locally: ${blobName}`);
        }

        const metadata = mappedMeta || this.getMetadata(blobName) || this.getMetadata(id);
        const filename = metadata ? metadata.fileName : 'file';

        const pngPath = await this._ensurePngVersion(localPath, filename);
        if (pngPath) {
            const pngFilename = filename.substring(0, filename.length - 4) + '.png';
            return { localPath: pngPath, filename: pngFilename };
        }

        return { localPath, filename };
    }
}

const instance = new StorageService();
export default instance;
export { StorageService };
