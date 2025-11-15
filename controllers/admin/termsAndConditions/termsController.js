const TermsAndConditions = require('../../../models/termsAndConditions');

// @desc    Get all terms and conditions
// @route   GET /api/admin/terms/getall
// @access  Public
const getTerms = async (req, res) => {
  try {
    const { active } = req.query;
    
    let query = {};
    if (active === 'true') {
      query.isActive = true;
    }
    
    const terms = await TermsAndConditions.find(query)
      .sort({ effectiveDate: -1, createdAt: -1 })
      .select('-__v');
    
    res.json({
      success: true,
      count: terms.length,
      data: terms
    });
  } catch (error) {
    console.error('Get terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching terms and conditions',
      error: error.message
    });
  }
};

// @desc    Get single term
// @route   GET /api/admin/terms/get/:id
// @access  Public
const getTerm = async (req, res) => {
  try {
    const term = await TermsAndConditions.findById(req.params.id).select('-__v');
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found'
      });
    }
    
    res.json({
      success: true,
      data: term
    });
  } catch (error) {
    console.error('Get term error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while fetching terms and conditions',
      error: error.message
    });
  }
};

// @desc    Get active terms and conditions
// @route   GET /api/terms/active
// @access  Public
const getActiveTerms = async (req, res) => {
  try {
    const activeTerm = await TermsAndConditions.findOne({ isActive: true })
      .sort({ effectiveDate: -1 })
      .select('-__v');
    
    if (!activeTerm) {
      return res.status(404).json({
        success: false,
        message: 'No active terms and conditions found'
      });
    }
    
    res.json({
      success: true,
      data: activeTerm
    });
  } catch (error) {
    console.error('Get active terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching active terms and conditions',
      error: error.message
    });
  }
};

// @desc    Create new terms and conditions
// @route   POST /api/admin/terms/create
// @access  Private/Admin
const createTerm = async (req, res) => {
  try {
    const {
      title,
      content,
      version,
      isActive,
      effectiveDate
    } = req.body;

    // Validate required fields
    const requiredFields = ['title', 'content', 'version', 'effectiveDate'];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // If setting as active, deactivate all other terms
    if (isActive) {
      await TermsAndConditions.updateMany(
        { isActive: true },
        { $set: { isActive: false } }
      );
    }

    const term = new TermsAndConditions({
      title,
      content,
      version,
      isActive: isActive !== undefined ? isActive : false,
      effectiveDate: new Date(effectiveDate)
    });

    const createdTerm = await term.save();
    
    res.status(201).json({
      success: true,
      message: 'Terms and conditions created successfully',
      data: createdTerm
    });
  } catch (error) {
    console.error('Create term error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while creating terms and conditions',
      error: error.message
    });
  }
};

// @desc    Update terms and conditions
// @route   PUT /api/admin/terms/update/:id
// @access  Private/Admin
const updateTerm = async (req, res) => {
  try {
    const term = await TermsAndConditions.findById(req.params.id);
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found'
      });
    }

    // If setting as active, deactivate all other terms
    if (req.body.isActive && !term.isActive) {
      await TermsAndConditions.updateMany(
        { _id: { $ne: req.params.id }, isActive: true },
        { $set: { isActive: false } }
      );
    }

    const updatedTerm = await TermsAndConditions.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).select('-__v');

    res.json({
      success: true,
      message: 'Terms and conditions updated successfully',
      data: updatedTerm
    });
  } catch (error) {
    console.error('Update term error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found'
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating terms and conditions',
      error: error.message
    });
  }
};

// @desc    Delete terms and conditions
// @route   DELETE /api/admin/terms/delete/:id
// @access  Private/Admin
const deleteTerm = async (req, res) => {
  try {
    const term = await TermsAndConditions.findById(req.params.id);
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found'
      });
    }

    await TermsAndConditions.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Terms and conditions deleted successfully'
    });
  } catch (error) {
    console.error('Delete term error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while deleting terms and conditions',
      error: error.message
    });
  }
};

// @desc    Set terms and conditions as active
// @route   PUT /api/admin/terms/set-active/:id
// @access  Private/Admin
const setActiveTerm = async (req, res) => {
  try {
    const term = await TermsAndConditions.findById(req.params.id);
    
    if (!term) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found'
      });
    }

    // Deactivate all other terms
    await TermsAndConditions.updateMany(
      { _id: { $ne: req.params.id } },
      { $set: { isActive: false } }
    );

    // Activate this term
    term.isActive = true;
    await term.save();
    
    res.json({
      success: true,
      message: 'Terms and conditions set as active successfully',
      data: term
    });
  } catch (error) {
    console.error('Set active term error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while setting active terms and conditions',
      error: error.message
    });
  }
};

module.exports = {
  getTerms,
  getTerm,
  getActiveTerms,
  createTerm,
  updateTerm,
  deleteTerm,
  setActiveTerm
};