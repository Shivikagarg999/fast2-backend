const Withdraw = require("../../models/withdraw");
const Driver = require("../../models/driver");
const DriverEarning = require("../../models/driverEarnings");

exports.requestWithdraw = async (req, res) => {
  try {
    const { amount, paymentMode, upiId, bankDetails } = req.body;
    const driverId = req.driver.driverId;
    
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: "Driver not found" 
      });
    }

    const totalEarned = await DriverEarning.aggregate([
      { $match: { 
        driver: driver._id,
        status: 'earned' 
      }},
      { $group: { 
        _id: null, 
        total: { $sum: '$amount' } 
      }}
    ]);

    const totalEarnings = totalEarned[0]?.total || 0;
    const currentBalance = driver.earnings.currentBalance;

    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal amount is ₹100",
        minimum: 100
      });
    }
    if (totalEarnings < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum ₹100 earnings required to withdraw",
        currentEarnings: totalEarnings,
        required: 100
      });
    }

    if (amount > currentBalance) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
        currentBalance,
        requested: amount
      });
    }

    if (paymentMode === "bank-transfer") {
      const { accountHolderName, accountNumber, ifscCode, bankName } = bankDetails;
      
      if (!accountHolderName || !accountNumber || !ifscCode || !bankName) {
        return res.status(400).json({
          success: false,
          message: "Bank details are required for bank transfer"
        });
      }

      if (!/^\d{10,18}$/.test(accountNumber)) {
        return res.status(400).json({
          success: false,
          message: "Invalid account number"
        });
      }

      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
        return res.status(400).json({
          success: false,
          message: "Invalid IFSC code format"
        });
      }
    }

    if (paymentMode === "upi") {
      if (!upiId) {
        return res.status(400).json({
          success: false,
          message: "UPI ID is required for UPI payment"
        });
      }
      if (!upiId.includes('@')) {
        return res.status(400).json({
          success: false,
          message: "Invalid UPI ID format"
        });
      }
    }

    const withdraw = new Withdraw({
      driver: driver._id,
      amount,
      paymentMode,
      upiId: paymentMode === "upi" ? upiId : null,
      bankDetails: paymentMode === "bank-transfer" ? bankDetails : null
    });

    await withdraw.save();

    driver.earnings.currentBalance -= amount;
    driver.earnings.pendingPayout += amount;
    await driver.save();

    res.status(201).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      data: {
        withdrawId: withdraw._id,
        amount,
        status: withdraw.status,
        paymentMode,
        currentBalance: driver.earnings.currentBalance,
        pendingPayout: driver.earnings.pendingPayout
      }
    });

  } catch (error) {
    console.error("Withdraw request error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};

exports.getWithdrawHistory = async (req, res) => {
  try {
    const driverId = req.driver.driverId;
    
    const withdraws = await Withdraw.find({ driver: driverId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ 
      success: true, 
      data: withdraws 
    });

  } catch (error) {
    console.error("Withdraw history error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};

exports.updateWithdrawStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const adminId = req.user?._id; 

    const withdraw = await Withdraw.findById(id).populate('driver', 'earnings');
    if (!withdraw) {
      return res.status(404).json({ 
        success: false, 
        message: "Withdraw request not found" 
      });
    }

    const allowedTransitions = {
      'pending': ['approved', 'rejected'],
      'approved': ['paid', 'rejected'],
      'rejected': [],
      'paid': []
    };

    if (!allowedTransitions[withdraw.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${withdraw.status} to ${status}`
      });
    }

    withdraw.status = status;
    withdraw.remarks = remarks || "";
    
    if (status === "paid") {
      withdraw.processedAt = new Date();
      
      const driver = await Driver.findById(withdraw.driver);
      if (driver) {
        driver.earnings.pendingPayout = Math.max(0, driver.earnings.pendingPayout - withdraw.amount);
        await driver.save();
      }
    }

    await withdraw.save();

    res.status(200).json({
      success: true,
      message: `Withdraw status updated to ${status}`,
      data: withdraw
    });

  } catch (error) {
    console.error("Update withdraw status error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};

exports.getDriverEarningsSummary = async (req, res) => {
  try {
    const driverId = req.driver.driverId;
    
    const driver = await Driver.findById(driverId).select('earnings');
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: "Driver not found" 
      });
    }

    const earningsSummary = await DriverEarning.aggregate([
      { $match: { driver: driver._id } },
      {
        $group: {
          _id: null,
          totalEarned: { $sum: '$amount' },
          earnedCount: { $sum: 1 },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'earned'] }, '$amount', 0] }
          },
          paidAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] }
          }
        }
      }
    ]);

    const summary = earningsSummary[0] || {
      totalEarned: 0,
      earnedCount: 0,
      pendingAmount: 0,
      paidAmount: 0
    };

    res.status(200).json({
      success: true,
      data: {
        earnings: {
          totalEarned: summary.totalEarned,
          earnedDeliveries: summary.earnedCount,
          pendingPayout: driver.earnings.pendingPayout,
          paidAmount: summary.paidAmount,
          currentBalance: driver.earnings.currentBalance,
          totalEarnings: driver.earnings.totalEarnings
        },
        withdrawal: {
          minimumAmount: 100,
          isEligible: summary.totalEarned >= 100,
          availableBalance: driver.earnings.currentBalance
        }
      }
    });

  } catch (error) {
    console.error("Get earnings summary error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};