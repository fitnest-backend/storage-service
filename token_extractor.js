const puppeteer = require('puppeteer');

async function extractTokens() {
    const browser = await puppeteer.launch({ headless: false }); // headless false to see
    const page = await browser.newPage();

    try {
        await page.goto('https://www.terabox.com/');

        // Wait for user to login manually
        console.log('Please login to TeraBox in the browser window.');
        await page.waitForSelector('.user-info', { timeout: 300000 }); // wait 5 min for login

        // Extract cookies
        const cookies = await page.cookies();
        const ndus = cookies.find(c => c.name === 'ndus')?.value;
        const bdstoken = cookies.find(c => c.name === 'BDUSS')?.value; // perhaps BDUSS is bdstoken?

        // To get jsToken, make a request
        const response = await page.evaluate(async () => {
            const res = await fetch('https://www.terabox.com/api/list?dir=%2F&order=time&desc=1&num=100&page=1', {
                credentials: 'include'
            });
            const data = await res.json();
            return data.jsToken || '';
        });

        const jsToken = response;

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
