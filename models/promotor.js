const mongoose = require('mongoose');

const promotorSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  phone: { 
    type: String, 
    required: true 
  },
  address: {
    street: String,
    city: { 
      type: String, 
      required: true 
    },
    state: String,
    pincode: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  
  commissionRate: { 
    type: Number, 
    required: true, 
    default: 5, 
    min: 0,
    max: 100 
  },
  commissionType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  
  // Performance Metrics
  totalProductsAdded: { 
    type: Number, 
    default: 0 
  },
  totalCommissionEarned: { 
    type: Number, 
    default: 0 
  },
  active: { 
    type: Boolean, 
    default: true 
  },
  
  // Authentication
  password: {
    type: String,
    required: true
  },
  
  // Additional Details
  aadharNumber: String,
  panNumber: String,
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    branch: String
  }
}, { 
  timestamps: true 
});

// Index for efficient city-based queries
promotorSchema.index({ city: 1, active: 1 });

// Virtual for formatted address
promotorSchema.virtual('formattedAddress').get(function() {
  return `${this.address.street}, ${this.address.city}, ${this.address.state} - ${this.address.pincode}`;
});

const Promotor = mongoose.model('Promotor', promotorSchema);


module.exports = Promotor;
