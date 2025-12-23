const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
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
  },
  policyType: {
    type: String,
    enum: ['terms', 'return', 'cancellation', 'refund'],
    required: true,
    index: true
  },
  metadata: {
    returnPeriod: Number,
    cancellationFee: Number, 
    refundProcessingDays: Number,
    contactEmail: String,
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true
});

policySchema.index({ policyType: 1, isActive: 1 }, { 
  unique: true, 
  partialFilterExpression: { isActive: true } 
});

policySchema.index({ policyType: 1, version: 1 }, { unique: true });

policySchema.statics.getActivePolicy = async function(policyType) {
  return this.findOne({ policyType, isActive: true });
};

policySchema.statics.deactivateAllOfType = async function(policyType) {
  return this.updateMany(
    { policyType, isActive: true },
    { $set: { isActive: false } }
  );
};

module.exports = mongoose.model('Policy', policySchema);