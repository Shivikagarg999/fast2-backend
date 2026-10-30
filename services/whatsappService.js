const axios = require("axios");

// All of Meta's WhatsApp Cloud API calls go through this one Graph API base —
// nothing here needs a paid BSP, just the access token + phone number ID
// generated from your own Meta Developer App (see WHATSAPP_SETUP.md).
const GRAPH_API_VERSION = "v21.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const isConfigured = () => !!(PHONE_NUMBER_ID && ACCESS_TOKEN);

const graphUrl = (path) =>
  `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}${path}`;

// Logs every outbound message into the conversation record the admin inbox reads —
// regardless of whether the bot or an admin sent it. Never throws: a logging
// failure must not block the actual WhatsApp send.
const logOutbound = async (to, body, sentBy) => {
  try {
    const { findOrCreateConversation, recordMessage } = require("./whatsappConversationService");
    const conversation = await findOrCreateConversation(to);
    await recordMessage(conversation, { direction: "out", sentBy, body });
  } catch (error) {
    console.error("WhatsApp outbound logging error:", error.message);
  }
};

const send = async (payload, { sentBy = "bot", logBody } = {}) => {
  if (!isConfigured()) {
    console.warn("WhatsApp not configured (WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN missing) — skipping send");
    return null;
  }
  try {
    const { data } = await axios.post(
      graphUrl("/messages"),
      { messaging_product: "whatsapp", ...payload },
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
    if (payload.to) await logOutbound(payload.to, logBody ?? "", sentBy);
    return data;
  } catch (error) {
    console.error("WhatsApp send error:", error.response?.data || error.message);
    return null;
  }
};

exports.isConfigured = isConfigured;

exports.sendText = (to, body, sentBy = "bot") =>
  send({ to, type: "text", text: { body } }, { sentBy, logBody: body });

// Up to 3 quick-reply buttons — good for simple yes/no or menu choices.
exports.sendButtons = (to, bodyText, buttons) =>
  send({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) }
        }))
      }
    }
  }, { logBody: bodyText });

// Points the customer at the linked Commerce Catalog — tapping it opens
// WhatsApp's native product browsing + cart UI, nothing custom-built.
exports.sendCatalogPrompt = (to, bodyText) =>
  send({
    to,
    type: "interactive",
    interactive: {
      type: "catalog_message",
      body: { text: bodyText },
      action: { name: "catalog_message" }
    }
  }, { logBody: bodyText });

exports.sendPaymentLink = (to, orderSummary, amount, paymentLinkUrl) => {
  const body =
    `Your order:\n\n${orderSummary}\n\n` +
    `Total: ₹${amount}\n\n` +
    `Pay here to confirm your order:\n${paymentLinkUrl}`;
  return send({ to, type: "text", text: { body } }, { logBody: body });
};
