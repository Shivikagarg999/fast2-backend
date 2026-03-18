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

// ─── Public Routes ─────────────────────────────────────────────────────

// Get active popup (for frontend)
router.get('/active', getActivePopup);

// ─── Admin Routes (All require admin authentication) ─────────────────────

// Create new popup
router.post('/', createPopup);

// Get all popups with pagination
router.get('/', getAllPopups);

// Update popup
router.put('/:popupId', updatePopup);

// Delete popup
router.delete('/:popupId', deletePopup);

// Toggle popup active status
router.patch('/:popupId/toggle', togglePopup);

module.exports = router;
