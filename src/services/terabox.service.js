const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/terabox.config');
const FormData = require('form-data');
const authService = require('./auth.service');
const {
    buildPrecreateUrl,
    buildUploadUrl,
    buildCreateUrl,
    buildListUrl
} = require('./terabox-utils');

class TeraboxService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15';
        this.dlinkCache = new Map(); // fsId -> { dlink, expires }
    }

    _generateDpLogId() {
        return crypto.randomBytes(10).toString('hex').toUpperCase();
    }

    // Helper functions for download
    _generateSign(s1, s2) {
        try {
            const p = new Uint8Array(256), a = new Uint8Array(256), result = [];
            for (let i = 0; i < 256; i++) {
                a[i] = s1.charCodeAt(i % s1.length);
                p[i] = i;
            }
            let j = 0;
            for (let i = 0; i < 256; i++) {
                j = (j + p[i] + a[i]) % 256;
                [p[i], p[j]] = [p[j], p[i]];
            }
            let i = 0; j = 0;
            for (let q = 0; q < s2.length; q++) {
                i = (i + 1) % 256;
                j = (j + p[i]) % 256;
                [p[i], p[j]] = [p[j], p[i]];
                result.push(s2.charCodeAt(q) ^ p[(p[i] + p[j]) % 256]);
            }
            return Buffer.from(result).toString('base64');
        } catch (e) { return null; }
    }

    async _fetchHomeInfo(ndus) {
        try {
            console.log(`[TeraboxService] Fetching home info for NDUS from dm.terabox.com...`);
            const res = await axios.get("https://dm.terabox.com/api/home/info", {
                params: { app_id: "250528", web: "1", channel: "dubox", clienttype: "0" },
                headers: {
                    "Cookie": `ndus=${ndus}`,
                    "User-Agent": this.userAgent
                }
            });
            console.log(`[TeraboxService] Home info response: errno=${res.data.errno}, has_data=${!!res.data.data}`);
            if (res.data.errno === 0) {
                return { success: true, data: res.data.data };
            }
            return { success: false, message: res.data.errmsg || "Failed to fetch home info." };
        } catch (e) { return { success: false, message: e.message }; }
    }

    async _generateDownload(sign, fid, timestamp, ndus, appId, jsToken, dpLogId) {
        try {
            const res = await axios.get("https://dm.terabox.com/api/download", {
                params: {
                    app_id: appId || "250528", web: "1", channel: "dubox", clienttype: "0",
                    jsToken, "dp-logid": dpLogId, fidlist: `[${fid}]`, type: "dlink",
                    vip: "2", sign, timestamp, need_speed: "0"
                },
                headers: {
                    "Cookie": `ndus=${ndus}`,
                    "User-Agent": this.userAgent
                }
            });
            if (!res.data.dlink) return { success: false, message: res.data.errmsg };
            return { success: true, downloadLink: res.data.dlink };
        } catch (e) { return { success: false, message: e.message }; }
    }

    // Helper function for share
    async _getShortUrl(ndus, path, fid, appId, jsToken, dpLogId) {
        try {
            const url = `https://www.1024terabox.com/share/pset?app_id=${appId}&jsToken=${jsToken}&dp-logid=${dpLogId}`;
            const cookies = `ndus=${ndus}`;

            const formData = new URLSearchParams({
                app_id: appId,
                web: '1',
                channel: 'dubox',
                clienttype: '0',
                app: 'universe',
                schannel: '0',
                channel_list: '[0]',
                period: '0',
                path_list: `["${path}"]`,
                fid_list: `[${fid}]`,
                pwd: '',
                public: '1',
                scene: ''
            });

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookies,
                'Referer': 'https://www.1024terabox.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            };

            const response = await axios.post(url, formData.toString(), { headers });
            return response.data;
        } catch (error) {
            return null;
        }
    }

    // Helper to get fresh credentials object compatible with utils
    _getCredentials() {
        return {
            ndus: config.credentials.ndus,
            jsToken: config.credentials.jsToken,
            appId: config.credentials.appId || '250528',
            bdstoken: config.credentials.bdstoken,
            browserId: config.credentials.browserId,
            bidN: config.credentials.bidN,
            ndutFmt: config.credentials.ndutFmt,
            ndutFmv: config.credentials.ndutFmv,
            csrfToken: config.credentials.csrfToken,
            dpLogId: this._generateDpLogId()
        };
    }

    _getCookies(creds) {
        let cookies = `lang=en; ndus=${creds.ndus};`;
        if (creds.browserId) cookies += ` browserid=${creds.browserId};`;
        if (creds.bidN) cookies += ` __bid_n=${creds.bidN};`;
        if (creds.ndutFmt) cookies += ` ndut_fmt=${creds.ndutFmt};`;
        if (creds.ndutFmv) cookies += ` ndut_fmv=${creds.ndutFmv};`;
        if (creds.csrfToken) cookies += ` csrfToken=${creds.csrfToken};`;
        return cookies;
    }

    async uploadFile(filePath, directory = '/', retryCount = 0) {
        try {
            // Sanitize directory: ensure it starts with / and no trailing / (unless root)
            let cleanDir = directory.trim();
            if (!cleanDir.startsWith('/')) cleanDir = '/' + cleanDir;
            if (cleanDir.length > 1 && cleanDir.endsWith('/')) cleanDir = cleanDir.slice(0, -1);

            const fileName = path.basename(filePath);
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;
            const fileMd5 = crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');

            const creds = this._getCredentials();
            const cookies = this._getCookies(creds);

            // Ensure directory exists
            if (cleanDir && cleanDir !== '/') {
                await this.createDirectory(cleanDir);
            }

            // 1. Precreate
            const precreateUrl = buildPrecreateUrl(creds.appId, creds.jsToken, creds.dpLogId);
            console.log(`[TeraboxService] Precreating ${fileName} at ${precreateUrl}`);

            const precreateParams = new URLSearchParams({
                path: `${cleanDir}/${fileName}`,
                autoinit: '1',
                target_path: cleanDir,
                block_list: JSON.stringify([fileMd5]),
                size: fileSize,
                local_mtime: Math.floor(stats.mtimeMs / 1000),
            });

            const precreateResponse = await axios.post(
                precreateUrl,
                precreateParams.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Cookie: cookies
                    }
                }
            );



            if (precreateResponse.data.errno !== 0) {
                // Check for auth error (errno -6) and retry
                if ((precreateResponse.data.errno === -6 || precreateResponse.data.errmsg?.includes('not login')) && retryCount < 1) {
                    console.log('[TeraboxService] Auth error in precreate. Refreshing tokens (DISABLED for verification)...');
                    // await authService.refreshTokens();
                    // return this.uploadFile(filePath, directory, retryCount + 1);
                }
                throw new Error(`Precreate failed (errno ${precreateResponse.data.errno}): ${precreateResponse.data.errmsg || 'Unknown error'}`);
            }

            const uploadId = precreateResponse.data.uploadid;

            // 2. Upload
            // Use the target filename and directory for the upload URL
            // Ensure proper path construction (handle root directory case)
            const uploadPath = (cleanDir === '/') ? `/${fileName}` : `${cleanDir}/${fileName}`;
            const uploadUrl = buildUploadUrl(uploadPath, uploadId, creds.appId);
            console.log(`[TeraboxService] Uploading to ${uploadUrl}`);

            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));

            await axios.post(uploadUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    Cookie: cookies
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            // 3. Create
            const createUrl = buildCreateUrl(creds.appId, creds.jsToken, creds.dpLogId);
            console.log(`[TeraboxService] Creating file at ${createUrl}`);

            const createParams = new URLSearchParams({
                path: `${cleanDir}/${fileName}`,
                size: fileSize,
                uploadid: uploadId,
                target_path: cleanDir,
                block_list: JSON.stringify([fileMd5]),
                local_mtime: Math.floor(stats.mtimeMs / 1000),
                isdir: '0',
                rtype: '1',
            });
            if (creds.bdstoken) createParams.append('bdstoken', creds.bdstoken);

            const createResponse = await axios.post(createUrl, createParams.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Cookie: cookies
                },
            });

            if (createResponse.data.errno !== 0) {
                if ((createResponse.data.errno === -6) && retryCount < 1) {
                    console.log('[TeraboxService] Auth error in create. Refreshing tokens (DISABLED for verification)...');
                    // await authService.refreshTokens();
                    // return this.uploadFile(filePath, directory, retryCount + 1);
                }
                throw new Error(`Create failed (errno ${createResponse.data.errno}): ${createResponse.data.errmsg || 'Unknown error'}`);
            }

            return { success: true, message: 'File uploaded successfully.', fileDetails: createResponse.data };

        } catch (error) {
            console.error('[TeraboxService] Upload failed:', error.message);
            // Retry logic for general auth failure in catch block if not handled above
            if ((error.response?.data?.errno === -6 || error.message.includes('not login')) && retryCount < 1) {
                console.log('[TeraboxService] Catch block auth retry (DISABLED for verification)...');
                // await authService.refreshTokens();
                // return this.uploadFile(filePath, directory, retryCount + 1);
            }
            return { success: false, message: error.response?.data || error.message };
        }
    }

    async createDirectory(directoryPath) {
        try {
            const creds = this._getCredentials();
            const cookies = this._getCookies(creds);

            const createUrl = buildCreateUrl(creds.appId, creds.jsToken, creds.dpLogId);
            const createParams = new URLSearchParams({
                path: directoryPath,
                isdir: '1',
                size: '0',
                block_list: '[]',
                local_mtime: Math.floor(Date.now() / 1000),
            });
            if (creds.bdstoken) createParams.append('bdstoken', creds.bdstoken);

            const response = await axios.post(createUrl, createParams.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies },
            });
            return { success: true, message: 'Directory created successfully.', data: response.data };
        } catch (error) {
            return { success: false, message: error.response?.data || error.message };
        }
    }

    async fetchFileList(directory = '/') {
        try {
            const creds = this._getCredentials();
            const cookies = this._getCookies(creds);

            const listUrl = buildListUrl(creds.appId, directory, creds.jsToken, creds.dpLogId);
            const response = await axios.get(listUrl, { headers: { Cookie: cookies } });

            return { success: true, message: 'File list retrieved successfully.', data: response.data };
        } catch (error) {
            return { success: false, message: error.response?.data?.error || error.message };
        }
    }

    async deleteFiles(fileList) {
        // fileList: array of file paths e.g. ["/path/to/file1", "/path/to/file2"]
        try {
            const creds = this._getCredentials();
            const cookies = this._getCookies(creds);
            const url = "https://dm.terabox.com/api/filemanager";

            const params = {
                opera: "delete",
                app_id: creds.appId,
                jsToken: creds.jsToken,
                "dp-logid": creds.dpLogId,
            };

            const data = new URLSearchParams();
            data.append("filelist", JSON.stringify(fileList));

            const response = await axios.post(url, data.toString(), {
                headers: { Cookie: cookies },
                params,
            });

            return { success: true, message: 'Files deleted successfully.', result: response.data };
        } catch (error) {
            return { success: false, message: error.response?.data?.error || error.message };
        }
    }

    async moveFiles(sourcePath, destinationPath, newName) {
        try {
            const creds = this._getCredentials();
            const cookies = this._getCookies(creds);
            const url = "https://dm.terabox.com/api/filemanager";

            // Logic from fileMove.js
            const fileList = [{ path: sourcePath, dest: destinationPath, newname: newName }];

            const params = {
                opera: "move",
                app_id: creds.appId,
                jsToken: creds.jsToken,
                "dp-logid": creds.dpLogId,
            };

            const data = new URLSearchParams();
            data.append("filelist", JSON.stringify(fileList));

            const response = await axios.post(url, data.toString(), {
                headers: { Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded" },
                params,
            });
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async cleanupRoot() {
        try {
            const listResult = await this.fetchFileList('/');
            if (!listResult.success || !listResult.data || !listResult.data.list) {
                return { success: false, message: 'Failed to list root directory.' };
            }

            const files = listResult.data.list;
            const allowedPaths = ['/goals', '/profiles', '/uploads']; // Keep uploads too as it is the default
            const toDelete = files
                .filter(file => !allowedPaths.includes(file.path))
                .map(file => file.path);

            if (toDelete.length === 0) {
                return { success: true, message: 'Root directory is already clean.', deleted: [] };
            }

            console.log('[TeraboxService] Cleaning up root directory. Deleting:', toDelete);
            const deleteResult = await this.deleteFiles(toDelete);

            return {
                success: deleteResult.success,
                message: deleteResult.message,
                deleted: toDelete,
                details: deleteResult.result
            };

        } catch (error) {
            console.error('[TeraboxService] Cleanup failed:', error);
            return { success: false, message: error.message };
        }
    }

    async downloadFile(fileId) {
        try {
            let actualFsId = fileId;
            let actualPath = '';

            // If fileId looks like a path (starts with /), resolve it to fs_id and path
            if (typeof fileId === 'string' && fileId.startsWith('/')) {
                console.log(`[TeraboxService] Resolving path ${fileId} to fs_id...`);
                const dir = path.dirname(fileId);
                const filename = path.basename(fileId);

                const listResult = await this.fetchFileList(dir);
                if (listResult.success && listResult.data && listResult.data.list) {
                    const fileObj = listResult.data.list.find(f => f.server_filename === filename);
                    if (fileObj) {
                        actualFsId = fileObj.fs_id;
                        actualPath = fileObj.path;
                        console.log(`[TeraboxService] Resolved ${fileId} to fs_id: ${actualFsId}, path: ${actualPath}`);
                    } else {
                        throw new Error(`File not found at path: ${fileId}`);
                    }
                } else {
                    throw new Error(`Failed to list directory: ${dir}`);
                }
            } else {
                // If fileId is fs_id, we need to get the path
                // For now, assume path is not needed, but to make it work, perhaps set actualPath to something
                // But since the user uses path, it's ok
                actualPath = ''; // This will fail if path is required
            }

            const creds = this._getCredentials();
            const downloadResult = await this.getDownloadLink(creds.ndus, actualFsId, creds.appId, creds.jsToken, creds.dpLogId);
            if (!downloadResult.success) {
                throw new Error(downloadResult.message || "Failed to get download link.");
            }

            return { dlink: downloadResult.downloadLink, fsId: actualFsId };
        } catch (error) {
            console.error('[TeraboxService] Download failed:', error);
            throw error;
        }
    }

    // Local getDownloadLink function to avoid import issues
    async getDownloadLink(ndus, fid, appId, jsToken, dpLogId) {
        try {
            // Check cache first
            const cached = this.dlinkCache.get(fid);
            if (cached && cached.expires > Date.now()) {
                console.log(`[TeraboxService] Using cached dlink for ${fid}`);
                return { success: true, message: "Download link retrieved from cache.", downloadLink: cached.dlink };
            }

            const homeInfo = await this._fetchHomeInfo(ndus);
            if (!homeInfo.success || !homeInfo.data || !homeInfo.data.sign3 || !homeInfo.data.sign1 || !homeInfo.data.timestamp) {
                console.error('[TeraboxService] Failed to fetch home info:', homeInfo);
                return { success: false, message: "Invalid home information received or failed to fetch." };
            }

            const sign = this._generateSign(homeInfo.data.sign3, homeInfo.data.sign1);
            if (!sign) return { success: false, message: "Failed to generate sign." };

            const res = await this._generateDownload(sign, fid, homeInfo.data.timestamp, ndus, appId, jsToken, dpLogId);
            if (!res || !res.downloadLink[0]?.dlink) {
                return { success: false, message: res.message || "Failed to retrieve download link." };
            }

            const dlink = res.downloadLink[0].dlink;

            // Cache the result for 15 minutes (Terabox links are usually valid for 8 hours, but 15m is safer)
            this.dlinkCache.set(fid, {
                dlink: dlink,
                expires: Date.now() + 15 * 60 * 1000
            });

            return { success: true, message: "Download link retrieved successfully.", downloadLink: dlink };
        } catch (error) {
            return { success: false, message: error.message || "Unknown error occurred." };
        }
    }

    async getFileStream(fileId) {
        try {
            let actualFsId = fileId;
            let filename = `file_${fileId}`;
            let filePath = null;

            // Resolve fileId to path and fs_id
            if (typeof fileId === 'string') {
                console.log(`[TeraboxService] Resolving ${fileId} to path...`);
                const dirsToSearch = ['/goals', '/profiles', '/uploads', '/'];
                for (const dir of dirsToSearch) {
                    const listResult = await this.fetchFileList(dir);
                    if (listResult.success && listResult.data && listResult.data.list) {
                        const fileObj = listResult.data.list.find(f =>
                            String(f.fs_id) === String(fileId) ||
                            f.server_filename === fileId ||
                            f.path === fileId
                        );
                        if (fileObj) {
                            actualFsId = fileObj.fs_id;
                            filename = fileObj.server_filename;
                            filePath = fileObj.path;
                            console.log(`[TeraboxService] Resolved ${fileId} to path: ${filePath} in ${dir}`);
                            break;
                        }
                    }
                }
            }

            const creds = this._getCredentials();
            const cookies = this._getCookies(creds);

            // Get download link using the standard method (handshake-based)
            const downloadResult = await this.getDownloadLink(creds.ndus, actualFsId, creds.appId, creds.jsToken, creds.dpLogId);
            if (!downloadResult.success) {
                // If handshake fails, try Rest 2.0 as fallback if we have the path
                if (filePath) {
                    console.log(`[TeraboxService] Handshake failed, trying Rest 2.0 fallback for path: ${filePath}`);
                    const downloadUrl = `https://dm.terabox.com/rest/2.0/pcs/file?method=download&app_id=${creds.appId}&path=${encodeURIComponent(filePath)}`;
                    const response = await axios({
                        method: 'get',
                        url: downloadUrl,
                        responseType: 'stream',
                        headers: {
                            'Cookie': cookies,
                            'User-Agent': this.userAgent,
                            'Referer': 'https://dm.terabox.com/main'
                        }
                    });
                    return { stream: response.data, contentLength: response.headers['content-length'], contentType: response.headers['content-type'], filename };
                }
                throw new Error(downloadResult.message || "Failed to get download link.");
            }

            const downloadUrl = downloadResult.downloadLink;
            console.log(`[TeraboxService] Fetching stream from dlink: ${downloadUrl}`);
            const response = await axios({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream',
                headers: {
                    'Cookie': cookies,
                    'User-Agent': this.userAgent,
                    'Referer': 'https://dm.terabox.com/main'
                }
            });

            return {
                stream: response.data,
                contentLength: response.headers['content-length'],
                contentType: response.headers['content-type'],
                filename: filename
            };

        } catch (error) {
            console.error('[TeraboxService] Get stream failed:', error);
            throw error;
        }
    }
}

module.exports = new TeraboxService();
