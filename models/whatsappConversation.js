const mongoose = require('mongoose');

const whatsappConversationSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true }, // normalized, digits-only with country code
  customerName: { type: String, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastMessageAt: { type: Date, default: Date.now },
  lastMessagePreview: { type: String, default: '' },
  unreadByAdmin: { type: Number, default: 0 },
  // When true, the automated bot stops replying to this phone — an admin is
  // handling it manually from the inbox, until they hand it back.
  isBotPaused: { type: Boolean, default: false }
}, { timestamps: true });

whatsappConversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.models.WhatsappConversation || mongoose.model('WhatsappConversation', whatsappConversationSchema);
