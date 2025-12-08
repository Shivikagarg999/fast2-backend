const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const driverSchema = new mongoose.Schema({
  personalInfo: {
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      unique: true
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    profilePhoto: {
      type: String,
      default: null
    }
  },
  auth: {
    password: {
      type: String,
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

  address: {
    currentAddress: {
      addressLine: { type: String },
      city: { type: String },
      state: { type: String },
      pinCode: { type: String },
      country: { type: String, default: 'India' },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number }
      }
    }
  },

  vehicle: {
    type: {
      type: String,
    },
    make: {
      type: String,
    },
    model: {
      type: String,
    },
    registrationNumber: {
      type: String,
      unique: true
    },
    color: {
      type: String,
    },
    rcDocument: {
      type: String,
    }
  },

  documents: {
    drivingLicense: {
      number: { type: String },
      expiryDate: { type: Date },
      frontImage: { type: String },
      backImage: { type: String }
    },
    aadharCard: {
      number: { type: String },
      frontImage: { type: String },
      backImage: { type: String }
    }
  },

  bankDetails: {
    accountHolderName: {
      type: String,
    },
    accountNumber: {
      type: String,
    },
    ifscCode: {
      type: String,
    },
    bankName: {
      type: String,
    },
    upiId: {
      type: String
    }
  },

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

}, {
  timestamps: true
});

driverSchema.index({ 'workInfo.availability': 1 });
driverSchema.index({ 'workInfo.currentLocation.coordinates': '2dsphere' });
driverSchema.index({ 'workInfo.status': 1 });
driverSchema.index({ 'personalInfo.phone': 1 });

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

driverSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.auth.password);
};

driverSchema.pre('save', async function(next) {
  if (this.isNew && !this.workInfo.driverId) {
    const count = await this.constructor.countDocuments();
    this.workInfo.driverId = `DRV${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

driverSchema.methods.updateLocation = function(lat, lng, address = null) {
  this.workInfo.currentLocation = {
    coordinates: { lat, lng },
    lastUpdated: new Date(),
    address: address || this.workInfo.currentLocation?.address
  };
  this.activity.lastActive = new Date();
  return this.save();
};

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

driverSchema.methods.assignOrder = function(orderId) {
  if (this.workInfo.availability !== 'online') {
    throw new Error('Driver is not available for delivery');
  }
  
  this.workInfo.currentOrder = orderId;
  this.workInfo.availability = 'on-delivery';
  return this.save();
};

driverSchema.methods.completeDelivery = function(earnings, deliveryTime, rating = null) {
  this.workInfo.currentOrder = null;
  this.workInfo.availability = 'online';
  
  this.deliveryStats.totalOrders += 1;
  this.deliveryStats.completedOrders += 1;
  
  this.earnings.totalEarnings += earnings;
  this.earnings.currentBalance += earnings;
  this.earnings.pendingPayout += earnings;
  this.earnings.todayEarnings += earnings;
  
  const totalTime = this.deliveryStats.averageDeliveryTime * (this.deliveryStats.completedOrders - 1) + deliveryTime;
  this.deliveryStats.averageDeliveryTime = totalTime / this.deliveryStats.completedOrders;
  
  if (rating) {
    const totalRating = this.deliveryStats.averageRating * this.deliveryStats.totalRatings + rating;
    this.deliveryStats.totalRatings += 1;
    this.deliveryStats.averageRating = totalRating / this.deliveryStats.totalRatings;
  }
  
  this.activity.currentSessionStart = new Date();
  
  return this.save();
};

driverSchema.methods.cancelDelivery = function() {
  this.workInfo.currentOrder = null;
  this.workInfo.availability = 'online';
  this.deliveryStats.cancelledOrders += 1;
  this.activity.currentSessionStart = new Date();
  return this.save();
};

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

driverSchema.methods.calculateAcceptanceRate = function(totalOrdersOffered) {
  if (totalOrdersOffered === 0) return 0;
  return (this.deliveryStats.completedOrders / totalOrdersOffered) * 100;
};

driverSchema.virtual('fullAddress').get(function() {
  const addr = this.address.currentAddress;
  return `${addr.addressLine}, ${addr.city}, ${addr.state} - ${addr.pinCode}`;
});
driverSchema.virtual('performanceScore').get(function() {
  const ratingScore = this.deliveryStats.averageRating * 20;
  const completionRate = (this.deliveryStats.completedOrders / this.deliveryStats.totalOrders) * 100 || 0;
  return (ratingScore + completionRate) / 2;
});

module.exports = mongoose.model('Driver', driverSchema);