const config = {
    credentials: {
        ndus: 'Yb8V8X8peHuic_iDsmvygmFYU2GpHMQHsOHYULQk',
        jsToken: 'BB04F91D937F292A33FB2D21F7B47DA9A04856DB210C0DAA286DE7F145C6D1244F428A4AABD88A9CE4AA1A6AFB7EFA97A7C8E43E05ABD53C5EF0D91A90ACC59B',
        appId: '250528',
        browserId: '1509IaJc0mCa5RYruyP3etYaUR3RwuBiZaDDEIpR4PUYFkT8WQlbFEZUS2Y=',
        bdstoken: '5d65e05181fad156b27206bf41f91d8c',
        bidN: '19c53ecdd614fb75044207',
        ndutFmt: '7C32167A217DE17B9E2DEA2EC15B799BFFEB438A21F4A833334DA07259BFD465',
        ndutFmv: 'f7639f25995717a37bef8af787b843baf46e83529dd7f79eabe7aa56b95fb6449e0f4309f4d4135acdfb49aa548a64ee8d96e622d7650369e2bc2e1a106daf8d4782a6cf23d73d96d0b1a532cafeb19f571711e39ea23605d38879b08b0addb54bfe3f382592bd807f2dfe9bbdf00c40',
        csrfToken: 'kO6cBP4LtPc2ZgfdEiW-su_z'
    },
    uploadDir: '/uploads',
    updateCredentials: function (newCreds) {
        this.credentials = { ...this.credentials, ...newCreds };
        console.log('Credentials updated:', Object.keys(newCreds).join(', '));
    }
};

module.exports = config;
