const Admin = require('../../models/admin');
const Role = require('../../models/role');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// @desc    Admin login
// @route   POST /api/admin/login
// @access  Public
const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email }).populate('role');
    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role?.name,
      roleId: admin.role?._id,
      roleName: admin.role?.displayName,
      permissions: admin.role?.permissions,
      isSuperAdmin: admin?._doc?.roleString == 'super-admin',
      token: generateToken(admin._id),
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create admin (for initial setup)
// @route   POST /api/admin/register
// @access  Public (or secure with env secret)
const registerAdmin = async (req, res) => {
  const { name, email, password, roleId } = req.body;

  try {
    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    // If no roleId provided, find or create default admin role
    let role;
    if (roleId) {
      role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({ message: 'Invalid role' });
      }
    } else {
      // Find default admin role or create super_admin if first user
      const adminCount = await Admin.countDocuments();
      if (adminCount === 0) {
        // First admin - create super_admin role if doesn't exist
        role = await Role.findOne({ name: 'super_admin' });
        if (!role) {
          role = await Role.create({
            name: 'super_admin',
            displayName: 'Super Admin',
            description: 'Full system access',
            permissions: ['*'], // All permissions
            isSystem: true,
          });
        }
      } else {
        // Find default admin role
        role = await Role.findOne({ name: 'admin' });
        if (!role) {
          return res.status(400).json({ message: 'Default admin role not found. Please specify roleId.' });
        }
      }
    }

    const admin = await Admin.create({ 
      name, 
      email, 
      password,
      role: role._id,
    });

    const populatedAdmin = await Admin.findById(admin._id).populate('role');

    res.status(201).json({
      _id: populatedAdmin._id,
      name: populatedAdmin.name,
      email: populatedAdmin.email,
      role: populatedAdmin.role.name,
      roleId: populatedAdmin.role._id,
      roleName: populatedAdmin.role.displayName,
      permissions: populatedAdmin.role.permissions,
      token: generateToken(populatedAdmin._id),
    });
  } catch (error) {
    console.error('❌ Register error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all admins
// @route   GET /api/admin/all
// @access  Private (Super Admin only)
const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find({ roleString: { $ne: 'super-admin' } })
      .select('-password')
      .populate('role')
      .sort({ createdAt: -1 });
    res.json({
      success: true,
      admins,
    });
  } catch (error) {
    console.error('❌ Error fetching admins:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get admin by ID
// @route   GET /api/admin/:id
// @access  Private
const getAdminById = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id)
      .select('-password')
      .populate('role');
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    res.json(admin);
  } catch (error) {
    console.error('❌ Error fetching admin:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update admin
// @route   PUT /api/admin/:id
// @access  Private (Super Admin only)
const updateAdmin = async (req, res) => {
  try {
    const { name, email, roleId, isActive, password } = req.body;
    
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    admin.name = name || admin.name;
    admin.email = email || admin.email;
    
    if (roleId) {
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      admin.role = roleId;
    }
    
    admin.isActive = isActive !== undefined ? isActive : admin.isActive;
    
    if (password) {
      admin.password = password;
    }

    const updatedAdmin = await admin.save();
    const populatedAdmin = await Admin.findById(updatedAdmin._id)
      .select('-password')
      .populate('role');

    res.json({
      _id: populatedAdmin._id,
      name: populatedAdmin.name,
      email: populatedAdmin.email,
      role: populatedAdmin.role,
      isActive: populatedAdmin.isActive,
    });
  } catch (error) {
    console.error('❌ Error updating admin:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete admin
// @route   DELETE /api/admin/:id
// @access  Private (Super Admin only)
const deleteAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).populate('role');
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Prevent deleting super admin
    if (admin.role.name === 'super_admin') {
      return res.status(400).json({ message: 'Cannot delete super admin' });
    }

    await Admin.findByIdAndDelete(req.params.id);
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting admin:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { 
  loginAdmin, 
  registerAdmin, 
  getAllAdmins, 
  getAdminById, 
  updateAdmin, 
  deleteAdmin 
};