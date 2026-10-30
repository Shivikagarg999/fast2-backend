const mongoose = require('mongoose');

const whatsappMessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsappConversation', required: true, index: true },
  phone: { type: String, required: true },
  direction: { type: String, enum: ['in', 'out'], required: true },
  sentBy: { type: String, enum: ['customer', 'bot', 'admin'], required: true },
  body: { type: String, default: '' },
  type: { type: String, default: 'text' } // text, interactive, order, etc. — for display hints only
}, { timestamps: true });

whatsappMessageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.models.WhatsappMessage || mongoose.model('WhatsappMessage', whatsappMessageSchema);
