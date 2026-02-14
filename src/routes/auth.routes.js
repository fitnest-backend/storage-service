const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');

router.post('/login', async (req, res) => {
    try {
        console.log('Manual login triggered via API');
        const result = await authService.refreshTokens();
        res.json({
            success: true,
            message: 'Login successful and tokens updated',
            data: result
        });
    } catch (error) {
        console.error('Login API failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Login failed: ' + error.message
        });
    }
});

module.exports = router;
