import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.join(__dirname, '../locales');
const locales = {
    az: JSON.parse(fs.readFileSync(path.join(localesDir, 'az.json'), 'utf8')),
    en: JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8')),
    ru: JSON.parse(fs.readFileSync(path.join(localesDir, 'ru.json'), 'utf8'))
};

export function getMessage(key, lang = 'en') {
    const messages = locales[lang] || locales.en;
    return messages[key] || key;
}

export class ApiResponse {
    static success(data) {
        return { data };
    }

    static error(apiError) {
        return { error: apiError };
    }
}

export class ApiError {
    constructor({ code, message, status, path, details = null }) {
        this.code = code;
        this.message = message;
        this.status = status;
        this.path = path;
        this.timestamp = new Date().toISOString();
        if (details) {
            this.details = details;
        }
    }

    static builder() {
        return new ApiErrorBuilder();
    }
}

class ApiErrorBuilder {
    constructor() {
        this._details = null;
    }

    code(val) { this._code = val; return this; }
    message(val) { this._message = val; return this; }
    status(val) { this._status = val; return this; }
    path(val) { this._path = val; return this; }
    details(val) { this._details = val; return this; }

    build() {
        return new ApiError({
            code: this._code,
            message: this._message,
            status: this._status,
            path: this._path,
            details: this._details
        });
    }
}
