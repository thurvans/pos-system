const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { getAndroidDownload } = require('./download.controller');

router.use(authenticate);

router.get('/downloads/android', getAndroidDownload);

module.exports = router;
