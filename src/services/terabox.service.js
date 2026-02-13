const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const FormData = require('form-data');
const config = require('../config/terabox.config');

const { ndus, appId, jsToken, bdstoken, browserId } = config.credentials;

async function uploadFile(filePath, directory = '/') {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const fileSize = fileBuffer.length;
        const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
        const fileName = filePath.split('/').pop();

        // Step 1: Precreate
        const precreateUrl = `https://dm.terabox.com/api/precreate?app_id=${appId}&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dp-logid=123456789`;
        const precreateData = new URLSearchParams({
            path: `/${fileName}`,
            size: fileSize.toString(),
            autoinit: '1',
            target_path: directory,
            block_list: JSON.stringify([md5]),
            local_mtime: Math.floor(Date.now() / 1000).toString()
        });

        const precreateResponse = await axios.post(precreateUrl, precreateData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': `ndus=${ndus}; browserid=${browserId};`,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15'
            }
        });

        if (precreateResponse.data.errno !== 0) {
            throw new Error(`Precreate failed: ${precreateResponse.data.errmsg || 'Unknown error'}`);
        }

        const uploadId = precreateResponse.data.uploadid;

        // Step 2: Upload file
        const uploadUrl = `https://c-jp.1024terabox.com/rest/2.0/pcs/superfile2?method=upload&app_id=${appId}&channel=dubox&clienttype=0&web=1&path=${encodeURIComponent(`/${fileName}`)}&uploadid=${uploadId}&uploadsign=0&partseq=0`;

        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath), fileName);

        const uploadResponse = await axios.post(uploadUrl, formData, {
            headers: {
                'Cookie': `ndus=${ndus}; browserid=${browserId};`,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // Step 3: Create
        const createUrl = `https://dm.terabox.com/api/create?isdir=0&rtype=1&bdstoken=${bdstoken}&app_id=${appId}&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dp-logid=123456789`;
        const createData = new URLSearchParams({
            path: `/${fileName}`,
            size: fileSize.toString(),
            uploadid: uploadId,
            target_path: directory,
            block_list: JSON.stringify([md5]),
            local_mtime: Math.floor(Date.now() / 1000).toString()
        });

        const createResponse = await axios.post(createUrl, createData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': `ndus=${ndus}; browserid=${browserId};`,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15'
            }
        });

        if (createResponse.data.errno !== 0) {
            throw new Error(`Create failed: ${createResponse.data.errmsg || 'Unknown error'}`);
        }

        return {
            success: true,
            fileDetails: {
                path: `/${fileName}`,
                size: fileSize,
                md5: md5
            }
        };
    } catch (error) {
        console.error('Upload error:', error.response ? error.response.data : error.message);
        return {
            success: false,
            message: error.response ? error.response.data.errmsg || error.message : error.message
        };
    }
}

async function fetchFileList(directory = '/') {
    try {
        const url = `https://dm.terabox.com/api/list?app_id=${appId}&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dp-logid=123456789&order=time&desc=1&dir=${encodeURIComponent(directory)}&num=100&page=1&showempty=0`;
        const response = await axios.get(url, {
            headers: {
                'Cookie': `ndus=${ndus}; browserid=${browserId};`,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15'
            }
        });
        return response.data;
    } catch (error) {
        throw error;
    }
}

async function downloadFile(fileId) {
    // Implement if needed
    throw new Error('Not implemented');
}

async function deleteFiles(paths) {
    // Implement if needed
    throw new Error('Not implemented');
}

async function moveFile(oldPath, newPath, newName) {
    // Implement if needed
    throw new Error('Not implemented');
}

module.exports = {
    uploadFile,
    fetchFileList,
    downloadFile,
    deleteFiles,
    moveFile
};
