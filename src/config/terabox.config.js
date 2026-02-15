const getEnv = (key, defaultValue) => {
    const value = process.env[key];
    return (value && value.trim() !== "") ? value : defaultValue;
};

const config = {
    credentials: {
        ndus: 'Yb8V8X8peHuic_iDsmvygmFYU2GpHMQHsOHYULQk',
        jsToken: 'BB04F91D937F292A33FB2D21F7B47DA9A04856DB210C0DAA286DE7F145C6D1244F428A4AABD88A9CE4AA1A6AFB7EFA97A7C8E43E05ABD53C5EF0D91A90ACC59B',
        appId: '250528',
        browserId: '1509IaJc0mCa5RYruyP3etYaUR3RwuBiZaDDEIpR4PUYFkT8WQlbFEZUS2Y=',
        bdstoken: '5d65e05181fad156b27206bf41f91d8c',
        bidN: '19c53ecdd614fb75044207',
        ndutFmt: '668464D903A89D6728B6AF56749250AAD8402E0A60ECF51084903F1F09495518',
        ndutFmv: '57c23c4fb8644490e8bf9e7be1ecc04f95b4b247c8f111dc1bf11e6805fb62d8487c5d9fe4f7700d87c709000ad5757c35cda69d7e3ff2526c7b4e10227f6bd30fce51cc542f59fcb9b3a16335917369c365dce2fb6bcd1505fe8d07050be70db5bec4c919e1ffdad18e9c3ce7087e3a',
        csrfToken: 'y-UrkkYKpBXj8_UC5CzRNA0u'
    },
    uploadDir: getEnv('UPLOAD_DIR', '/uploads'),
    updateCredentials: function (newCreds) {
        this.credentials = { ...this.credentials, ...newCreds };
        console.log('Credentials updated:', Object.keys(newCreds).join(', '));
    }
};

module.exports = config;
