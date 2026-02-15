const authService = require('./src/services/auth.service');
const config = require('./src/config/terabox.config');

async function testAuthRefactor() {
    console.log('Testing Axios Auth Refactor...');

    try {
        console.log('Initial Config jsToken:', config.credentials.jsToken.substring(0, 20) + '...');

        console.log('Calling refreshTokens()...');
        const result = await authService.refreshTokens();

        console.log('Refresh Result:', result);

        if (result.method === 'axios') {
            console.log('SUCCESS: Refreshed using Axios!');
        } else if (result.method === 'puppeteer') {
            console.log('WARNING: Refreshed using Puppeteer (Axios failed or fallback triggered).');
        } else {
            console.log('UNKNOWN: Method not reported.');
        }

        console.log('New Config jsToken:', config.credentials.jsToken.substring(0, 20) + '...');

    } catch (error) {
        console.error('Test Failed:', error);
        if (error.stack) console.error(error.stack);
    }
}

testAuthRefactor();
