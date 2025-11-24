const mongoose = require('mongoose');

const termsAndConditionsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  version: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  effectiveDate: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

termsAndConditionsSchema.index({ isActive: 1, version: 1 });

module.exports = mongoose.model('TermsAndConditions', termsAndConditionsSchema);