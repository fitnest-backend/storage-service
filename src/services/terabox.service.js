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
    }

    _generateDpLogId() {
        return crypto.randomBytes(10).toString('hex').toUpperCase();
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
            dpLogId: this._generateDpLogId()
        };
    }

    _getCookies(creds) {
        return `lang=en; ndus=${creds.ndus};`;
    }

    async uploadFile(filePath, directory = '/', retryCount = 0) {
        try {
            const fileName = path.basename(filePath);
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;
            const fileMd5 = crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');

            const creds = this._getCredentials();
            const cookies = this._getCookies(creds);

            // 1. Precreate
            const precreateUrl = buildPrecreateUrl(creds.appId, creds.jsToken, creds.dpLogId);
            console.log(`[TeraboxService] Precreating ${fileName} at ${precreateUrl}`);

            const precreateParams = new URLSearchParams({
                path: `${directory}/${fileName}`,
                autoinit: '1',
                target_path: directory,
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
            const uploadUrl = buildUploadUrl(fileName, uploadId, creds.appId);
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
                path: `${directory}/${fileName}`,
                size: fileSize,
                uploadid: uploadId,
                target_path: directory,
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
            const url = "https://www.1024terabox.com/api/filemanager";

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
            const url = "https://www.1024terabox.com/api/filemanager";

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
}

module.exports = new TeraboxService();
