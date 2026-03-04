import storageService from '../services/storage.service.js';
import { promises as fs } from 'fs';
import { getMessage, ApiResponse, ApiError } from '../utils/response_util.js';

function getLang(req) {
    const lang = req.header('Accept-Language');
    if (lang && (lang.startsWith('az') || lang.startsWith('AZ'))) return 'az';
    if (lang && (lang.startsWith('ru') || lang.startsWith('RU'))) return 'ru';
    return 'en';
}

async function uploadFile(req, res) {
    const lang = getLang(req);
    const path = req.originalUrl;
    try {
        const file = req.file;
        if (!file) {
            console.error('Upload attempt with no file');
            const error = ApiError.builder()
                .code('BAD_REQUEST')
                .message(getMessage('error.no_file_uploaded', lang))
                .status(400)
                .path(path)
                .build();
            return res.status(400).json(ApiResponse.error(error));
        }

        const directory = req.query.directory || req.body.directory;
        let finalDirectory = '/uploads'; // default
        if (req.body.type === 'profile') {
            finalDirectory = '/profiles';
        } else if (req.body.type === 'goal') {
            finalDirectory = '/goals';
        } else if (directory) {
            finalDirectory = directory;
        }

        const result = await storageService.uploadFile(file.path, finalDirectory);

        // Clean up temp file
        try {
            await fs.unlink(file.path);
        } catch (cleanupErr) {
            console.error('Failed to clean up temp file:', cleanupErr);
        }

        if (result.success) {
            res.json(ApiResponse.success(result.fileDetails));
        } else {
            console.error('MEGA upload failed logic:', result.message);
            const error = ApiError.builder()
                .code('UPLOAD_FAILED')
                .message(getMessage('error.upload_failed', lang))
                .status(500)
                .path(path)
                .build();
            res.status(500).json(ApiResponse.error(error));
        }
    } catch (error) {
        console.error('Upload controller error:', error);
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Failed to clean up temp file in error handler:', unlinkError);
            }
        }
        const apiError = ApiError.builder()
            .code('INTERNAL_SERVER_ERROR')
            .message(getMessage('error.internal_server_error', lang))
            .status(500)
            .path(path)
            .build();
        res.status(500).json(ApiResponse.error(apiError));
    }
}

async function getFileList(req, res) {
    const lang = getLang(req);
    const path = req.originalUrl;
    try {
        const directory = req.query.directory || '/';
        const result = await storageService.fetchFileList(directory);
        if (result.success) {
            res.json(ApiResponse.success(result.data.list));
        } else {
            const apiError = ApiError.builder()
                .code('FETCH_FAILED')
                .message(getMessage('error.fetch_failed', lang))
                .status(500)
                .path(path)
                .build();
            res.status(500).json(ApiResponse.error(apiError));
        }
    } catch (error) {
        console.error('Fetch file list error:', error);
        const apiError = ApiError.builder()
            .code('FETCH_FAILED')
            .message(getMessage('error.fetch_failed', lang))
            .status(500)
            .path(path)
            .build();
        res.status(500).json(ApiResponse.error(apiError));
    }
}

async function downloadFile(req, res) {
    const lang = getLang(req);
    const path = req.originalUrl;
    try {
        const fileId = req.query.fileId || req.params.fileId;
        if (!fileId) {
            const error = ApiError.builder()
                .code('BAD_REQUEST')
                .message(getMessage('error.bad_request', lang))
                .status(400)
                .path(path)
                .build();
            return res.status(400).json(ApiResponse.error(error));
        }

        const result = await storageService.downloadFile(fileId);
        res.json(ApiResponse.success({
            download_url: result.dlink
        }));
    } catch (error) {
        console.error('Download error:', error);
        const apiError = ApiError.builder()
            .code('DOWNLOAD_FAILED')
            .message(getMessage('error.unexpected', lang))
            .status(500)
            .path(path)
            .build();
        res.status(500).json(ApiResponse.error(apiError));
    }
}

async function deleteFiles(req, res) {
    const lang = getLang(req);
    const path = req.originalUrl;
    try {
        const paths = req.body;
        if (!paths || !Array.isArray(paths)) {
            const error = ApiError.builder()
                .code('BAD_REQUEST')
                .message(getMessage('error.bad_request', lang))
                .status(400)
                .path(path)
                .build();
            return res.status(400).json(ApiResponse.error(error));
        }

        const result = await storageService.deleteFiles(paths);
        if (result.success) {
            res.json(ApiResponse.success(null));
        } else {
            const apiError = ApiError.builder()
                .code('DELETE_FAILED')
                .message(getMessage('error.delete_failed', lang))
                .status(500)
                .path(path)
                .build();
            res.status(500).json(ApiResponse.error(apiError));
        }
    } catch (error) {
        console.error('Delete error:', error);
        const apiError = ApiError.builder()
            .code('DELETE_FAILED')
            .message(getMessage('error.delete_failed', lang))
            .status(500)
            .path(path)
            .build();
        res.status(500).json(ApiResponse.error(apiError));
    }
}

async function moveFile(req, res) {
    const lang = getLang(req);
    const path = req.originalUrl;
    try {
        const { old_path, new_path, new_name } = req.body;
        if (!old_path || !new_path) {
            const error = ApiError.builder()
                .code('BAD_REQUEST')
                .message(getMessage('error.bad_request', lang))
                .status(400)
                .path(path)
                .build();
            return res.status(400).json(ApiResponse.error(error));
        }

        const result = await storageService.moveFiles([{ path: old_path, dest: new_path, newname: new_name }]);
        if (result.success) {
            res.json(ApiResponse.success(null));
        } else {
            const apiError = ApiError.builder()
                .code('MOVE_FAILED')
                .message(getMessage('error.move_failed', lang))
                .status(500)
                .path(path)
                .build();
            res.status(500).json(ApiResponse.error(apiError));
        }
    } catch (error) {
        console.error('Move error:', error);
        const apiError = ApiError.builder()
            .code('MOVE_FAILED')
            .message(getMessage('error.move_failed', lang))
            .status(500)
            .path(path)
            .build();
        res.status(500).json(ApiResponse.error(apiError));
    }
}

async function streamFile(req, res) {
    const lang = getLang(req);
    const path = req.originalUrl;
    try {
        const fileId = req.params.fileId || req.params.fsId;
        const { stream, contentLength, contentType, filename } = await storageService.getFileStream(fileId);

        if (contentType) res.setHeader("Content-Type", contentType);
        if (contentLength) res.setHeader("Content-Length", contentLength);
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.setHeader("Cache-Control", "public, max-age=3600");

        stream.pipe(res);

        stream.on('error', (err) => {
            console.error('[UploadController] Stream error:', err);
            if (!res.headersSent) {
                const apiError = ApiError.builder()
                    .code('STREAM_FAILED')
                    .message(getMessage('error.stream_failed', lang))
                    .status(500)
                    .path(path)
                    .build();
                res.status(500).json(ApiResponse.error(apiError));
            }
        });
    } catch (e) {
        console.error('[UploadController] Stream failed:', e);
        if (!res.headersSent) {
            const apiError = ApiError.builder()
                .code('STREAM_FAILED')
                .message(getMessage('error.stream_failed', lang))
                .status(500)
                .path(path)
                .build();
            res.status(500).json(ApiResponse.error(apiError));
        }
    }
}

export default {
    uploadFile,
    getFileList,
    downloadFile,
    deleteFiles,
    moveFile,
    streamFile
};
