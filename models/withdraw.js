const mongoose = require("mongoose");

const withdrawSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "paid"],
      default: "pending",
    },

    paymentMode: {
      type: String,
      enum: ["upi", "bank-transfer", "cash"],
      default: "upi",
    },

    upiId: {
      type: String,
      default: null,
    },

    bankDetails: {
      accountHolderName: { type: String, default: null },
      accountNumber: { type: String, default: null },
      ifscCode: { type: String, default: null },
      bankName: { type: String, default: null },
    },

    remarks: {
      type: String,
      default: "",
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Withdraw", withdrawSchema);
