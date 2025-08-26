const express = require('express');
const router = express.Router();
const { loginAdmin, registerAdmin } = require('../../controllers/admin/adminController');

// Admin login
router.post('/login', loginAdmin);

// Admin register (optional, only for initial setup)
router.post('/register', registerAdmin);

module.exports = router;
