const mongoose = require('mongoose');

// One document per app (customer, driver, ...). Lets us force older installs
// to update by comparing their build number against minVersionCode.
const appConfigSchema = new mongoose.Schema({
  app: {
    type: String,
    enum: ['customer', 'driver'],
    required: true,
    unique: true
  },
  minVersionCode: {
    type: Number,
    required: true,
    default: 1
  },
  latestVersionCode: {
    type: Number,
    default: 1
  },
  playStoreUrl: {
    type: String,
    default: ''
  },
  updateMessage: {
    type: String,
    default: 'A new version of the app is available. Please update to continue.'
  },
  productServiceRadiusKm: {
    type: Number,
    min: 0.1,
    max: 100,
    default: 5
  },
  freeDeliveryThreshold: {
    type: Number,
    min: 0,
    default: 199
  },
  // Distance-based delivery pricing (customer app only). fromKm/toKm bands must be
  // contiguous starting at 0; charge is cumulative/tiered across bands up to the
  // customer's distance. productServiceRadiusKm is kept in sync with the last
  // band's toKm whenever this is saved (see appConfigController.upsertAppConfig).
  deliverySlabs: [{
    fromKm: { type: Number, required: true, min: 0 },
    toKm: { type: Number, required: true, min: 0 },
    chargeType: { type: String, enum: ['flat', 'per_km'], required: true },
    rate: { type: Number, required: true, min: 0 }
  }]
}, { timestamps: true });

module.exports = mongoose.model('AppConfig', appConfigSchema);
