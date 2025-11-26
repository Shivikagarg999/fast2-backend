const mongoose = require("mongoose");

const warehouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, unique: true },

    warehouseManager: { type: String },
    contact: { type: String },

    promotor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotor",
      required: true,
    },

    location: {
      address: String,
      city: { type: String, required: true },
      state: String,
      pincode: String,
      coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
    },

    serviceablePincodes: [{ type: String }],
    sellers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Seller",
      },
    ],
    storageType: {
      type: String,
      enum: ["ambient", "cold-storage", "frozen"],
      default: "ambient",
    },

    capacity: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Warehouse = mongoose.model("Warehouse", warehouseSchema);
module.exports = Warehouse;
