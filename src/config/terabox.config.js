const getEnv = (key, defaultValue) => {
    const value = process.env[key];
    return (value && value.trim() !== "") ? value : defaultValue;
};

module.exports = {
    credentials: {
        ndus: getEnv('TERABOX_NDUS', 'Yb8V8X8peHuiKM4l9FZ6V46-EQBvieH3E19BpOEs'),
        appId: getEnv('TERABOX_APP_ID', '250528'),
        jsToken: getEnv('TERABOX_JS_TOKEN', 'BB04F91D937F292A33FB2D21F7B47DA91B1C8EF6D73EE1123956827E6A3BE9E23C0B3085FD444331EFF8EB31596E3C597C3D9531FBBD5664DAC8EDAD7A91BF00'),
        bdstoken: getEnv('TERABOX_BDSTOKEN', '50051ebcccc591e6c9563c49f48cf892'),
        browserId: getEnv('TERABOX_BROWSER_ID', '1509IaJc0mCa5RYruyP3etYaUR3RwuBiZaDDEIpR4PUYFkT8WQlbFEZUS2Y=')
    },
    uploadDir: getEnv('UPLOAD_DIR', '/uploads')
};
