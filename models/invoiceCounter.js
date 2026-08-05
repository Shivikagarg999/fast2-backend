const mongoose = require("mongoose");

// Single global atomic counter used to generate sequential invoice numbers
// (GST tax invoices must have unique, sequential numbers).
const invoiceCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

module.exports = mongoose.model("InvoiceCounter", invoiceCounterSchema);
