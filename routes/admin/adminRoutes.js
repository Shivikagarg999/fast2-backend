const express = require('express');
const router = express.Router();
const { 
  loginAdmin, 
  registerAdmin, 
  getAllAdmins, 
  getAdminById, 
  updateAdmin, 
  deleteAdmin 
} = require('../../controllers/admin/adminController');

// Admin login
router.post('/login', loginAdmin);

// Admin register (optional, only for initial setup)
router.post('/register', registerAdmin);

// Get all admins
router.get('/all', getAllAdmins);

// Get admin by ID
router.get('/:id', getAdminById);

// Update admin
router.put('/:id', updateAdmin);

// Delete admin
router.delete('/:id', deleteAdmin);

module.exports = router;