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
    todayEarnings: {
      type: Number,
      default: 0
    },
    totalPayouts: {
      type: Number,
      default: 0
    },
    lastPayoutDate: {
      type: Date
    },
    lastPayoutAmount: {
      type: Number,
      default: 0
    }
  },
  payoutDetails: {
    preferredMethod: {
      type: String,
      enum: ['upi', 'bank_transfer', 'cash', 'wallet'],
      default: 'upi'
    },
    upiId: {
      type: String
    },
    bankAccount: {
      accountHolder: String,
      accountNumber: String,
      ifscCode: String,
      bankName: String
    },
    walletAddress: {
      type: String
    },
    payoutThreshold: {
      type: Number,
      default: 500
    },
    autoPayout: {
      type: Boolean,
      default: false
    }
  },
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
    averageDeliveryTime: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0
    },
    totalRatings: {
      type: Number,
      default: 0
    },
    onTimeDeliveryRate: {
      type: Number,
      default: 0
    },
    acceptanceRate: {
      type: Number,
      default: 0
    },
    totalDistance: {
      type: Number,
      default: 0
    }
  },
  activity: {
    totalOnlineHours: {
      type: Number,
      default: 0
    },
    currentSessionStart: {
      type: Date
    },
    lastActive: {
      type: Date,
      default: Date.now
    },
    totalSessions: {
      type: Number,
      default: 0
    },
    averageSessionHours: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

driverSchema.index({ 'workInfo.availability': 1 });
driverSchema.index({ 'workInfo.currentLocation.coordinates': '2dsphere' });
driverSchema.index({ 'workInfo.status': 1 });
driverSchema.index({ 'personalInfo.phone': 1 });
driverSchema.index({ 'earnings.pendingPayout': 1 });
driverSchema.index({ 'payoutDetails.preferredMethod': 1 });

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
      this.activity.totalSessions += 1;
    } else if (status === 'offline' && this.activity.currentSessionStart) {
      const sessionHours = (new Date() - this.activity.currentSessionStart) / (1000 * 60 * 60);
      this.activity.totalOnlineHours += sessionHours;
      
      const totalSessions = Math.max(1, this.activity.totalSessions);
      this.activity.averageSessionHours = this.activity.totalOnlineHours / totalSessions;
      
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

driverSchema.methods.completeDelivery = function(earnings, deliveryTime, distance = 0, rating = null) {
  this.workInfo.currentOrder = null;
  this.workInfo.availability = 'online';
  
  this.deliveryStats.totalOrders += 1;
  this.deliveryStats.completedOrders += 1;
  
  if (distance > 0) {
    this.deliveryStats.totalDistance += distance;
  }
  
  const totalTime = this.deliveryStats.averageDeliveryTime * (this.deliveryStats.completedOrders - 1) + deliveryTime;
  this.deliveryStats.averageDeliveryTime = totalTime / this.deliveryStats.completedOrders;
  
  if (this.deliveryStats.totalOrders > 0) {
    this.deliveryStats.onTimeDeliveryRate = (this.deliveryStats.completedOrders / this.deliveryStats.totalOrders) * 100;
  }
  
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

driverSchema.methods.addEarning = function(amount, description = 'Delivery completed') {
  this.earnings.totalEarnings += amount;
  this.earnings.currentBalance += amount;
  this.earnings.pendingPayout += amount;
  this.earnings.todayEarnings += amount;
  return this.save();
};

driverSchema.methods.processPayout = function(amount, payoutMethod = 'upi', transactionId = null) {
  if (amount > this.earnings.pendingPayout) {
    throw new Error('Insufficient pending payout balance');
  }
  
  this.earnings.pendingPayout -= amount;
  this.earnings.totalPayouts += amount;
  this.earnings.lastPayoutDate = new Date();
  this.earnings.lastPayoutAmount = amount;
  
  this.payoutDetails.preferredMethod = payoutMethod;
  
  return this.save();
};

driverSchema.methods.resetTodayEarnings = function() {
  this.earnings.todayEarnings = 0;
  return this.save();
};

driverSchema.methods.updatePayoutDetails = function(details) {
  if (details.preferredMethod) {
    this.payoutDetails.preferredMethod = details.preferredMethod;
  }
  if (details.upiId) {
    this.payoutDetails.upiId = details.upiId;
  }
  if (details.bankAccount) {
    this.payoutDetails.bankAccount = details.bankAccount;
  }
  if (details.walletAddress) {
    this.payoutDetails.walletAddress = details.walletAddress;
  }
  if (details.payoutThreshold !== undefined) {
    this.payoutDetails.payoutThreshold = details.payoutThreshold;
  }
  if (details.autoPayout !== undefined) {
    this.payoutDetails.autoPayout = details.autoPayout;
  }
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
    'deliveryStats.onTimeDeliveryRate': -1,
    'earnings.pendingPayout': -1
  });
};

driverSchema.statics.findDriversForPayout = function(minAmount = 100) {
  return this.find({
    'workInfo.status': 'approved',
    'earnings.pendingPayout': { $gte: minAmount },
    'payoutDetails.preferredMethod': { $exists: true, $ne: null }
  }).sort({ 'earnings.pendingPayout': -1 });
};

driverSchema.methods.calculateAcceptanceRate = function(totalOrdersOffered) {
  if (totalOrdersOffered === 0) return 0;
  return (this.deliveryStats.completedOrders / totalOrdersOffered) * 100;
};

driverSchema.methods.getEarningsSummary = function() {
  return {
    totalEarnings: this.earnings.totalEarnings,
    currentBalance: this.earnings.currentBalance,
    pendingPayout: this.earnings.pendingPayout,
    todayEarnings: this.earnings.todayEarnings,
    totalPayouts: this.earnings.totalPayouts,
    lastPayout: {
      date: this.earnings.lastPayoutDate,
      amount: this.earnings.lastPayoutAmount
    },
    payoutThreshold: this.payoutDetails.payoutThreshold,
    preferredMethod: this.payoutDetails.preferredMethod
  };
};

driverSchema.virtual('fullAddress').get(function() {
  const addr = this.address.currentAddress;
  return `${addr.addressLine}, ${addr.city}, ${addr.state} - ${addr.pinCode}`;
});

driverSchema.virtual('performanceScore').get(function() {
  const ratingScore = this.deliveryStats.averageRating * 20;
  const completionRate = (this.deliveryStats.completedOrders / Math.max(1, this.deliveryStats.totalOrders)) * 100;
  const acceptanceRate = this.deliveryStats.acceptanceRate || 0;
  const onTimeRate = this.deliveryStats.onTimeDeliveryRate || 0;
  
  return (ratingScore + completionRate + acceptanceRate + onTimeRate) / 4;
});

driverSchema.virtual('isEligibleForPayout').get(function() {
  return this.earnings.pendingPayout >= this.payoutDetails.payoutThreshold && 
         this.workInfo.status === 'approved' &&
         (this.payoutDetails.upiId || this.payoutDetails.bankAccount.accountNumber);
});

driverSchema.virtual('payoutEta').get(function() {
  if (!this.isEligibleForPayout) return null;
  
  const pendingAmount = this.earnings.pendingPayout;
  const threshold = this.payoutDetails.payoutThreshold;
  
  if (pendingAmount >= threshold * 2) {
    return 'immediate';
  } else if (pendingAmount >= threshold * 1.5) {
    return 'within_24_hours';
  } else {
    return 'weekly_batch';
  }
});

module.exports = mongoose.model('Driver', driverSchema);