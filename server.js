const grpc = require('@grpc/grpc-js');
const workerProto = require('./proto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

const TeraboxUploader = require(process.env.TERABOX_SCRIPT_PATH || 'terabox-upload-tool');

const config = {
    ndus: 'Yb8V8X8peHuiKM4l9FZ6V46-EQBvieH3E19BpOEs',
    appId: '250528',
    jsToken: 'BB04F91D937F292A33FB2D21F7B47DA91B1C8EF6D73EE1123956827E6A3BE9E23C0B3085FD444331EFF8EB31596E3C597C3D9531FBBD5664DAC8EDAD7A91BF00',
    bdstoken: '50051ebcccc591e6c9563c49f48cf892',
    browserId: '1509IaJc0mCa5RYruyP3etYaUR3RwuBiZaDDEIpR4PUYFkT8WQlbFEZUS2Y='
};

let uploader = new TeraboxUploader(config);


async function UploadFile(call, callback) {
    const { file_data, filename, directory } = call.request;
    if (!file_data) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'file_data is required' });
    }

    console.log('terabox-worker: UploadFile called, bdstoken present:', !!config.bdstoken);

    // Create temp file with the data
    const tempPath = path.join(os.tmpdir(), 'upload-' + Date.now() + path.extname(filename));
    fs.writeFileSync(tempPath, file_data);

    try {
        let result = await uploader.uploadFile(tempPath, false, directory);
        if (!result.success) {
            console.log('terabox-worker: Upload failed with message:', result.message);
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
            success: result.success,
            message: result.message,
            data: result.data.list || []
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
        const result = await uploader.moveFiles(old_path, new_path, new_name);
        callback(null, { success: result.success, message: result.message });
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
        const result = await uploader.deleteFiles(paths.map(path => ({ path })));
        callback(null, { success: result.success, message: result.message });
    } catch (err) {
        console.error('Delete failed', err);
        callback({ code: grpc.status.INTERNAL, message: err.message || 'Delete failed' });
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
