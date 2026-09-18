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
        productServiceRadiusKm: 5,
        freeDeliveryThreshold: 199,
        deliverySlabs: []
      });
    }

    res.status(200).json({
      success: true,
      minVersionCode: config.minVersionCode,
      latestVersionCode: config.latestVersionCode,
      playStoreUrl: config.playStoreUrl,
      updateMessage: config.updateMessage,
      productServiceRadiusKm: config.productServiceRadiusKm || 5,
      freeDeliveryThreshold: config.freeDeliveryThreshold ?? 199,
      deliverySlabs: config.deliverySlabs || []
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
    const { app, minVersionCode, latestVersionCode, playStoreUrl, updateMessage, productServiceRadiusKm, freeDeliveryThreshold, deliverySlabs } = req.body;

    if (!app || !['customer', 'driver'].includes(app)) {
      return res.status(400).json({ success: false, error: "app must be 'customer' or 'driver'" });
    }
    if (productServiceRadiusKm !== undefined &&
        (!Number.isFinite(Number(productServiceRadiusKm)) || Number(productServiceRadiusKm) < 0.1 || Number(productServiceRadiusKm) > 100)) {
      return res.status(400).json({ success: false, error: 'productServiceRadiusKm must be between 0.1 and 100' });
    }
    if (freeDeliveryThreshold !== undefined &&
        (!Number.isFinite(Number(freeDeliveryThreshold)) || Number(freeDeliveryThreshold) < 0)) {
      return res.status(400).json({ success: false, error: 'freeDeliveryThreshold must be 0 or greater' });
    }

    let normalizedSlabs;
    if (deliverySlabs !== undefined) {
      if (!Array.isArray(deliverySlabs) || !deliverySlabs.length) {
        return res.status(400).json({ success: false, error: 'deliverySlabs must be a non-empty array' });
      }

      normalizedSlabs = deliverySlabs
        .map((slab) => ({
          fromKm: Number(slab.fromKm),
          toKm: Number(slab.toKm),
          chargeType: slab.chargeType,
          rate: Number(slab.rate)
        }))
        .sort((a, b) => a.fromKm - b.fromKm);

      for (let i = 0; i < normalizedSlabs.length; i++) {
        const slab = normalizedSlabs[i];
        if (!Number.isFinite(slab.fromKm) || !Number.isFinite(slab.toKm) || slab.toKm <= slab.fromKm) {
          return res.status(400).json({ success: false, error: 'Each slab must have toKm greater than fromKm' });
        }
        if (!['flat', 'per_km'].includes(slab.chargeType)) {
          return res.status(400).json({ success: false, error: "Each slab's chargeType must be 'flat' or 'per_km'" });
        }
        if (!Number.isFinite(slab.rate) || slab.rate < 0) {
          return res.status(400).json({ success: false, error: 'Each slab rate must be 0 or greater' });
        }
        if (i === 0 && slab.fromKm !== 0) {
          return res.status(400).json({ success: false, error: 'The first slab must start at 0 km' });
        }
        if (i > 0 && slab.fromKm !== normalizedSlabs[i - 1].toKm) {
          return res.status(400).json({ success: false, error: 'Slabs must be contiguous with no gaps or overlaps' });
        }
      }
    }

    const config = await AppConfig.findOneAndUpdate(
      { app },
      {
        app,
        ...(minVersionCode !== undefined && { minVersionCode }),
        ...(latestVersionCode !== undefined && { latestVersionCode }),
        ...(playStoreUrl !== undefined && { playStoreUrl }),
        ...(updateMessage !== undefined && { updateMessage }),
        ...(productServiceRadiusKm !== undefined && { productServiceRadiusKm: Number(productServiceRadiusKm) }),
        ...(freeDeliveryThreshold !== undefined && { freeDeliveryThreshold: Number(freeDeliveryThreshold) }),
        ...(normalizedSlabs !== undefined && {
          deliverySlabs: normalizedSlabs,
          productServiceRadiusKm: normalizedSlabs[normalizedSlabs.length - 1].toKm
        })
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ success: true, config });
  } catch (error) {
    console.error('Upsert app config error:', error);
    res.status(500).json({ success: false, error: 'Failed to update app config' });
  }
};
