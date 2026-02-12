const grpc = require('@grpc/grpc-js');
const workerProto = require('./proto');

const TeraboxUploader = require(process.env.TERABOX_SCRIPT_PATH || 'terabox-upload-tool');

const uploader = new TeraboxUploader({
    ndus: process.env.TERABOX_NDUS,
    appId: process.env.TERABOX_APP_ID,
    uploadId: process.env.TERABOX_UPLOAD_ID,
    jsToken: process.env.TERABOX_JS_TOKEN,
    browserId: process.env.TERABOX_BROWSER_ID,
});

async function UploadFile(call, callback) {
    const { file_path, directory } = call.request;
    if (!file_path) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'file_path is required' });
    }

    try {
        const result = await uploader.uploadFile(file_path, false, directory);
        callback(null, {
            success: true,
            message: 'File uploaded successfully',
            data: {
                fs_id: result.fs_id,
                path: result.path,
                server_filename: result.server_filename,
                size: result.size
            }
        });
    } catch (err) {
        console.error('Upload failed', err);
        callback({ code: grpc.status.INTERNAL, message: err.message || 'Upload failed' });
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
