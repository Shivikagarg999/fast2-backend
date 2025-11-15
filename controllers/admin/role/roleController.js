const Role = require('../../../models/role');

// @desc    Get all roles
// @route   GET /api/admin/roles
// @access  Private (Super Admin)
exports.getAllRoles = async (req, res) => {
  try {
    console.log('📊 Fetching all roles...');
    const roles = await Role.find().sort({ createdAt: -1 });
    console.log(`✅ Found ${roles.length} roles`);
    return res.json({ success: true, roles });
  } catch (err) {
    console.error('❌ Error fetching roles:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch roles',
      error: err.message 
    });
  }
};

// @desc    Get role by ID
// @route   GET /api/admin/roles/:id
// @access  Private (Super Admin)
exports.getRoleById = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    return res.json({ success: true, role });
  } catch (err) {
    console.error('❌ Error fetching role:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch role',
      error: err.message 
    });
  }
};

// @desc    Create new role
// @route   POST /api/admin/roles
// @access  Private (Super Admin)
exports.createRole = async (req, res) => {
  try {
    const { name, displayName, description, permissions } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and display name are required' 
      });
    }

    // Check if role with same name exists
    const existingRole = await Role.findOne({ name: name.toLowerCase() });
    if (existingRole) {
      return res.status(400).json({ 
        success: false, 
        message: 'Role with this name already exists' 
      });
    }

    const role = new Role({
      name: name.toLowerCase(),
      displayName,
      description: description || '',
      permissions: permissions || [],
      isSystem: false,
    });

    await role.save();
    console.log('✅ Role created:', role.name);

    return res.status(201).json({ 
      success: true, 
      message: 'Role created successfully', 
      role 
    });
  } catch (err) {
    console.error('❌ Error creating role:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create role',
      error: err.message 
    });
  }
};

// @desc    Update role
// @route   PUT /api/admin/roles/:id
// @access  Private (Super Admin)
exports.updateRole = async (req, res) => {
  try {
    const { displayName, description, permissions, isActive } = req.body;

    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    // Prevent editing system roles
    if (role.isSystem) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot edit system role' 
      });
    }

    role.displayName = displayName || role.displayName;
    role.description = description !== undefined ? description : role.description;
    role.permissions = permissions !== undefined ? permissions : role.permissions;
    role.isActive = isActive !== undefined ? isActive : role.isActive;

    await role.save();
    console.log('✅ Role updated:', role.name);

    return res.json({ 
      success: true, 
      message: 'Role updated successfully', 
      role 
    });
  } catch (err) {
    console.error('❌ Error updating role:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update role',
      error: err.message 
    });
  }
};

// @desc    Delete role
// @route   DELETE /api/admin/roles/:id
// @access  Private (Super Admin)
exports.deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    // Prevent deleting system roles
    if (role.isSystem) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete system role' 
      });
    }

    // Check if any admins are using this role
    const Admin = require('../../../models/admin');
    const adminsWithRole = await Admin.countDocuments({ role: req.params.id });
    
    if (adminsWithRole > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete role. ${adminsWithRole} admin(s) are assigned to this role.` 
      });
    }

    await Role.findByIdAndDelete(req.params.id);
    console.log('✅ Role deleted:', role.name);

    return res.json({ 
      success: true, 
      message: 'Role deleted successfully' 
    });
  } catch (err) {
    console.error('❌ Error deleting role:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to delete role',
      error: err.message 
    });
  }
};