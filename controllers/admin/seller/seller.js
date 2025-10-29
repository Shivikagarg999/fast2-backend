const Seller = require('../../../models/seller');

exports.updateSellerApproval = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { action, adminId, rejectionReason } = req.body; 

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    if (action === 'approve') {
      seller.approvalStatus = 'approved';
      seller.approvedBy = adminId;
      seller.approvedAt = new Date();
      seller.rejectionReason = null;
    } else if (action === 'reject') {
      seller.approvalStatus = 'rejected';
      seller.rejectionReason = rejectionReason || 'Not specified';
      seller.approvedBy = adminId;
      seller.approvedAt = new Date();
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }

    await seller.save();

    res.status(200).json({ 
      message: `Seller ${action}d successfully`, 
      seller 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating approval', error: error.message });
  }
};

exports.getAllSellers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      approvalStatus,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } },
        { 'phone': { $regex: search, $options: 'i' } }
      ];
    }

    if (approvalStatus) {
      filter.approvalStatus = approvalStatus;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const sellers = await Seller.find(filter)
      .populate('promotor', 'name email phone')
      .populate('products', 'name price stockStatus')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-bankDetails'); 

    const total = await Seller.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: sellers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalSellers: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get all sellers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sellers',
      error: error.message
    });
  }
};

exports.getSellerById = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await Seller.findById(sellerId)
      .populate('promotor', 'name email phone')
      .populate('products', 'name price stockStatus isActive')
      .populate('approvedBy', 'name email');

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    res.status(200).json({
      success: true,
      data: seller
    });

  } catch (error) {
    console.error('Get seller by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching seller',
      error: error.message
    });
  }
};

exports.toggleSellerStatus = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { isActive, reason } = req.body;

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    seller.isActive = isActive !== undefined ? isActive : !seller.isActive;
    
    if (reason) {
      seller.statusChangeReason = reason;
      seller.statusChangedAt = new Date();
    }

    await seller.save();

    if (!seller.isActive) {
      await Product.updateMany(
        { _id: { $in: seller.products } },
        { isActive: false }
      );
    }

    const updatedSeller = await Seller.findById(sellerId)
      .populate('promotor', 'name email phone')
      .populate('products', 'name price stockStatus isActive');

    res.status(200).json({
      success: true,
      message: `Seller ${seller.isActive ? 'activated' : 'deactivated'} successfully`,
      data: updatedSeller
    });

  } catch (error) {
    console.error('Toggle seller status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating seller status',
      error: error.message
    });
  }
};

exports.getSellerStats = async (req, res) => {
  try {
    const stats = await Seller.aggregate([
      {
        $facet: {
          totalSellers: [
            { $count: 'count' }
          ],
          approvalStats: [
            {
              $group: {
                _id: '$approvalStatus',
                count: { $sum: 1 }
              }
            }
          ],
          activeStats: [
            {
              $group: {
                _id: '$isActive',
                count: { $sum: 1 }
              }
            }
          ],
          recentSellers: [
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            {
              $project: {
                name: 1,
                businessName: 1,
                approvalStatus: 1,
                createdAt: 1
              }
            }
          ]
        }
      }
    ]);

    const formattedStats = {
      total: stats[0].totalSellers[0]?.count || 0,
      approvalStatus: {
        pending: stats[0].approvalStats.find(s => s._id === 'pending')?.count || 0,
        approved: stats[0].approvalStats.find(s => s._id === 'approved')?.count || 0,
        rejected: stats[0].approvalStats.find(s => s._id === 'rejected')?.count || 0
      },
      activeStatus: {
        active: stats[0].activeStats.find(s => s._id === true)?.count || 0,
        inactive: stats[0].activeStats.find(s => s._id === false)?.count || 0
      },
      recentSellers: stats[0].recentSellers
    };

    res.status(200).json({
      success: true,
      data: formattedStats
    });

  } catch (error) {
    console.error('Get seller stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching seller statistics',
      error: error.message
    });
  }
};

exports.updateSellerDetails = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const updateData = req.body;

    delete updateData.approvalStatus;
    delete updateData.approvedBy;
    delete updateData.approvedAt;
    delete updateData.promotor;

    const seller = await Seller.findByIdAndUpdate(
      sellerId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('promotor', 'name email phone');

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Seller updated successfully',
      data: seller
    });

  } catch (error) {
    console.error('Update seller details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating seller details',
      error: error.message
    });
  }
};