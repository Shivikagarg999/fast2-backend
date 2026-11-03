const axios = require("axios");

// All of Meta's WhatsApp Cloud API calls go through this one Graph API base —
// nothing here needs a paid BSP, just the access token + phone number ID
// generated from your own Meta Developer App (see WHATSAPP_SETUP.md).
const GRAPH_API_VERSION = "v21.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

const isConfigured = () => !!(PHONE_NUMBER_ID && ACCESS_TOKEN);

const graphUrl = (path) =>
  `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}${path}`;

// Message templates live on the WhatsApp Business Account, not the phone
// number — a separate Graph API base.
const wabaUrl = (path) =>
  `https://graph.facebook.com/${GRAPH_API_VERSION}/${BUSINESS_ACCOUNT_ID}${path}`;

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

// Returns { ok, data, error }. `data` is the raw Graph API response body on
// success; `error` is Meta's real error message on failure, so admin-facing
// callers can show the customer-visible reason instead of a generic
// "failed" message. (The bot flow in whatsappController.js only ever awaits
// these calls without inspecting the result, so this shape change is safe there.)
const send = async (payload, { sentBy = "bot", logBody } = {}) => {
  if (!isConfigured()) {
    return { ok: false, data: null, error: "WhatsApp is not configured on the server" };
  }
  try {
    const { data } = await axios.post(
      graphUrl("/messages"),
      { messaging_product: "whatsapp", ...payload },
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
    if (payload.to) await logOutbound(payload.to, logBody ?? "", sentBy);
    return { ok: true, data, error: null };
  } catch (error) {
    const metaMessage = error.response?.data?.error?.message;
    console.error("WhatsApp send error:", error.response?.data || error.message);
    return { ok: false, data: null, error: metaMessage || error.message };
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

// ─── Message templates (needed to message a customer outside the 24-hour
// window, or for anything business-initiated — marketing, reminders, etc.) ──

// Throws on failure so the admin controller can surface Meta's real reason
// (e.g. a duplicate name, invalid category) instead of a generic error.
exports.listTemplates = async () => {
  const { data } = await axios.get(wabaUrl("/message_templates?limit=100"), {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });
  return data.data || [];
};

// category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
// bodyText may contain {{1}}, {{2}}... placeholders, per Meta's template syntax.
exports.createTemplate = async ({ name, category, language, bodyText }) => {
  const { data } = await axios.post(
    wabaUrl("/message_templates"),
    {
      name,
      category,
      language,
      components: [{ type: "BODY", text: bodyText }]
    },
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
  return data;
};

// A catalog/multi-product button carries no {{1}}-style text placeholder, but
// Meta still requires a matching "button" component (with a thumbnail product,
// and for MPM a full product list) at send time, or it fails with 131008
// "Required parameter is missing". Build that component from our own catalog
// so admins never have to hand-assemble it.
const buildCatalogButtonComponent = async (templateComponents) => {
  const buttonsBlock = templateComponents.find((c) => c.type === "BUTTONS");
  const catalogButtonIndex = buttonsBlock?.buttons?.findIndex((b) => b.type === "CATALOG" || b.type === "MPM");
  if (catalogButtonIndex == null || catalogButtonIndex < 0) return null;

  const subType = buttonsBlock.buttons[catalogButtonIndex].type === "MPM" ? "mpm" : "catalog";

  const Product = require("../models/product");
  const products = await Product.find({ isActive: true, stockStatus: "in-stock" })
    .select("_id")
    .limit(30)
    .lean();
  if (!products.length) return null;

  const thumbnailProductId = products[0]._id.toString();
  const action = subType === "mpm"
    ? {
        thumbnail_product_retailer_id: thumbnailProductId,
        sections: [{ title: "Our Products", product_items: products.map((p) => ({ product_retailer_id: p._id.toString() })) }]
      }
    : { thumbnail_product_retailer_id: thumbnailProductId };

  return { type: "button", sub_type: subType, index: String(catalogButtonIndex), parameters: [{ type: "action", action }] };
};

// Sends an already-approved template. bodyParams fills {{1}}, {{2}}... in order.
exports.sendTemplate = async (to, name, language, bodyParams = []) => {
  const components = bodyParams.length
    ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
    : [];

  try {
    const templates = await exports.listTemplates();
    const template = templates.find((t) => t.name === name && t.language === language);
    const catalogButton = template ? await buildCatalogButtonComponent(template.components || []) : null;
    if (catalogButton) components.push(catalogButton);
  } catch (error) {
    console.error("Template lookup for catalog button failed:", error.message);
  }

  return send({
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(components.length ? { components } : {})
    }
  }, { logBody: `[Template: ${name}]` });
};
