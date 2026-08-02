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
  }
}, { timestamps: true });

module.exports = mongoose.model('AppConfig', appConfigSchema);
