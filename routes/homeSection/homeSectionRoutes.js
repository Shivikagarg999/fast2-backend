const express = require('express');
const router = express.Router();
const { getHomeSections } = require('../../controllers/homeSection/homeSectionController');

router.get('/', getHomeSections);

module.exports = router;
