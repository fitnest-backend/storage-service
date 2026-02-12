const grpc = require('@grpc/grpc-js');
const workerProto = require('./proto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');

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
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.terabox.com/');
        // Wait for login button and click
        await page.waitForSelector('.login-btn', { timeout: 10000 });
        await page.click('.login-btn');

        // Wait for login form
        await page.waitForSelector('#TANGRAM__PSP_4__userName', { timeout: 10000 });
        await page.type('#TANGRAM__PSP_4__userName', process.env.TERABOX_USERNAME);
        await page.type('#TANGRAM__PSP_4__password', process.env.TERABOX_PASSWORD);
        await page.click('#TANGRAM__PSP_4__submit');

        // Wait for login success
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        // Extract cookies
        const cookies = await page.cookies();
        const ndus = cookies.find(c => c.name === 'ndus')?.value;
        const bdstoken = cookies.find(c => c.name === 'BDUSS')?.value || '';

        // Get jsToken from API
        const apiResponse = await page.evaluate(async () => {
            try {
                const res = await fetch('https://www.terabox.com/api/home/info', {
                    credentials: 'include'
                });
                const data = await res.json();
                return data.jsToken;
            } catch (e) {
                return '';
            }
        });

        const jsToken = apiResponse || '';
        const appId = '250528';
        const browserId = '12345678'; // placeholder, perhaps generate

        // Update the uploader
        uploader = new TeraboxUploader({
            ndus,
            appId,
            jsToken,
            bdstoken,
            browserId
        });

        console.log('Tokens refreshed successfully');
    } catch (err) {
        console.error('Failed to refresh tokens', err);
    } finally {
        await browser.close();
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
