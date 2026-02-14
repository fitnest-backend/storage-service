const TeraboxService = require('./src/services/terabox.service');
const config = require('./src/config/terabox.config');

async function testParams() {
    console.log('Testing TeraboxService parameter generation...');

    // Test _generateLogId
    const logId = TeraboxService._generateLogId();
    console.log('Generated logId:', logId);
    console.log('Decoded logId:', Buffer.from(logId, 'base64').toString());

    // Test getCommonHeaders
    const headers = TeraboxService.getCommonHeaders();
    console.log('Headers:', JSON.stringify(headers, null, 2));

    // Test getCommonParams
    const params = TeraboxService.getCommonParams({ test: '1' });
    console.log('Params:', JSON.stringify(params, null, 2));

    console.log('\nVerification complete. Please check if the logId format matches the browser example.');
}

testParams().catch(console.error);
