const WhatsappConversation = require("../../../models/whatsappConversation");
const WhatsappMessage = require("../../../models/whatsappMessage");
const whatsappService = require("../../../services/whatsappService");

// @desc    List all WhatsApp conversations, most recently active first.
// @route   GET /api/admin/whatsapp/conversations
exports.getConversations = async (req, res) => {
  try {
    const conversations = await WhatsappConversation.find({})
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .lean();
    return res.status(200).json({ success: true, data: conversations });
  } catch (error) {
    console.error("Get WhatsApp conversations error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load conversations" });
  }
};

// @desc    Full message thread for one conversation; marks it read.
// @route   GET /api/admin/whatsapp/conversations/:phone/messages
exports.getMessages = async (req, res) => {
  try {
    const { phone } = req.params;
    const conversation = await WhatsappConversation.findOne({ phone });
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const messages = await WhatsappMessage.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .lean();

    if (conversation.unreadByAdmin > 0) {
      conversation.unreadByAdmin = 0;
      await conversation.save();
    }

    return res.status(200).json({ success: true, data: { conversation, messages } });
  } catch (error) {
    console.error("Get WhatsApp messages error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load messages" });
  }
};

// @desc    Admin sends a free-form message — also auto-pauses the bot for
//          this conversation, since an admin is now handling it directly.
// @route   POST /api/admin/whatsapp/conversations/:phone/send
exports.sendMessage = async (req, res) => {
  try {
    const { phone } = req.params;
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, message: "Message body is required" });
    }

    const conversation = await WhatsappConversation.findOne({ phone });
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    if (!conversation.isBotPaused) {
      conversation.isBotPaused = true;
      await conversation.save();
    }

    await whatsappService.sendText(phone, body.trim(), "admin");

    return res.status(200).json({ success: true, message: "Message sent" });
  } catch (error) {
    console.error("Admin WhatsApp send error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to send message" });
  }
};

// @desc    Explicitly pause/resume the bot for a conversation.
// @route   PUT /api/admin/whatsapp/conversations/:phone/bot-pause
exports.setBotPaused = async (req, res) => {
  try {
    const { phone } = req.params;
    const { paused } = req.body;

    const conversation = await WhatsappConversation.findOneAndUpdate(
      { phone },
      { $set: { isBotPaused: !!paused } },
      { new: true }
    );
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    return res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    console.error("Set WhatsApp bot-pause error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update conversation" });
  }
};

// @desc    List message templates (and their approval status) from Meta.
// @route   GET /api/admin/whatsapp/templates
exports.getTemplates = async (req, res) => {
  try {
    const templates = await whatsappService.listTemplates();
    return res.status(200).json({ success: true, data: templates });
  } catch (error) {
    const metaMessage = error.response?.data?.error?.message;
    console.error("Get WhatsApp templates error:", metaMessage || error.message);
    return res.status(500).json({ success: false, message: metaMessage || "Failed to load templates" });
  }
};

// @desc    Create a new message template — submitted to Meta for approval.
// @route   POST /api/admin/whatsapp/templates
exports.createTemplate = async (req, res) => {
  try {
    const { name, category, language, bodyText } = req.body;
    if (!name || !category || !language || !bodyText) {
      return res.status(400).json({ success: false, message: "name, category, language and bodyText are all required" });
    }
    // Meta requires lowercase, underscore-only template names.
    const normalizedName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");

    const result = await whatsappService.createTemplate({ name: normalizedName, category, language, bodyText });
    return res.status(201).json({ success: true, message: "Template submitted for approval", data: result });
  } catch (error) {
    const metaMessage = error.response?.data?.error?.message;
    console.error("Create WhatsApp template error:", metaMessage || error.message);
    return res.status(400).json({ success: false, message: metaMessage || "Failed to create template" });
  }
};

// @desc    Send an approved template to a specific conversation.
// @route   POST /api/admin/whatsapp/conversations/:phone/send-template
exports.sendTemplateMessage = async (req, res) => {
  try {
    const { phone } = req.params;
    const { name, language, bodyParams } = req.body;
    if (!name || !language) {
      return res.status(400).json({ success: false, message: "Template name and language are required" });
    }

    const conversation = await WhatsappConversation.findOne({ phone });
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }
    if (!conversation.isBotPaused) {
      conversation.isBotPaused = true;
      await conversation.save();
    }

    await whatsappService.sendTemplate(phone, name, language, Array.isArray(bodyParams) ? bodyParams : []);
    return res.status(200).json({ success: true, message: "Template sent" });
  } catch (error) {
    console.error("Send WhatsApp template error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to send template" });
  }
};
