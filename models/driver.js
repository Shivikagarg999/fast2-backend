const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const driverSchema = new mongoose.Schema({
  personalInfo: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      unique: true
    },
    dateOfBirth: {
      type: Date,
      required: true
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true
    },
    profilePhoto: {
      type: String,
      default: null
    }
  },

  // Authentication
  auth: {
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    fcmToken: {
      type: String,
      default: null
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    lastLogin: {
      type: Date,
      default: null
    }
  },

  // Address Information
  address: {
    currentAddress: {
      addressLine: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pinCode: { type: String, required: true },
      country: { type: String, default: 'India' },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number }
      }
    }
  },

  // Vehicle Information
  vehicle: {
    type: {
      type: String,
      required: true
    },
    make: {
      type: String,
      required: true
    },
    model: {
      type: String,
      required: true
    },
    registrationNumber: {
      type: String,
      required: true,
      unique: true
    },
    color: {
      type: String,
      required: true
    },
    rcDocument: {
      type: String, // URL to RC document
      required: true
    }
  },

  // Documents
  documents: {
    drivingLicense: {
      number: { type: String, required: true },
      expiryDate: { type: Date, required: true },
      frontImage: { type: String, required: true },
      backImage: { type: String, required: true }
    },
    aadharCard: {
      number: { type: String, required: true },
      frontImage: { type: String, required: true },
      backImage: { type: String, required: true }
    }
  },

  // Bank Details for Payouts
  bankDetails: {
    accountHolderName: {
      type: String,
      required: true
    },
    accountNumber: {
      type: String,
      required: true
    },
    ifscCode: {
      type: String,
      required: true
    },
    bankName: {
      type: String,
      required: true
    },
    upiId: {
      type: String
    }
  },

  // Work Information
  workInfo: {
    driverId: {
      type: String,
      unique: true,
    },
    joiningDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended', 'inactive'],
      default: 'pending'
    },
    availability: {
      type: String,
      enum: ['online', 'offline', 'on-delivery', 'break'],
      default: 'offline'
    },
    currentLocation: {
      coordinates: {
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 }
      },
      lastUpdated: { type: Date },
      address: { type: String }
    },
    currentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null
    }
  },

  // Delivery Performance
  deliveryStats: {
    totalOrders: {
      type: Number,
      default: 0
    },
    completedOrders: {
      type: Number,
      default: 0
    },
    cancelledOrders: {
      type: Number,
      default: 0
    },
    failedDeliveries: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalRatings: {
      type: Number,
      default: 0
    },
    onTimeDeliveryRate: {
      type: Number,
      default: 0
    },
    averageDeliveryTime: {
      type: Number, // in minutes
      default: 0
    }
  },

  // Earnings
  earnings: {
    totalEarnings: {
      type: Number,
      default: 0
    },
    currentBalance: {
      type: Number,
      default: 0
    },
    pendingPayout: {
      type: Number,
      default: 0
    },
    lastPayoutDate: {
      type: Date
    },
    todayEarnings: {
      type: Number,
      default: 0
    },
    weeklyEarnings: {
      type: Number,
      default: 0
    },
    monthlyEarnings: {
      type: Number,
      default: 0
    }
  },

  // Delivery Preferences
  deliveryPreferences: {
    autoAccept: {
      type: Boolean,
      default: false
    },
    maxDeliveryDistance: {
      type: Number, // in kilometers
      default: 10
    },
    preferredAreas: [{
      pinCode: String,
      areaName: String
    }]
  },

  // Emergency Contact
  emergencyContact: {
    name: {
      type: String,
      required: true
    },
    relationship: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    }
  },

  // Activity Tracking
  activity: {
    lastActive: {
      type: Date,
      default: Date.now
    },
    totalOnlineHours: {
      type: Number, // in hours
      default: 0
    },
    currentSessionStart: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
driverSchema.index({ 'workInfo.availability': 1 });
driverSchema.index({ 'workInfo.currentLocation.coordinates': '2dsphere' });
driverSchema.index({ 'workInfo.status': 1 });
driverSchema.index({ 'personalInfo.phone': 1 });

// Pre-save middleware to hash password
driverSchema.pre('save', async function(next) {
  if (!this.isModified('auth.password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.auth.password = await bcrypt.hash(this.auth.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
driverSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.auth.password);
};

// Method to generate driver ID
driverSchema.pre('save', async function(next) {
  if (this.isNew && !this.workInfo.driverId) {
    const count = await this.constructor.countDocuments();
    this.workInfo.driverId = `DRV${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Method to update location
driverSchema.methods.updateLocation = function(lat, lng, address = null) {
  this.workInfo.currentLocation = {
    coordinates: { lat, lng },
    lastUpdated: new Date(),
    address: address || this.workInfo.currentLocation?.address
  };
  this.activity.lastActive = new Date();
  return this.save();
};

// Method to set availability status
driverSchema.methods.setAvailability = function(status) {
  const allowedStatuses = ['online', 'offline', 'on-delivery', 'break'];
  if (allowedStatuses.includes(status)) {
    this.workInfo.availability = status;
    
    if (status === 'online') {
      this.activity.currentSessionStart = new Date();
    } else if (status === 'offline' && this.activity.currentSessionStart) {
      const sessionHours = (new Date() - this.activity.currentSessionStart) / (1000 * 60 * 60);
      this.activity.totalOnlineHours += sessionHours;
      this.activity.currentSessionStart = null;
    }
    
    this.activity.lastActive = new Date();
    return this.save();
  }
  throw new Error('Invalid availability status');
};

// Method to assign order to driver
driverSchema.methods.assignOrder = function(orderId) {
  if (this.workInfo.availability !== 'online') {
    throw new Error('Driver is not available for delivery');
  }
  
  this.workInfo.currentOrder = orderId;
  this.workInfo.availability = 'on-delivery';
  return this.save();
};

// Method to complete delivery
driverSchema.methods.completeDelivery = function(earnings, deliveryTime, rating = null) {
  this.workInfo.currentOrder = null;
  this.workInfo.availability = 'online';
  
  // Update delivery stats
  this.deliveryStats.totalOrders += 1;
  this.deliveryStats.completedOrders += 1;
  
  // Update earnings
  this.earnings.totalEarnings += earnings;
  this.earnings.currentBalance += earnings;
  this.earnings.pendingPayout += earnings;
  this.earnings.todayEarnings += earnings;
  
  // Update average delivery time
  const totalTime = this.deliveryStats.averageDeliveryTime * (this.deliveryStats.completedOrders - 1) + deliveryTime;
  this.deliveryStats.averageDeliveryTime = totalTime / this.deliveryStats.completedOrders;
  
  // Update rating if provided
  if (rating) {
    const totalRating = this.deliveryStats.averageRating * this.deliveryStats.totalRatings + rating;
    this.deliveryStats.totalRatings += 1;
    this.deliveryStats.averageRating = totalRating / this.deliveryStats.totalRatings;
  }
  
  // Reset session start time
  this.activity.currentSessionStart = new Date();
  
  return this.save();
};

// Method to cancel delivery
driverSchema.methods.cancelDelivery = function() {
  this.workInfo.currentOrder = null;
  this.workInfo.availability = 'online';
  this.deliveryStats.cancelledOrders += 1;
  this.activity.currentSessionStart = new Date();
  return this.save();
};

// Static method to find available drivers near location
driverSchema.statics.findAvailableDrivers = function(lat, lng, maxDistance = 5000) {
  return this.find({
    'workInfo.availability': 'online',
    'workInfo.status': 'approved',
    'workInfo.currentLocation.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        $maxDistance: maxDistance
      }
    }
  }).sort({ 
    'deliveryStats.averageRating': -1,
    'deliveryStats.onTimeDeliveryRate': -1 
  });
};

// Method to calculate acceptance rate (if you want to track order acceptance)
driverSchema.methods.calculateAcceptanceRate = function(totalOrdersOffered) {
  if (totalOrdersOffered === 0) return 0;
  return (this.deliveryStats.completedOrders / totalOrdersOffered) * 100;
};

// Virtual for driver's full address
driverSchema.virtual('fullAddress').get(function() {
  const addr = this.address.currentAddress;
  return `${addr.addressLine}, ${addr.city}, ${addr.state} - ${addr.pinCode}`;
});

// Virtual for driver's performance score
driverSchema.virtual('performanceScore').get(function() {
  const ratingScore = this.deliveryStats.averageRating * 20; // 0-100
  const completionRate = (this.deliveryStats.completedOrders / this.deliveryStats.totalOrders) * 100 || 0;
  return (ratingScore + completionRate) / 2;
});

module.exports = mongoose.model('Driver', driverSchema);