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
        updateMessage: ''
      });
    }

    res.status(200).json({
      success: true,
      minVersionCode: config.minVersionCode,
      latestVersionCode: config.latestVersionCode,
      playStoreUrl: config.playStoreUrl,
      updateMessage: config.updateMessage
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
    const { app, minVersionCode, latestVersionCode, playStoreUrl, updateMessage } = req.body;

    if (!app || !['customer', 'driver'].includes(app)) {
      return res.status(400).json({ success: false, error: "app must be 'customer' or 'driver'" });
    }
    if (minVersionCode === undefined) {
      return res.status(400).json({ success: false, error: 'minVersionCode is required' });
    }

    const config = await AppConfig.findOneAndUpdate(
      { app },
      {
        app,
        minVersionCode,
        ...(latestVersionCode !== undefined && { latestVersionCode }),
        ...(playStoreUrl !== undefined && { playStoreUrl }),
        ...(updateMessage !== undefined && { updateMessage })
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ success: true, config });
  } catch (error) {
    console.error('Upsert app config error:', error);
    res.status(500).json({ success: false, error: 'Failed to update app config' });
  }
};
