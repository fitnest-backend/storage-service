const path = require('path');
const fs = require('fs');
const config = require('../config/terabox.config');

class TeraboxService {
    constructor() {
        this.app = null;
        this.initialized = false;
        this.initializationPromise = this._initialize();
    }

    async _initialize() {
        if (this.initialized) return;
        try {
            const { default: TeraBoxApp } = await import('terabox-api');
            const axios = (await import('axios')).default;

            // Try with existing ndus first
            if (config.credentials.ndus) {
                try {
                    console.log('[TeraboxService] Validating NDUS token via dm.terabox.com...');
                    const res = await axios.get('https://dm.terabox.com/api/home/info', {
                        params: { app_id: config.credentials.appId || '250528', web: '1' },
                        headers: { 'Cookie': `ndus=${config.credentials.ndus}`, 'User-Agent': 'Mozilla/5.0' }
                    });

                    if (res.data.errno === 0) {
                        this.app = new TeraBoxApp({
                            ndus: config.credentials.ndus,
                            whost: 'https://dm.terabox.com'
                        });
                        this.app.params.account_id = res.data.data.uk;
                        this.initialized = true;
                        console.log(`[TeraboxService] Initialized with NDUS token. User: ${res.data.data.username}`);
                        return;
                    }
                    console.warn('[TeraboxService] NDUS token validation failed, trying email/password...', res.data);
                } catch (ndusError) {
                    console.warn('[TeraboxService] NDUS validation error:', ndusError.message);
                }
            }

            // Fallback to email/password login
            if (config.credentials.email && config.credentials.password) {
                try {
                    console.log('[TeraboxService] Attempting login with email/password...');
                    this.app = new TeraBoxApp();
                    const preLogin = await this.app.passportPreLogin(config.credentials.email);
                    if (preLogin.code === 0) {
                        const doLogin = await this.app.passportLogin(preLogin.data, config.credentials.email, config.credentials.password);
                        if (doLogin.code === 0) {
                            this.initialized = true;
                            console.log('[TeraboxService] Login successful for:', doLogin.data.displayName);
                            // Store the new ndus and update host to dm
                            config.credentials.ndus = doLogin.data.ndus;
                            this.app.params.whost = 'https://dm.terabox.com';
                            return;
                        }
                        console.error('[TeraboxService] Email/password login failed:', doLogin);
                    } else {
                        console.error('[TeraboxService] Pre-login failed:', preLogin);
                    }
                } catch (loginError) {
                    console.error('[TeraboxService] Email/password login error:', loginError.message);
                }
            } else {
                console.error('[TeraboxService] No valid credentials found.');
            }
        } catch (error) {
            console.error('[TeraboxService] General initialization error:', error);
        }
    }

    async ensureInitialized() {
        await this.initializationPromise;
        if (!this.initialized) {
            throw new Error('TeraboxService not initialized. Check credentials or network.');
        }
    }

    async uploadFile(filePath, directory = '/') {
        await this.ensureInitialized();
        try {
            const fileName = path.basename(filePath);
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;

            // Use terabox-api logic
            const { hashFile } = await import('terabox-api/helper.js');
            const fileHash = await hashFile(filePath);

            const data = {
                file: fileName,
                path: filePath,
                size: fileSize,
                hash: fileHash,
                remote_dir: directory
            };

            // Ensure directory exists
            await this.createDirectory(directory);

            console.log(`[TeraboxService] Precreating ${fileName}...`);
            const preCreateData = await this.app.precreateFile(data);
            if (preCreateData.errno !== 0) {
                throw new Error(`Precreate failed: ${JSON.stringify(preCreateData)}`);
            }

            data.upload_id = preCreateData.uploadid;

            console.log(`[TeraboxService] Uploading chunks for ${fileName}...`);
            const { uploadChunks } = await import('terabox-api/helper.js');
            const uploadStatus = await uploadChunks(this.app, data, filePath);

            if (!uploadStatus.ok) {
                throw new Error(`Upload failed: ${JSON.stringify(uploadStatus)}`);
            }

            console.log(`[TeraboxService] Creating file ${fileName}...`);
            const createInfo = await this.app.createFile(data);

            if (createInfo.errno !== 0) {
                throw new Error(`Create failed: ${JSON.stringify(createInfo)}`);
            }

            return { success: true, message: 'File uploaded successfully.', fileDetails: createInfo };
        } catch (error) {
            console.error('[TeraboxService] Upload failed:', error.message);
            return { success: false, message: error.message };
        }
    }

    async createDirectory(directoryPath) {
        await this.ensureInitialized();
        try {
            const axios = (await import('axios')).default;
            const res = await axios.post('https://dm.terabox.com/api/create',
                `path=${encodeURIComponent(directoryPath)}&isdir=1&size=0&block_list=[]`,
                {
                    params: {
                        app_id: config.credentials.appId || '250528',
                        web: '1'
                    },
                    headers: {
                        'Cookie': `ndus=${config.credentials.ndus}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0'
                    }
                }
            );

            if (res.data.errno === 0 || res.data.errno === -8) { // -8 means already exists
                return { success: true, data: res.data };
            }
            throw new Error(`Create directory failed: ${JSON.stringify(res.data)}`);
        } catch (error) {
            console.error('[TeraboxService] Create directory failed:', error.message);
            return { success: false, message: error.message };
        }
    }

    async fetchFileList(directory = '/') {
        await this.ensureInitialized();
        try {
            const axios = (await import('axios')).default;
            const res = await axios.get('https://dm.terabox.com/api/list', {
                params: {
                    app_id: config.credentials.appId || '250528',
                    web: '1',
                    channel: 'dubox',
                    clienttype: 0,
                    dir: directory,
                    num: 1000,
                    page: 1,
                    order: 'time',
                    desc: 1
                },
                headers: {
                    'Cookie': `ndus=${config.credentials.ndus}`,
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            if (res.data.errno === 0) {
                return { success: true, data: res.data };
            }
            throw new Error(`List failed: ${JSON.stringify(res.data)}`);
        } catch (error) {
            console.error('[TeraboxService] Fetch file list failed:', error.message);
            return { success: false, message: error.message };
        }
    }

    async deleteFiles(filePaths) {
        await this.ensureInitialized();
        try {
            const axios = (await import('axios')).default;
            const res = await axios.post('https://dm.terabox.com/api/filemanager?opera=delete',
                `filelist=${JSON.stringify(filePaths)}`,
                {
                    params: {
                        app_id: config.credentials.appId || '250528',
                        web: '1'
                    },
                    headers: {
                        'Cookie': `ndus=${config.credentials.ndus}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0'
                    }
                }
            );

            if (res.data.errno === 0) {
                return { success: true, data: res.data };
            }
            throw new Error(`Delete failed: ${JSON.stringify(res.data)}`);
        } catch (error) {
            console.error('[TeraboxService] Delete files failed:', error.message);
            return { success: false, message: error.message };
        }
    }

    async moveFiles(sourcePath, destinationPath, newName) {
        await this.ensureInitialized();
        try {
            const fileList = [{ path: sourcePath, dest: destinationPath, newname: newName }];
            const res = await this.app.filemanagerExecute('move', fileList);
            return res;
        } catch (error) {
            throw error;
        }
    }

    async downloadFile(fileId) {
        await this.ensureInitialized();
        try {
            // Find file metadata to get path if fileId is fs_id
            let filePath = fileId;
            if (typeof fileId === 'string' && !fileId.startsWith('/')) {
                // Not a path, try to find it (this is expensive but maintains compatibility)
                const dirsToSearch = ['/goals', '/profiles', '/uploads', '/'];
                for (const dir of dirsToSearch) {
                    const list = await this.fetchFileList(dir);
                    if (list.success && list.data.list) {
                        const found = list.data.list.find(f => String(f.fs_id) === String(fileId));
                        if (found) {
                            filePath = found.path;
                            break;
                        }
                    }
                }
            }

            const res = await this.app.getDlinks([filePath]);
            if (res.errno !== 0 || !res.dlink || res.dlink.length === 0) {
                throw new Error(`Failed to get download link: ${JSON.stringify(res)}`);
            }

            return { dlink: res.dlink[0].dlink, fsId: fileId };
        } catch (error) {
            console.error('[TeraboxService] Download failed:', error);
            throw error;
        }
    }

    async getFileStream(fileId) {
        await this.ensureInitialized();
        try {
            const { dlink, fsId } = await this.downloadFile(fileId);
            const { request } = await import('undici');
            const { body, headers } = await request(dlink, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
                    'Cookie': `ndus=${config.credentials.ndus}`
                }
            });

            return {
                stream: body,
                contentLength: headers['content-length'],
                contentType: headers['content-type'],
                filename: `file_${fsId}`
            };
        } catch (error) {
            console.error('[TeraboxService] Get stream failed:', error);
            throw error;
        }
    }

    async cleanupRoot() {
        await this.ensureInitialized();
        try {
            const listResult = await this.fetchFileList('/');
            if (!listResult.success || !listResult.data.list) {
                return { success: false, message: 'Failed to list root directory.' };
            }

            const files = listResult.data.list;
            const allowedPaths = ['/goals', '/profiles', '/uploads'];
            const toDelete = files
                .filter(file => !allowedPaths.includes(file.path))
                .map(file => file.path);

            if (toDelete.length === 0) {
                return { success: true, message: 'Root directory is already clean.', deleted: [] };
            }

            const deleteResult = await this.deleteFiles(toDelete);
            return {
                success: deleteResult.success,
                message: deleteResult.message,
                deleted: toDelete,
                details: deleteResult.result
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}

module.exports = new TeraboxService();
