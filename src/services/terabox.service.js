const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/terabox.config');
const FormData = require('form-data');
const authService = require('./auth.service');

class TeraboxService {
    constructor() {
        this.baseUrl = 'https://dm.terabox.com';
        this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15';
    }

    _generateLogId() {
        return crypto.randomBytes(16).toString('hex');
    }

    getCommonHeaders() {
        const creds = config.credentials;
        const cookieStr = [
            `ndus=${creds.ndus}`,
            `__bid_n=${creds.bidN}`,
            `browserid=${creds.browserId}`,
            `ndut_fmt=${creds.ndutFmt}`,
            `ndut_fmv=${creds.ndutFmv}`,
            'lang=en',
            `csrfToken=${creds.csrfToken}`
        ].join('; ');

        return {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': this.userAgent,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://dm.terabox.com/main?category=all',
            'Origin': 'https://dm.terabox.com',
            'Cookie': cookieStr
        };
    }

    getCommonParams(extra = {}) {
        return {
            app_id: config.credentials.appId,
            web: '1',
            channel: 'dubox',
            clienttype: '0',
            jsToken: config.credentials.jsToken,
            ...extra
        };
    }

    async checkLogin() {
        try {
            const response = await axios.get(`${this.baseUrl}/api/check/login`, {
                params: this.getCommonParams(),
                headers: this.getCommonHeaders()
            });
            console.log('Login check response:', response.data);
            return response.data;
        } catch (error) {
            console.error('Login check failed:', error.message);
            throw error;
        }
    }

    async uploadFile(filePath, directory = '/uploads', retryCount = 0) {
        try {
            const fileName = path.basename(filePath);
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;
            const fileMd5 = crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
            const unixTs = Math.floor(stats.mtimeMs / 1000);

            // Step 1: Precreate
            console.log(`Precreating file: ${fileName} in ${directory}`);
            const precreateParams = this.getCommonParams({ 'dp-logid': this._generateDpLogId() });
            const precreateBody = new URLSearchParams({
                path: `${directory}/${fileName}`,
                autoinit: '1',
                target_path: directory,
                block_list: JSON.stringify([fileMd5]),
                size: fileSize.toString(),
                file_limit_switch_v34: 'true',
                local_mtime: unixTs.toString()
            });

            const precreateRes = await axios.post(`${this.baseUrl}/api/precreate`, precreateBody.toString(), {
                params: precreateParams,
                headers: {
                    ...this.getCommonHeaders(),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (precreateRes.data.errno !== 0) {
                // Check for auth error (errno -6)
                if ((precreateRes.data.errno === -6 || precreateRes.data.errmsg?.includes('not login')) && retryCount < 1) {
                    console.log('Auth error detected. Attempting to refresh tokens...');
                    await authService.refreshTokens();
                    console.log('Tokens refreshed. Retrying upload...');
                    return this.uploadFile(filePath, directory, retryCount + 1);
                }
                throw new Error(`Precreate failed (errno ${precreateRes.data.errno}): ${precreateRes.data.errmsg || 'Unknown error'}`);
            }

            const uploadId = precreateRes.data.uploadid;
            console.log(`Precreate success. UploadID: ${uploadId}`);

            // Step 2: Upload bits
            // Browser uses szb-cdata.terabox.com for this session
            const uploadHost = precreateRes.data.host || 'szb-cdata.terabox.com';
            const uploadUrl = `https://${uploadHost}/rest/2.0/pcs/superfile2`;

            const uploadParams = {
                method: 'upload',
                app_id: config.credentials.appId,
                channel: 'dubox',
                clienttype: '0',
                web: '1',
                logid: this._generateLogId(),
                path: `${directory}/${fileName}`,
                uploadid: uploadId,
                uploadsign: '0',
                partseq: '0'
            };

            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));

            console.log(`Uploading file data to ${uploadUrl} with params and cookies`);
            const uploadRes = await axios.post(uploadUrl, formData, {
                params: uploadParams,
                headers: {
                    ...this.getCommonHeaders(),
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                withCredentials: true
            });

            if (uploadRes.data.errno && uploadRes.data.errno !== 0) {
                // Verify if auth error can happen here too
                if ((uploadRes.data.errno === -6) && retryCount < 1) {
                    console.log('Auth error during upload bits. Refreshing tokens...');
                    await authService.refreshTokens();
                    return this.uploadFile(filePath, directory, retryCount + 1);
                }
                throw new Error(`Upload failed (errno ${uploadRes.data.errno}): ${uploadRes.data.errmsg || 'Unknown error'}`);
            }

            // Step 3: Create
            console.log(`Finalizing create for ${fileName}`);
            const createParams = this.getCommonParams({
                isdir: '0',
                rtype: '1',
                bdstoken: config.credentials.bdstoken,
                'dp-logid': this._generateDpLogId()
            });
            const createBody = new URLSearchParams({
                path: `${directory}/${fileName}`,
                size: fileSize.toString(),
                uploadid: uploadId,
                target_path: directory,
                block_list: JSON.stringify([fileMd5]),
                local_mtime: unixTs.toString()
            });

            const createRes = await axios.post(`${this.baseUrl}/api/create`, createBody.toString(), {
                params: createParams,
                headers: {
                    ...this.getCommonHeaders(),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (createRes.data.errno !== 0) {
                if ((createRes.data.errno === -6) && retryCount < 1) {
                    console.log('Auth error during create. Refreshing tokens...');
                    await authService.refreshTokens();
                    return this.uploadFile(filePath, directory, retryCount + 1);
                }
                throw new Error(`Create failed (errno ${createRes.data.errno}): ${createRes.data.errmsg || 'Unknown error'}`);
            }

            return {
                success: true,
                message: 'File uploaded successfully',
                fileDetails: createRes.data
            };

        } catch (error) {
            console.error('Upload failed:', error.response?.data || error.message);

            // Catch-all for retry if it was a network 401/403 (though axios usually throws for strict status codes only if configured)
            // But checking error message might helps
            if ((error.message.includes('not login') || error.response?.status === 401) && retryCount < 1) {
                console.log('Caught auth error in catch block. Refreshing...');
                await authService.refreshTokens();
                return this.uploadFile(filePath, directory, retryCount + 1);
            }

            return {
                success: false,
                message: error.message
            };
        }
    }

    _generateDpLogId() {
        return crypto.randomBytes(10).toString('hex').toLowerCase();
    }

    async fetchFileList(directory = '/') {
        try {
            const params = this.getCommonParams({
                'dp-logid': this._generateDpLogId(),
                order: 'time',
                desc: '1',
                dir: directory,
                num: '100',
                page: '1',
                showempty: '0'
            });

            const response = await axios.get(`${this.baseUrl}/api/list`, {
                params: params,
                headers: this.getCommonHeaders()
            });

            return {
                success: response.data.errno === 0,
                data: response.data,
                message: response.data.errmsg
            };
        } catch (error) {
            console.error('Fetch file list failed:', error.message);
            throw error;
        }
    }

    async deleteFiles(filePaths) {
        try {
            const params = this.getCommonParams({
                'dp-logid': this._generateDpLogId()
            });
            const body = new URLSearchParams({
                filelist: JSON.stringify(filePaths)
            });

            const response = await axios.post(`${this.baseUrl}/api/filemanager?opera=delete`, body.toString(), {
                params: params,
                headers: {
                    ...this.getCommonHeaders(),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            return {
                success: response.data.errno === 0,
                result: response.data,
                message: response.data.errmsg
            };
        } catch (error) {
            console.error('Delete failed:', error.message);
            throw error;
        }
    }
}

module.exports = new TeraboxService();
