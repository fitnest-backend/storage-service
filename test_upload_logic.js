const { buildPrecreateUrl, buildUploadUrl } = require('./src/services/terabox-utils');

async function testParams() {
    console.log('Testing Terabox Utils URL generation...');

    const appId = '250528';
    const jsToken = 'TEST_TOKEN';
    const dpLogId = 'TEST_LOG_ID';
    const fileName = 'test.jpg';
    const uploadId = 'TEST_UPLOAD_ID';

    // Test buildPrecreateUrl
    const preUrl = buildPrecreateUrl(appId, jsToken, dpLogId);
    console.log('Precreate URL:', preUrl);

    // Test buildUploadUrl
    const upUrl = buildUploadUrl(fileName, uploadId, appId);
    console.log('Upload URL:', upUrl);

    console.log('\nVerification complete. Ensure these match the upload-tool format.');
}

testParams().catch(console.error);
