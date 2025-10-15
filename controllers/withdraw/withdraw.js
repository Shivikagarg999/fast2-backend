const Withdraw = require("../../models/withdraw");
const Driver = require("../../models/driver");

exports.requestWithdraw = async (req, res) => {
  try {
    const { amount, paymentMode, upiId, bankDetails } = req.body;
    const driver = await Driver.findById(req.driver.driverId);

    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    if (amount < 120) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal amount is ₹120",
      });
    }

    if (driver.earnings.currentBalance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }
    const withdraw = new Withdraw({
      driver: driver._id,
      amount,
      paymentMode,
      upiId: paymentMode === "upi" ? upiId : null,
      bankDetails: paymentMode === "bank-transfer" ? bankDetails : {},
    });

    await withdraw.save();

    driver.earnings.currentBalance -= amount;
    driver.earnings.pendingPayout -= amount;
    await driver.save();

    res.status(201).json({
      success: true,
      message: "Withdrawal request created successfully",
      data: withdraw,
    });
  } catch (error) {
    console.error("Withdraw request error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getWithdrawHistory = async (req, res) => {
  try {
    const withdraws = await Withdraw.find({ driver: req.driver.driverId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: withdraws });
  } catch (error) {
    console.error("Withdraw history error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.updateWithdrawStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const withdraw = await Withdraw.findById(id);
    if (!withdraw) {
      return res.status(404).json({ success: false, message: "Withdraw request not found" });
    }

    withdraw.status = status;
    withdraw.remarks = remarks || "";
    if (status === "paid") {
      withdraw.processedAt = new Date();
    }
    await withdraw.save();

    res.status(200).json({
      success: true,
      message: `Withdraw status updated to ${status}`,
      data: withdraw,
    });
  } catch (error) {
    console.error("Update withdraw status error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
