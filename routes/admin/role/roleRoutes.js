const express = require('express');
const router = express.Router();
const {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole
} = require('../../../controllers/admin/role/roleController');

// Get all roles
router.get('/', getAllRoles);

// Get role by ID
router.get('/:id', getRoleById);

// Create new role
router.post('/', createRole);

// Update role
router.put('/:id', updateRole);

// Delete role
router.delete('/:id', deleteRole);

module.exports = router;