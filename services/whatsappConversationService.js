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
const recordMessage = async (conversation, { direction, sentBy, body, type = "text", wamid }) => {
  const message = await WhatsappMessage.create({
    conversation: conversation._id,
    phone: conversation.phone,
    direction,
    sentBy,
    body,
    type,
    ...(wamid && { wamid })
  });

  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = (body || "").slice(0, 120);
  if (direction === "in") {
    conversation.unreadByAdmin = (conversation.unreadByAdmin || 0) + 1;
  }
  await conversation.save();

  return message;
};

// Meta reports delivery outcomes asynchronously via the webhook's "statuses"
// array, keyed by the wamid returned when we sent the message — this is the
// only way to find out a template that was "accepted" actually failed to
// reach the customer (e.g. they haven't opted in, or it's outside policy).
const recordStatusUpdate = async (wamid, status, errorMessage) => {
  if (!wamid || !["sent", "delivered", "read", "failed"].includes(status)) return;
  const update = { deliveryStatus: status };
  if (status === "failed" && errorMessage) update.failureReason = errorMessage;
  await WhatsappMessage.updateOne({ wamid }, { $set: update });
};

module.exports = { findOrCreateConversation, recordMessage, recordStatusUpdate };
