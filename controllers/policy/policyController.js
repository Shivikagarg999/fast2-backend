const Policy = require('../../models/policy');

exports.createPolicy = async (req, res) => {
  try {
    const { title, content, version, effectiveDate, policyType, metadata } = req.body;
    
    const existingVersion = await Policy.findOne({ policyType, version });
    if (existingVersion) {
      return res.status(400).json({
        success: false,
        message: `Version ${version} already exists for ${policyType} policy`
      });
    }
    if (req.body.isActive) {
      await Policy.deactivateAllOfType(policyType);
    }

    const policy = new Policy({
      title,
      content,
      version,
      effectiveDate,
      policyType,
      metadata,
      isActive: req.body.isActive || false
    });

    await policy.save();

    res.status(201).json({
      success: true,
      message: 'Policy created successfully',
      data: policy
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating policy',
      error: error.message
    });
  }
};

exports.getAllPolicies = async (req, res) => {
  try {
    const { policyType, isActive, page = 1, limit = 10 } = req.query;
    
    const filter = {};
    if (policyType) filter.policyType = policyType;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const policies = await Policy.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('metadata.lastUpdatedBy', 'name email');

    const total = await Policy.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: policies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching policies',
      error: error.message
    });
  }
};

exports.getActivePolicyByType = async (req, res) => {
  try {
    const { policyType } = req.params;
    
    const policy = await Policy.getActivePolicy(policyType);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: `No active ${policyType} policy found`
      });
    }

    res.status(200).json({
      success: true,
      data: policy
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching policy',
      error: error.message
    });
  }
};

exports.getPolicyById = async (req, res) => {
  try {
    const policy = await Policy.findById(req.params.id)
      .populate('metadata.lastUpdatedBy', 'name email');

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    res.status(200).json({
      success: true,
      data: policy
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching policy',
      error: error.message
    });
  }
};

exports.updatePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.isActive === true) {
      const policy = await Policy.findById(id);
      if (policy) {
        await Policy.deactivateAllOfType(policy.policyType);
      }
    }

    if (req.user) {
      updates['metadata.lastUpdatedBy'] = req.user._id;
    }

    const updatedPolicy = await Policy.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate('metadata.lastUpdatedBy', 'name email');

    if (!updatedPolicy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Policy updated successfully',
      data: updatedPolicy
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating policy',
      error: error.message
    });
  }
};

exports.deletePolicy = async (req, res) => {
  try {
    const policy = await Policy.findById(req.params.id);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    if (policy.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete active policy. Deactivate it first.'
      });
    }

    await Policy.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Policy deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting policy',
      error: error.message
    });
  }
};

exports.getAllActivePolicies = async (req, res) => {
  try {
    const policies = await Policy.find({ isActive: true })
      .select('title content version effectiveDate policyType metadata')
      .sort({ policyType: 1 });

    const policiesByType = {};
    policies.forEach(policy => {
      policiesByType[policy.policyType] = policy;
    });

    res.status(200).json({
      success: true,
      data: policiesByType
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching active policies',
      error: error.message
    });
  }
};

exports.activatePolicy = async (req, res) => {
  try {
    const { id } = req.params;

    const policy = await Policy.findById(id);
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    await Policy.deactivateAllOfType(policy.policyType);

    policy.isActive = true;
    if (req.user) {
      policy.metadata.lastUpdatedBy = req.user._id;
    }
    await policy.save();

    res.status(200).json({
      success: true,
      message: 'Policy activated successfully',
      data: policy
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error activating policy',
      error: error.message
    });
  }
};