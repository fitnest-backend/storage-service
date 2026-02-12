const puppeteer = require('puppeteer');

async function extractTokens() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.terabox.com/');

        // Wait for login button and click
        await page.waitForSelector('.login-btn', { timeout: 10000 });
        await page.click('.login-btn');

        // Wait for login form
        await page.waitForSelector('#TANGRAM__PSP_4__userName', { timeout: 10000 });
        await page.type('#TANGRAM__PSP_4__userName', process.env.TERABOX_USERNAME || 'your_username');
        await page.type('#TANGRAM__PSP_4__password', process.env.TERABOX_PASSWORD || 'your_password');
        await page.click('#TANGRAM__PSP_4__submit');

        // Wait for login success
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        // Extract cookies
        const cookies = await page.cookies();
        const ndus = cookies.find(c => c.name === 'ndus')?.value;
        const bdstoken = cookies.find(c => c.name === 'BDUSS')?.value || '';

        // Get jsToken from API
        const jsToken = await page.evaluate(async () => {
            try {
                const res = await fetch('https://www.terabox.com/api/home/info', {
                    credentials: 'include'
                });
                const data = await res.json();
                return data.jsToken || '';
            } catch (e) {
                return '';
            }
        });

        const appId = '250528';
        const browserId = '12345678'; // placeholder

        console.log('Extracted tokens:');
        console.log('TERABOX_NDUS=' + ndus);
        console.log('TERABOX_APP_ID=' + appId);
        console.log('TERABOX_JS_TOKEN=' + jsToken);
        console.log('TERABOX_BDSTOKEN=' + bdstoken);
        console.log('TERABOX_BROWSER_ID=' + browserId);

    } catch (err) {
        console.error('Failed to extract tokens', err);
    } finally {
        await browser.close();
    }
}

extractTokens();
