const grpc = require('@grpc/grpc-js');
const workerProto = require('./proto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const TeraboxUploader = require(process.env.TERABOX_SCRIPT_PATH || 'terabox-upload-tool');

let uploader = new TeraboxUploader({
    ndus: process.env.TERABOX_NDUS,
    appId: process.env.TERABOX_APP_ID,
    uploadId: process.env.TERABOX_UPLOAD_ID,
    jsToken: process.env.TERABOX_JS_TOKEN,
    browserId: process.env.TERABOX_BROWSER_ID,
    bdstoken: process.env.TERABOX_BDSTOKEN,
});


async function UploadFile(call, callback) {
    const { file_data, filename, directory } = call.request;
    if (!file_data) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'file_data is required' });
    }

    // Create temp file with the data
    const tempPath = path.join(os.tmpdir(), 'upload-' + Date.now() + path.extname(filename));
    fs.writeFileSync(tempPath, file_data);

    try {
        let result = await uploader.uploadFile(tempPath, false, directory);
        if (!result.success && result.message.includes('user not login')) {
            console.log('Authentication failed, refreshing tokens...');
            await refreshTokens();
            result = await uploader.uploadFile(tempPath, false, directory);
        }
        if (!result.success) {
            return callback({ code: grpc.status.INTERNAL, message: result.message });
        }
        callback(null, {
            success: true,
            message: 'File uploaded successfully',
            data: result.fileDetails
        });
    } catch (err) {
        console.error('Upload failed', err);
        callback({ code: grpc.status.INTERNAL, message: err.message || 'Upload failed' });
    } finally {
        // Clean up temp file
        try {
            fs.unlinkSync(tempPath);
        } catch (cleanupErr) {
            console.error('Failed to clean up temp file:', cleanupErr);
        }
    }
}

async function FetchFileList(call, callback) {
    const { directory = '/' } = call.request;

    try {
        const result = await uploader.fetchFileList(directory);
        callback(null, {
            success: true,
            message: 'File list fetched',
            data: result.map(f => ({
                fs_id: f.fs_id,
                path: f.path,
                server_filename: f.server_filename,
                size: f.size
            }))
        });
    } catch (err) {
        console.error('Fetch file list failed', err);
        callback({ code: grpc.status.INTERNAL, message: err.message || 'Fetch file list failed' });
    }
}

async function DownloadFile(call, callback) {
    const { file_id } = call.request;
    if (!file_id) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'file_id is required' });
    }

    try {
        const result = await uploader.downloadFile(file_id);
        callback(null, {
            success: true,
            message: 'Download URL generated',
            download_url: result
        });
    } catch (err) {
        console.error('Download failed', err);
        callback({ code: grpc.status.INTERNAL, message: err.message || 'Download failed' });
    }
}

async function MoveFile(call, callback) {
    const { old_path, new_path, new_name } = call.request;
    if (!old_path || !new_path) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'old_path and new_path are required' });
    }

    try {
        await uploader.moveFiles(old_path, new_path, new_name);
        callback(null, { success: true, message: 'File moved successfully' });
    } catch (err) {
        console.error('Move failed', err);
        callback({ code: grpc.status.INTERNAL, message: err.message || 'Move failed' });
    }
}

async function DeleteFiles(call, callback) {
    const { paths } = call.request;
    if (!paths || paths.length === 0) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'paths array is required' });
    }

    try {
        await uploader.deleteFiles(paths);
        callback(null, { success: true, message: 'Files deleted' });
    } catch (err) {
        console.error('Delete failed', err);
        callback({ code: grpc.status.INTERNAL, message: err.message || 'Delete failed' });
    }
}

async function refreshTokens() {
    try {
        // Get public key for password encryption
        const pubKeyRes = await fetch('https://passport.baidu.com/v2/getpublickey');
        const pubKeyData = await pubKeyRes.json();
        const pubkey = pubKeyData.pubkey;

        // Encrypt password
        const encryptedPwd = crypto.publicEncrypt(pubkey, Buffer.from(process.env.TERABOX_PASSWORD)).toString('base64');

        // Get jsToken from home/info
        const homeRes = await fetch('https://www.terabox.com/api/home/info');
        const homeData = await homeRes.json();
        const jsToken = homeData.jsToken || '';

        // Login request
        const loginUrl = `https://www.terabox.com/passport/login?app_id=250528&web=1&channel=dubox&clienttype=0&version=0&devuid=0&cuid=0&lang=en&jt=&app=universe&reg_source=home&jsToken=${jsToken}`;
        const loginBody = new URLSearchParams({
            client: 'web',
            pass_version: '2.8',
            lang: 'en',
            clientfrom: 'h5',
            pcftoken: '39cd57946219468e8594f2ac875e81c2', // placeholder, may need to generate
            prand: '57b38d7cd5ffb33c9559791ce1f25fe478ba0149', // placeholder
            email: process.env.TERABOX_USERNAME,
            pwd: encryptedPwd,
            seval: 'ef3f97f3bbfc141943605bb820f8a0ce', // placeholder
            random: '9', // placeholder
            identity: '',
            g_identity: '',
            vcode: '',
            vcode_str: '',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            need_merge: '0',
            ymg_token: 'fc63e837b0e417624b3798edcb95adbfac64eb0029065d819c2cdba0600b2ffe3c870a66665b6a89b1c745e68c799a21a8a7a89683a27ed8ea7533139564e39a8583fa554050002b1311721aeb6e7d2f6efa070394d46c75488d1e968a7a386a7594d23767bb7151b484c32311de8990fa7b3c71989357ec17a3a9a7cb091478', // placeholder
            op_type: '2',
            reg_source: 'home',
            psign: '0'
        });

        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
                'Referer': 'https://www.terabox.com/'
            },
            body: loginBody
        });

        const loginData = await loginRes.json();
        if (loginData.errno !== 0) {
            throw new Error(`Login failed: ${loginData.errmsg}`);
        }

        // Extract cookies from response
        const setCookies = loginRes.headers.get('set-cookie');
        const cookies = {};
        if (setCookies) {
            setCookies.split(',').forEach(cookie => {
                const [nameValue] = cookie.split(';');
                const [name, value] = nameValue.split('=');
                cookies[name.trim()] = value;
            });
        }

        const ndus = cookies.ndus;
        const bdstoken = cookies.BDUSS;

        // Get jsToken with cookies
        const cookieString = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
        const infoRes = await fetch('https://www.terabox.com/api/home/info', {
            headers: {
                'Cookie': cookieString
            }
        });
        const infoData = await infoRes.json();
        const updatedJsToken = infoData.jsToken || jsToken;

        const appId = '250528';
        const browserId = '12345678';

        // Update the uploader
        uploader = new TeraboxUploader({
            ndus,
            appId,
            jsToken: updatedJsToken,
            bdstoken,
            browserId
        });

        console.log('Tokens refreshed successfully');
    } catch (err) {
        console.error('Failed to refresh tokens', err);
    }
}

function main() {
    const server = new grpc.Server();
    console.log('workerProto:', workerProto);
    console.log('TeraBoxWorker:', workerProto.TeraBoxWorker);
    console.log('service:', workerProto.TeraBoxWorker ? workerProto.TeraBoxWorker.service : 'undefined');
    try {
        server.addService(workerProto.TeraBoxWorker.service, {
            UploadFile: UploadFile,
            FetchFileList: FetchFileList,
            DownloadFile: DownloadFile,
            MoveFile: MoveFile,
            DeleteFiles: DeleteFiles
        });
        console.log('Service added successfully');
    } catch (err) {
        console.error('Error adding service:', err);
    }

    const port = process.env.TERABOX_WORKER_PORT || 9090;
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err != null) {
            return console.error(err);
        }
        console.log(`TeraBox gRPC worker listening on port ${port}`);
        server.start();
    });
}

main();
