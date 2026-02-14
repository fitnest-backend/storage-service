const puppeteer = require('puppeteer');
const config = require('../config/terabox.config');
const fs = require('fs');
const path = require('path');

class AuthService {
    constructor() {
        this.email = process.env.TERABOX_USERNAME || 'fitnestazerbaijan@gmail.com';
        this.password = process.env.TERABOX_PASSWORD || 'Fitnest2026@@';
        this.isRefreshing = false;
        this.refreshPromise = null;
    }

    async refreshTokens() {
        if (this.isRefreshing) {
            console.log('[AuthService] Token refresh already in progress. Waiting...');
            return this.refreshPromise;
        }

        this.isRefreshing = true;
        this.refreshPromise = this._performLogin();

        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    }

    async _performLogin() {
        console.log('[AuthService] STARTING AUTOMATED LOGIN...');
        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Set viewport to a standard desktop size
            await page.setViewport({ width: 1280, height: 800 });

            console.log('[AuthService] Navigating to login page...');
            await page.goto('https://www.terabox.com/indonesian/index', { waitUntil: 'networkidle2', timeout: 60000 });

            // 1. Click the main Login button if present
            console.log('[AuthService] Waiting for login button...');
            try {
                await page.waitForSelector('.login-btn', { visible: true, timeout: 10000 });
                await page.click('.login-btn');
            } catch (e) {
                console.log('[AuthService] Login button not found or already on login screen.');
            }

            // 2. Wait for login modal and switch to Email Login
            console.log('[AuthService] Waiting for login modal...');
            await page.waitForSelector('.new-login-dialog', { visible: true, timeout: 30000 });

            // Look for "Login with account" - usually a small icon or text at bottom
            // Try to find if inputs are visible first
            const emailInputSelector = 'input[name="userName"]';
            const passwordInputSelector = 'input[name="password"]';
            // Note: Selectors might be dynamic or generic like .passport-login-input
            // Based on common TeraBox structure:

            // Attempt to switch to password login if inputs are not visible
            const inputsVisible = await page.$(emailInputSelector);
            if (!inputsVisible) {
                console.log('[AuthService] Switching to account login...');
                // Try to find the switch element. Often a class like 'qrcode-img' or 'login-switch'
                // Or "Log in with account" text
                try {
                    const switchBtn = await page.waitForSelector('.change-login-type', { timeout: 5000 });
                    if (switchBtn) await switchBtn.click();
                } catch (e) {
                    console.log('[AuthService] switch button not found via selector, trying alternates...');
                    // Try generic click on bottom right of modal? No, unreliable.
                }
            }

            // 3. Enter credentials
            console.log('[AuthService] Entering credentials...');
            // Wait specifically for the email input. TeraBox often uses name="userName"
            await page.waitForSelector('input[name="userName"], #email-input, .input-user', { visible: true });

            // Clear and type
            await page.focus('input[name="userName"]');
            await page.keyboard.down('Control');
            await page.keyboard.press('A');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            await page.type('input[name="userName"]', this.email, { delay: 100 });

            await page.focus('input[name="password"]');
            await page.type('input[name="password"]', this.password, { delay: 100 });

            // 4. Click Login
            console.log('[AuthService] Clicking submit...');
            await page.waitForSelector('.login-submit:not(.login-submit-disabled), .btn-class-login', { visible: true });
            await page.click('.login-submit, .btn-class-login');

            // 5. Wait for successful login
            console.log('[AuthService] Waiting for login completion...');
            // Wait for cookie 'ndus' to be set
            await page.waitForFunction(() => {
                return document.cookie.includes('ndus=');
            }, { timeout: 30000 });

            // 6. Extract tokens
            console.log('[AuthService] Login successful! Extracting tokens...');
            const cookies = await page.cookies();
            const getCookie = (name) => cookies.find(c => c.name === name)?.value || '';

            const ndus = getCookie('ndus');
            const browserId = getCookie('browserid') || getCookie('browser_id');
            const bdstoken = getCookie('bdstoken') || getCookie('BDUSS'); // Sometimes varies
            const bidN = getCookie('__bid_n');
            const ndutFmt = getCookie('ndut_fmt');
            const ndutFmv = getCookie('ndut_fmv');
            const csrfToken = getCookie('csrfToken');

            // Extraction of jsToken logic
            // Check global window objects or try to fetch it if possible.
            // Some versions of TeraBox put it in window.init_data
            let jsToken = await page.evaluate(() => {
                return window.jsToken || (window.init_data && window.init_data.jsToken) || '';
            });

            if (!jsToken) {
                console.log('[AuthService] jsToken not found in window, attempting to fetch from page source or API...');
                // Fallback: reload page or go to main disk page to ensure globals are loaded
                // await page.goto('https://www.terabox.com/main?category=all');
                // re-evaluate
            }

            if (!ndus) throw new Error('Failed to extract ndus cookie');

            const newCreds = {
                ndus,
                jsToken,
                browserId,
                bdstoken,
                bidN,
                ndutFmt,
                ndutFmv,
                csrfToken
            };

            // 7. Update running config
            config.updateCredentials(newCreds);

            // 8. Persist to .env (Best effort)
            this._updateEnvFile(newCreds);

            return { success: true, ...newCreds };

        } catch (error) {
            console.error('[AuthService] Login failed:', error.message);
            if (browser) {
                try {
                    await browser.pages().then(p => p[0].screenshot({ path: 'login_failure.png' }));
                    console.log('[AuthService] Screenshot saved to login_failure.png');
                } catch (e) { }
            }
            throw error;
        } finally {
            if (browser) await browser.close();
        }
    }

    _updateEnvFile(creds) {
        try {
            const envPath = path.join(__dirname, '../../.env');
            let envContent = '';

            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
            }

            const map = {
                ndus: 'TERABOX_NDUS',
                jsToken: 'TERABOX_JS_TOKEN',
                browserId: 'TERABOX_BROWSER_ID',
                bdstoken: 'TERABOX_BDSTOKEN',
                bidN: 'TERABOX_BID_N',
                ndutFmt: 'TERABOX_NDUT_FMT',
                ndutFmv: 'TERABOX_NDUT_FMV',
                csrfToken: 'TERABOX_CSRF_TOKEN'
            };

            const lines = envContent.split('\n');
            const newLines = [];
            const keysUpdated = new Set();

            lines.forEach(line => {
                const [key] = line.split('=');
                // Check if this key corresponds to any of our known env vars
                const credKey = Object.keys(map).find(k => map[k] === key?.trim());
                if (credKey && creds[credKey]) {
                    newLines.push(`${key}=${creds[credKey]}`);
                    keysUpdated.add(key);
                } else {
                    newLines.push(line);
                }
            });

            // Add missing keys
            Object.keys(map).forEach(k => {
                const envKey = map[k];
                if (!keysUpdated.has(envKey) && creds[k]) {
                    newLines.push(`${envKey}=${creds[k]}`);
                }
            });

            fs.writeFileSync(envPath, newLines.join('\n'));
            console.log('[AuthService] .env file updated.');
        } catch (e) {
            console.error('Failed to update .env:', e);
        }
    }
}

module.exports = new AuthService();
