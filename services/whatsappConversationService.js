const WhatsappConversation = require("../models/whatsappConversation");
const WhatsappMessage = require("../models/whatsappMessage");

// Shared by the webhook (inbound) and whatsappService (outbound) so every
// message — no matter which side sent it — lands in the same thread the
// admin inbox reads.
const findOrCreateConversation = async (phone, customerName) => {
  const conversation = await WhatsappConversation.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone, customerName: customerName || "" } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  if (customerName && !conversation.customerName) {
    conversation.customerName = customerName;
    await conversation.save();
  }
  return conversation;
};

// direction: 'in' | 'out', sentBy: 'customer' | 'bot' | 'admin'
const recordMessage = async (conversation, { direction, sentBy, body, type = "text" }) => {
  await WhatsappMessage.create({
    conversation: conversation._id,
    phone: conversation.phone,
    direction,
    sentBy,
    body,
    type
  });

  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = (body || "").slice(0, 120);
  if (direction === "in") {
    conversation.unreadByAdmin = (conversation.unreadByAdmin || 0) + 1;
  }
  await conversation.save();
};

module.exports = { findOrCreateConversation, recordMessage };
