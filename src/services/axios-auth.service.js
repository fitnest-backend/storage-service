const axios = require('axios');

class AxiosAuthService {
    constructor() {
        this.baseUrl = 'https://www.terabox.com';
        this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    async getJsToken() {
        try {
            console.log('[AxiosAuthService] Fetching jsToken from Terabox homepage...');
            const response = await axios.get(`${this.baseUrl}/ai/index`, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            });

            const html = response.data;
            let jsToken = '';

            // 1. Try generic window.jsToken assignments
            const matchDoubleQuote = html.match(/window\.jsToken\s*=\s*"([^"]+)"/);
            const matchSingleQuote = html.match(/window\.jsToken\s*=\s*'([^']+)'/);

            if (matchDoubleQuote) jsToken = matchDoubleQuote[1];
            else if (matchSingleQuote) jsToken = matchSingleQuote[1];

            // 2. Try the obfuscated fn() call matches
            // Matches: fn("TOKEN") or fn('TOKEN')
            if (!jsToken) {
                // Try simple fn("...") match first
                const fnMatch = html.match(/fn\("%22(.*?)%22"\)/);
                if (fnMatch) jsToken = fnMatch[1];
            }

            // 3. Try to match the exact string pattern (fn%28%22...%22%29)
            if (!jsToken) {
                const manualMatch = html.match(/fn%28%22([A-F0-9]+)%22%29/);
                if (manualMatch) jsToken = manualMatch[1];
            }

            if (jsToken) {
                console.log('[AxiosAuthService] Successfully extracted jsToken');
                return jsToken;
            } else {
                console.warn('[AxiosAuthService] Failed to extract jsToken. Regex did not match.');
                return null;
            }

        } catch (error) {
            console.error('[AxiosAuthService] Error fetching jsToken:', error.message);
            return null;
        }
    }

    getAppId() {
        // Default appId for Terabox web
        return '250528';
    }
}

module.exports = new AxiosAuthService();
