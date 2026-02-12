const grpc = require('@grpc/grpc-js');
const workerProto = require('./proto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

const TeraboxUploader = require(process.env.TERABOX_SCRIPT_PATH || 'terabox-upload-tool');

const config = {
    ndus: 'Yb8V8X8peHuiJtOYHXFKDONhgKtqm-0Ymt8erKz0',
    appId: '250528',
    jsToken: 'EEAA220681598B4B9F065E950B04E2B0B86C83FE21640648FE96C0A179DEF9971F2F3458FD24A0330A2F450B8CB7BE59D17B19EA0C2ED36576F75E7F8BCF3DF0012A788F59A9B9A814CC168B0D55E89F0CE12EDC69378472537059AEC8D99443',
    bdstoken: 'e6752242f4f441b90064a7b220042c60',
    browserId: '12345678',
    dpLogId: '26535400593617580033'
};

function buildListUrl(appId, directory, jsToken, dpLogId) {
  return `https://www.1024terabox.com/api/list?app_id=${appId}&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dp-logid=${dpLogId}&order=time&desc=1&dir=${encodeURIComponent(directory)}&num=100&page=1&showempty=0`;
}

const deleteFile = async (filelist, config) => {
  const { appId, jsToken, browserId, ndus, dpLogId } = config;
  const url = "https://www.1024terabox.com/api/filemanager";

  const params = {
    opera: "delete",
    app_id: appId,
    jsToken: jsToken,
    "dp-logid": dpLogId,
  };

  const data = new URLSearchParams();
  data.append("filelist", JSON.stringify(filelist));

  const headers = {
    "Cookie": `browserid=${browserId}; ndus=${ndus};`,
  };

  try {
    const response = await axios.post(url, data.toString(), {
      headers,
      params,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : error.message;
  }
};

const moveFile = async (filelist, config) => {
  const { appId, jsToken, browserId, ndus, dpLogId } = config;
  const url = "https://www.1024terabox.com/api/filemanager";

  const params = {
    opera: "move",
    app_id: appId,
    jsToken: jsToken,
    "dp-logid": dpLogId,
  };

  const data = new URLSearchParams();
  data.append("filelist", JSON.stringify(filelist));

  const headers = {
    "Cookie": `browserid=${browserId}; ndus=${ndus};`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  try {
    const response = await axios.post(url, data.toString(), {
      headers,
      params,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : error.message;
  }
};

let uploader = new TeraboxUploader(config);


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
        const url = buildListUrl(config.appId, directory, config.jsToken, config.dpLogId);
        const headers = {
            "Cookie": `browserid=${config.browserId}; ndus=${config.ndus};`,
        };
        const response = await axios.get(url, { headers });
        callback(null, {
            success: true,
            message: 'File list fetched',
            data: response.data.list || []
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
        const filelist = [{ path: old_path, dest: new_path, newname: new_name }];
        const result = await moveFile(filelist, config);
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
        const filelist = paths.map(path => ({ path }));
        const result = await deleteFile(filelist, config);
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
