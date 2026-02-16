const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs');
const teraboxService = require('./src/services/terabox.service');
require('dotenv').config();

const PROTO_PATH = path.join(__dirname, 'protos/terabox.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const teraboxProto = grpc.loadPackageDefinition(packageDefinition).az.fitnest.terabox;

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

const uploadFile = (call, callback) => {
    let tempFilePath = '';
    let writeStream = null;
    let metadata = null;

    call.on('data', (chunk) => {
        if (chunk.metadata) {
            metadata = chunk.metadata;
            console.log(`[gRPC] Starting upload for ${metadata.filename} to ${metadata.directory}`);
            tempFilePath = path.join(TEMP_DIR, `grpc-${Date.now()}-${metadata.filename}`);
            writeStream = fs.createWriteStream(tempFilePath);
        } else if (chunk.chunk_data) {
            if (writeStream) {
                writeStream.write(chunk.chunk_data);
            }
        }
    });

    call.on('end', async () => {
        if (writeStream) {
            writeStream.end();
            writeStream.on('finish', async () => {
                try {
                    const finalDirectory = metadata.directory || '/uploads';
                    console.log(`[gRPC] File received. Uploading to TeraBox: ${finalDirectory}`);

                    const result = await teraboxService.uploadFile(tempFilePath, finalDirectory);

                    // Cleanup temp file
                    try {
                        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                    } catch (e) {
                        console.error('[gRPC] Failed to cleanup temp file:', e);
                    }

                    if (result.success) {
                        // Cleanup root (optional but good for hygiene)
                        teraboxService.cleanupRoot().catch(e => console.error('[gRPC] Root cleanup failed:', e));

                        callback(null, {
                            success: true,
                            message: 'File uploaded successfully',
                            data: {
                                path: result.fileDetails.path,
                                size: result.fileDetails.size,
                                md5: result.fileDetails.md5,
                                fs_id: result.fileDetails.fs_id
                            }
                        });
                    } else {
                        callback({
                            code: grpc.status.INTERNAL,
                            details: result.message || 'Upload failed'
                        });
                    }
                } catch (error) {
                    console.error('[gRPC] Upload error:', error);
                    // Ensure cleanup on error
                    try {
                        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                    } catch (e) { }

                    callback({
                        code: grpc.status.INTERNAL,
                        details: error.message
                    });
                }
            });
        } else {
            callback({
                code: grpc.status.INVALID_ARGUMENT,
                details: "No data received"
            });
        }
    });

    call.on('error', (err) => {
        console.error('[gRPC] Stream error:', err);
        if (writeStream) writeStream.end();
        if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    });
};

const getDownloadUrl = async (call, callback) => {
    const fileId = call.request.file_id;
    console.log(`[gRPC] GetDownloadUrl for fileId: ${fileId}`);

    try {
        const result = await teraboxService.downloadFile(fileId);
        callback(null, {
            success: true,
            message: 'Download URL retrieved',
            download_url: result.dlink
        });
    } catch (error) {
        console.error('[gRPC] Download error:', error);
        callback({
            code: grpc.status.INTERNAL,
            details: error.message || 'Download failed'
        });
    }
};

const deleteFiles = async (call, callback) => {
    const paths = call.request.paths;
    console.log(`[gRPC] DeleteFiles: ${JSON.stringify(paths)}`);

    try {
        const result = await teraboxService.deleteFiles(paths);
        if (result.success) {
            callback(null, {
                success: true,
                message: result.message
            });
        } else {
            callback({
                code: grpc.status.INTERNAL,
                details: result.message
            });
        }
    } catch (error) {
        console.error('[gRPC] Delete error:', error);
        callback({
            code: grpc.status.INTERNAL,
            details: error.message || 'Delete failed'
        });
    }
};

const main = () => {
    const server = new grpc.Server();
    server.addService(teraboxProto.TeraBoxService.service, {
        UploadFile: uploadFile,
        GetDownloadUrl: getDownloadUrl,
        DeleteFiles: deleteFiles
    });

    const port = process.env.TERABOX_WORKER_PORT || '9090';
    const address = `0.0.0.0:${port}`;

    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            console.error(`Failed to bind gRPC server: ${err}`);
            return;
        }
        console.log(`TeraBox gRPC worker listening on ${address}`);
        server.start();
    });
};

main();
