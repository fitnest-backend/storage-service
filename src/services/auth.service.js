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

            // 5. Wait for successful login
            console.log('[AuthService] Navigating to login page...');
            try {
                await page.goto('https://www.terabox.com/ai/index', { waitUntil: 'domcontentloaded', timeout: 90000 });
            } catch (e) {
                console.log('[AuthService] Navigation error (proceeding anyway): ' + e.message);
            }

            // 1. Click the main Login button
            console.log('[AuthService] Waiting for login button...');
            try {
                // Selector: <div data-v-f8b538de="" class="login-btn">Login</div>
                const loginBtnSelector = 'div.login-btn[data-v-f8b538de]';
                await page.waitForSelector(loginBtnSelector, { visible: true, timeout: 10000 });
                console.log('[AuthService] Found login button, clicking...');

                // Try standard click first
                await page.click(loginBtnSelector).catch(async () => {
                    console.log('[AuthService] Standard click failed, trying evaluate click...');
                    await page.$eval(loginBtnSelector, el => el.click());
                });
            } catch (e) {
                console.log('[AuthService] Login button not found (data-v-f8b538de) or error: ' + e.message);
                // Fallback to generic class just in case data attribute changed
                try {
                    await page.waitForSelector('.login-btn', { visible: true, timeout: 5000 });
                    await page.click('.login-btn');
                } catch (ex) {
                    console.log('[AuthService] Fallback login button also failed.');
                }
            }

            // 2. Click logo/switch button to enable email login
            // Selector: <div data-v-e2756740="" class="logo"><img ...></div>
            console.log('[AuthService] Looking for login mode switch (logo)...');
            try {
                // The user provided: <img data-v-e2756740="" class="img" ...>
                const switchSelector = 'img[data-v-e2756740]';
                await page.waitForSelector(switchSelector, { visible: true, timeout: 10000 });
                console.log('[AuthService] Found switch image, clicking...');

                // Try standard click first
                await page.click(switchSelector).catch(async () => {
                    console.log('[AuthService] Standard click failed for switch img, trying evaluate click...');
                    await page.$eval(switchSelector, el => el.click());
                });
            } catch (e) {
                console.log('[AuthService] Logo switch button not found (might already be in correct mode or selector mismatch): ' + e.message);
                try {
                    // Fallback to div>img just in case
                    await page.waitForSelector('.logo img', { visible: true, timeout: 3000 });
                    await page.click('.logo img');
                } catch (ex) { }
            }

            // 3. Enter credentials
            console.log('[AuthService] Entering credentials...');

            // Email Input: <input ... id="email-input" ...>
            await page.waitForSelector('#email-input', { visible: true });

            // Clear and type email
            await page.click('#email-input'); // Focus
            const emailValue = await page.$eval('#email-input', el => el.value);
            if (emailValue) {
                await page.click('#email-input', { clickCount: 3 });
                await page.keyboard.press('Backspace');
            }
            await page.type('#email-input', this.email, { delay: 100 });

            // Password Input: <input ... id="pwd-input" ...>
            await page.waitForSelector('#pwd-input', { visible: true });

            // Clear and type password
            await page.click('#pwd-input'); // Focus
            const pwdValue = await page.$eval('#pwd-input', el => el.value);
            if (pwdValue) {
                await page.click('#pwd-input', { clickCount: 3 });
                await page.keyboard.press('Backspace');
            }
            await page.type('#pwd-input', this.password, { delay: 100 });

            // 4. Click Login
            // Login Btn: <div ... class="btn-class-login ...">Login</div>
            console.log('[AuthService] Clicking submit...');
            await page.waitForSelector('.btn-class-login', { visible: true });
            await page.click('.btn-class-login');

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
