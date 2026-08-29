const AppConfig = require('../../models/appConfig');

// @desc    Get force-update config for an app (public — checked on every app launch)
// @route   GET /api/app-config?app=customer
// @access  Public
exports.getAppConfig = async (req, res) => {
  try {
    const app = req.query.app || 'customer';
    const config = await AppConfig.findOne({ app });

    if (!config) {
      // No config yet — don't block anyone until one is explicitly created.
      return res.status(200).json({
        success: true,
        minVersionCode: 1,
        latestVersionCode: 1,
        playStoreUrl: '',
        updateMessage: '',
        productServiceRadiusKm: 5
      });
    }

    res.status(200).json({
      success: true,
      minVersionCode: config.minVersionCode,
      latestVersionCode: config.latestVersionCode,
      playStoreUrl: config.playStoreUrl,
      updateMessage: config.updateMessage,
      productServiceRadiusKm: config.productServiceRadiusKm || 5
    });
  } catch (error) {
    console.error('Get app config error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch app config' });
  }
};

// @desc    Create or update the force-update config for an app
// @route   PUT /api/admin/app-config
// @access  Private (admin)
exports.upsertAppConfig = async (req, res) => {
  try {
    const { app, minVersionCode, latestVersionCode, playStoreUrl, updateMessage, productServiceRadiusKm } = req.body;

    if (!app || !['customer', 'driver'].includes(app)) {
      return res.status(400).json({ success: false, error: "app must be 'customer' or 'driver'" });
    }
    if (productServiceRadiusKm !== undefined &&
        (!Number.isFinite(Number(productServiceRadiusKm)) || Number(productServiceRadiusKm) < 0.1 || Number(productServiceRadiusKm) > 100)) {
      return res.status(400).json({ success: false, error: 'productServiceRadiusKm must be between 0.1 and 100' });
    }

    const config = await AppConfig.findOneAndUpdate(
      { app },
      {
        app,
        ...(minVersionCode !== undefined && { minVersionCode }),
        ...(latestVersionCode !== undefined && { latestVersionCode }),
        ...(playStoreUrl !== undefined && { playStoreUrl }),
        ...(updateMessage !== undefined && { updateMessage }),
        ...(productServiceRadiusKm !== undefined && { productServiceRadiusKm: Number(productServiceRadiusKm) })
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ success: true, config });
  } catch (error) {
    console.error('Upsert app config error:', error);
    res.status(500).json({ success: false, error: 'Failed to update app config' });
  }
};
