const PaymentSettings = require('../../models/paymentSettings');

exports.getPaymentSettings = async (req, res) => {
  try {
    const settings = await PaymentSettings.getSettings();
    res.status(200).json({
      success: true,
      settings: {
        activeGateway: settings.activeGateway,
        updatedAt: settings.updatedAt
      }
    });
  } catch (error) {
    console.error('Get payment settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment settings'
    });
  }
};

exports.updatePaymentSettings = async (req, res) => {
  try {
    const { activeGateway } = req.body;

    if (!['razorpay', 'cashfree', 'none'].includes(activeGateway)) {
      return res.status(400).json({
        success: false,
        error: "activeGateway must be one of 'razorpay', 'cashfree', or 'none'"
      });
    }

    const settings = await PaymentSettings.getSettings();
    settings.activeGateway = activeGateway;
    settings.updatedBy = req.admin._id;
    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Payment settings updated successfully',
      settings: {
        activeGateway: settings.activeGateway,
        updatedAt: settings.updatedAt
      }
    });
  } catch (error) {
    console.error('Update payment settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment settings'
    });
  }
};
