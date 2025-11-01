const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      required: true,
    },
    password: { type: String },
    avatar: {
      type: String,
      default: "https://www.gravatar.com/avatar/?d=mp",
    },
    address: [{ type: String }],
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },

    otp: { type: String },
    otpExpires: { type: Date },

    wallet: {
      type: Number,
      default: 0,
    },

    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    referralCount: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);