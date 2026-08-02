const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/adminAuth');
const { getAppConfig, upsertAppConfig } = require('../../controllers/appConfig/appConfigController');

router.get('/', getAppConfig);
router.put('/', adminAuth, upsertAppConfig);

module.exports = router;
