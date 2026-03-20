const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/adminAuth');
const {
    getActivePopup,
    createPopup,
    getAllPopups,
    updatePopup,
    deletePopup,
    togglePopup
} = require('../../controllers/admin/popupController');

router.get('/active', getActivePopup);

router.post('/', createPopup);

router.get('/', getAllPopups);

router.put('/:popupId', updatePopup);

router.delete('/:popupId', deletePopup);

router.patch('/:popupId/toggle', togglePopup);

module.exports = router;
