const express = require('express');
const router = express.Router();
const adminAuth = require('../../middlewares/adminAuth');
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
router.post('/', adminAuth, createPopup);

// Get all popups with pagination
router.get('/', adminAuth, getAllPopups);

// Update popup
router.put('/:popupId', adminAuth, updatePopup);

// Delete popup
router.delete('/:popupId', adminAuth, deletePopup);

// Toggle popup active status
router.patch('/:popupId/toggle', adminAuth, togglePopup);

module.exports = router;
