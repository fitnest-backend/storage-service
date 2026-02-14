const getEnv = (key, defaultValue) => {
    const value = process.env[key];
    return (value && value.trim() !== "") ? value : defaultValue;
};

const config = {
    credentials: {
        ndus: getEnv('TERABOX_NDUS', 'Yb8V8X8peHuiKM4l9FZ6V46-EQBvieH3E19BpOEs'),
        appId: getEnv('TERABOX_APP_ID', '250528'),
        jsToken: getEnv('TERABOX_JS_TOKEN', 'BB04F91D937F292A33FB2D21F7B47DA91B1C8EF6D73EE1123956827E6A3BE9E23C0B3085FD444331EFF8EB31596E3C597C3D9531FBBD5664DAC8EDAD7A91BF00'),
        bdstoken: getEnv('TERABOX_BDSTOKEN', '50051ebcccc591e6c9563c49f48cf892'),
        browserId: getEnv('TERABOX_BROWSER_ID', '1509IaJc0mCa5RYruyP3etYaUR3RwuBiZaDDEIpR4PUYFkT8WQlbFEZUS2Y='),
        bidN: getEnv('TERABOX_BID_N', '19c53ecdd614fb75044207'),
        ndutFmt: getEnv('TERABOX_NDUT_FMT', 'A2340A609D9D54A49011D1056954FBA4C78452248724F99BE1C78CBD882F0D6A'),
        ndutFmv: getEnv('TERABOX_NDUT_FMV', '5648d962e91ce5c3289dfd5d017b6f64b9d20205ef1ae1cb78229c853dc295b203f7f31bfac9b60aa058dafc58c45d174666dea152a7358be5062ffc872229ecbcce9986b7c7e7291170fb5363aa718c0fb6f3975cd4ba5d58db24371459df9ac0a40a18f37bbeaf55fc4ef1cebe80dc'),
        csrfToken: getEnv('TERABOX_CSRF_TOKEN', 'qbl39NNPyuYqSuB0_HNUTz1P')
    },
    uploadDir: getEnv('UPLOAD_DIR', '/uploads'),
    updateCredentials: function (newCreds) {
        this.credentials = { ...this.credentials, ...newCreds };
        console.log('Credentials updated:', Object.keys(newCreds).join(', '));
    }
};

module.exports = config;
