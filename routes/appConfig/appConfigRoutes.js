const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/adminAuth');
const upload = require('../../middlewares/upload');
const {
    getAppConfig,
    upsertAppConfig,
    uploadHomeAnimation,
    removeHomeAnimation
} = require('../../controllers/appConfig/appConfigController');

router.get('/', getAppConfig);
router.put('/', adminAuth, upsertAppConfig);
router.post('/home-animation', adminAuth, upload.single('animation'), uploadHomeAnimation);
router.delete('/home-animation', adminAuth, removeHomeAnimation);

module.exports = router;
