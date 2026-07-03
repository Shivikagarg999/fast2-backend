const Policy = require('../../models/policy');
const TermsAndConditions = require('../../models/termsAndConditions');

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

/**
 * @desc    Get all admin-created policies dynamically (public)
 * @route   GET /api/policy/public/all
 * @access  Public
 *
 * @queryParam {string}  [type]     Filter by policy type.
 *                                  Allowed values: "terms", "return", "cancellation", "refund", "termsAndConditions"
 *                                  Omit to get ALL types at once.
 * @queryParam {string}  [status]   Filter by status: "active" | "inactive" | "all" (default: "all")
 * @queryParam {number}  [page]     Page number for pagination (default: 1)
 * @queryParam {number}  [limit]    Results per page (default: 10, max: 100)
 *
 * @returns {object} JSON response:
 *   {
 *     success: true,
 *     data: {
 *       policies: [...],          // from Policy model (return/cancellation/refund/terms types)
 *       termsAndConditions: [...] // from TermsAndConditions model (only if type="termsAndConditions" or no type)
 *     },
 *     pagination: { page, limit, totalPolicies, totalTerms, totalPages }
 *   }
 *
 * @example  GET /api/policy/public/all
 *           → returns all policy types + terms
 *
 * @example  GET /api/policy/public/all?type=return&status=active
 *           → returns only active return policies
 *
 * @example  GET /api/policy/public/all?type=termsAndConditions&status=active
 *           → returns only the active terms & conditions document
 *
 * @example  GET /api/policy/public/all?status=active
 *           → returns all active admin policies (all types grouped)
 */
exports.getPublicAllPolicies = async (req, res) => {
  try {
    const { type, status = 'all', page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const POLICY_TYPES = ['terms', 'return', 'cancellation', 'refund'];

    const wantsTermsModel = !type || type === 'termsAndConditions';
    const wantsPolicyModel = !type || POLICY_TYPES.includes(type);

    const statusFilter = status === 'active'
      ? { isActive: true }
      : status === 'inactive'
        ? { isActive: false }
        : {};

    let policies = [];
    let termsAndConditions = [];
    let totalPolicies = 0;
    let totalTerms = 0;

    if (wantsPolicyModel) {
      const policyFilter = { ...statusFilter };
      if (type && POLICY_TYPES.includes(type)) policyFilter.policyType = type;

      [policies, totalPolicies] = await Promise.all([
        Policy.find(policyFilter)
          .select('title content version effectiveDate policyType isActive metadata createdAt')
          .sort({ policyType: 1, createdAt: -1 })
          .skip(wantsTermsModel ? 0 : skip)
          .limit(wantsTermsModel ? limitNum : limitNum),
        Policy.countDocuments(policyFilter)
      ]);
    }

    if (wantsTermsModel) {
      [termsAndConditions, totalTerms] = await Promise.all([
        TermsAndConditions.find(statusFilter)
          .select('title content version effectiveDate isActive createdAt')
          .sort({ effectiveDate: -1 })
          .skip(wantsPolicyModel ? 0 : skip)
          .limit(limitNum),
        TermsAndConditions.countDocuments(statusFilter)
      ]);
    }

    const totalRecords = totalPolicies + totalTerms;

    res.status(200).json({
      success: true,
      data: {
        policies,
        termsAndConditions
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPolicies,
        totalTerms,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum)
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