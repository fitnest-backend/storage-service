const teraboxService = require('./src/services/terabox.service');
const path = require('path');

async function testRealUpload() {
    console.log('Starting real upload test with hardcoded credentials...');

    try {
        const filePath = path.join(__dirname, 'test_upload.txt');
        const result = await teraboxService.uploadFile(filePath, '/');

        console.log('Upload Result:', JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Test Failed:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        }
    }
}

testRealUpload();
