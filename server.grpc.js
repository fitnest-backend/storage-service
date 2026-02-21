if (!globalThis.crypto) {
    const { webcrypto } = require('node:crypto');
    globalThis.crypto = webcrypto;
}

const config = require('./src/config/storage.config');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs');
const storageService = require('./src/services/storage.service');
const { StorageService } = storageService;
const { initRedis } = require('./src/config/redis');

const PROTO_PATH = path.join(__dirname, 'protos/storage.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const storageProto = grpc.loadPackageDefinition(packageDefinition).az.fitnest.storage;

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

const extractPatternAContext = (call) => {
    const metadata = call.metadata.getMap();
    const gatewayFlag = metadata['x-from-gateway'];
    const userId = metadata['x-user-id'];
    const requestId = metadata['x-request-id'];
    const caller = metadata['x-service-name'];

    if (gatewayFlag === '1' && userId) {
        return {
            id: userId,
            requestId: requestId,
            caller: caller,
            tenantId: metadata['x-tenant-id'],
            scopes: metadata['x-scopes']?.split(' ') || []
        };
    }
    return null;
};

const uploadFile = (call, callback) => {
    const context = extractPatternAContext(call);
    if (context) {
        console.log(`[gRPC] Authenticated user ${context.id} via Pattern A (from ${context.caller})`);
    }

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
                    const oldPath = metadata.old_path || null;
                    console.log(`[gRPC] File received. Uploading to MEGA: ${finalDirectory}`);

                    const result = await storageService.uploadFile(tempFilePath, finalDirectory, oldPath);

                    // Cleanup temp file
                    try {
                        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                    } catch (e) {
                        console.error('[gRPC] Failed to cleanup temp file:', e);
                    }

                    if (result.success) {
                        const fsId = StorageService.hashNodeId(result.fileDetails.nodeId);
                        console.log(`[gRPC] returning fsId: ${fsId} for nodeId: ${result.fileDetails.nodeId}`);

                        callback(null, {
                            success: true,
                            message: 'File uploaded successfully',
                            data: {
                                path: result.fileDetails.path,
                                size: result.fileDetails.size.toString(),
                                md5: result.fileDetails.md5 || '',
                                fs_id: fsId.toString()
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
        const result = await storageService.downloadFile(fileId);
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

const downloadFile = async (call) => {
    const fileId = call.request.file_id;
    console.log(`[gRPC] DownloadFile request for fileId: ${fileId}`);

    try {
        const { stream, contentLength, contentType, filename } = await storageService.getFileStream(fileId);

        // Send metadata first
        call.write({
            metadata: {
                filename: filename,
                directory: '/', // Unknown or irrelevant for download
                content_type: contentType || 'application/octet-stream'
            }
        });

        stream.on('data', (chunk) => {
            call.write({ file_data: chunk });
        });

        stream.on('end', () => {
            call.end();
            console.log(`[gRPC] DownloadFile finished for ${fileId}`);
        });

        stream.on('error', (err) => {
            console.error(`[gRPC] Stream error for ${fileId}:`, err);
            call.destroy(new Error('Stream error'));
        });

    } catch (error) {
        console.error('[gRPC] DownloadFile error:', error);
        call.emit('error', {
            code: grpc.status.INTERNAL,
            details: error.message || 'Download failed'
        });
    }
};

const deleteFiles = async (call, callback) => {
    const paths = call.request.paths;
    console.log(`[gRPC] DeleteFiles: ${JSON.stringify(paths)}`);

    try {
        const result = await storageService.deleteFiles(paths);
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

const main = async () => {
    await initRedis();
    const server = new grpc.Server();
    server.addService(storageProto.StorageService.service, {
        UploadFile: uploadFile,
        GetDownloadUrl: getDownloadUrl,
        DownloadFile: downloadFile,
        DeleteFiles: deleteFiles
    });

    const port = config.server.port || '9090';
    const address = `0.0.0.0:${port}`;

    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            console.error(`Failed to bind gRPC server: ${err}`);
            return;
        }
        console.log(`Storage gRPC worker listening on ${address}`);
    });
};

main();
