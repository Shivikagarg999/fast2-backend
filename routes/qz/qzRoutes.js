const express = require('express');
const router = express.Router();
const { getCertificate, sign } = require('../../controllers/qz/qzController');

router.get('/cert', getCertificate);
router.post('/sign', sign);

module.exports = router;
