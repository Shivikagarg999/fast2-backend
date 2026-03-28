const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  price: {
    type: Number,
    required: true
  },
  gstPercent: {
    type: Number,
    default: 0
  },
  gstAmount: {
    type: Number,
    default: 0
  }
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    items: [cartItemSchema],
    total: {
      type: Number,
      default: 0
    },
    totalGst: {
      type: Number,
      default: 0
    },
    finalAmount: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// Calculate totals before saving
cartSchema.pre("save", function(next) {
  let total = 0;
  let totalGst = 0;

  this.items.forEach(item => {
    const itemSubtotal = item.price * item.quantity;
    const gstAmount = parseFloat(((itemSubtotal * (item.gstPercent || 0)) / 100).toFixed(2));
    item.gstAmount = gstAmount;
    total += itemSubtotal;
    totalGst += gstAmount;
  });

  this.total = parseFloat(total.toFixed(2));
  this.totalGst = parseFloat(totalGst.toFixed(2));
  this.finalAmount = parseFloat((total + totalGst).toFixed(2));
  next();
});

module.exports = mongoose.model("Cart", cartSchema);
