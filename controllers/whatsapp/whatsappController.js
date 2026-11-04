const Product = require("../../models/product");
const User = require("../../models/user");
const Order = require("../../models/order");
const WhatsappOrder = require("../../models/whatsappOrder");
const whatsappService = require("../../services/whatsappService");
const { findOrCreateConversation, recordMessage, recordStatusUpdate } = require("../../services/whatsappConversationService");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const normalizeWaPhone = (waId) => {
  const digits = String(waId || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return digits;
};

const getOrCreateWhatsappUser = async (waId) => {
  const phone = normalizeWaPhone(waId);
  if (!phone) return null;

  return User.findOneAndUpdate(
    { phone },
    {
      $setOnInsert: {
        phone,
        name: "WhatsApp Customer",
        role: "user",
        isVerified: true
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).select("_id");
};

// Collects the delivery address one field at a time instead of trying to
// parse a single free-text message — customers format addresses too
// inconsistently for that to reliably produce a valid city/state/pincode.
const ADDRESS_STEPS = [
  {
    status: "awaiting_name",
    field: "name",
    question: "What's your full name?",
    validate: (text) => (text.trim().length >= 2 ? null : "Please share your full name.")
  },
  {
    status: "awaiting_address_line",
    field: "addressLine",
    question: "Please share your full address (house/flat no., street, locality):",
    validate: (text) => (text.trim().length >= 5 ? null : "Please share a more complete address.")
  },
  {
    status: "awaiting_city",
    field: "city",
    question: "Which city?",
    validate: (text) => (text.trim().length >= 2 ? null : "Please enter a valid city name.")
  },
  {
    status: "awaiting_state",
    field: "state",
    question: "Which state?",
    validate: (text) => (text.trim().length >= 2 ? null : "Please enter a valid state name.")
  },
  {
    status: "awaiting_pincode",
    field: "pinCode",
    question: "What's your 6-digit delivery pincode?",
    validate: (text) => (/^\d{6}$/.test(text.trim()) ? null : "That doesn't look like a valid 6-digit pincode — please try again.")
  }
];
const ADDRESS_STEP_STATUSES = ADDRESS_STEPS.map((s) => s.status);

const formatAddress = (address) =>
  `${address.name}\n${address.addressLine}, ${address.city}, ${address.state} - ${address.pinCode}`;

exports.verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

// Best-effort preview text for the admin inbox, per inbound message type.
const previewForInbound = (message) => {
  if (message.type === "order") return `🛒 Sent an order (${message.order?.product_items?.length || 0} items)`;
  if (message.type === "interactive") return message.interactive?.button_reply?.title || "Tapped a button";
  if (message.type === "text") return message.text?.body || "";
  return `[${message.type}]`;
};

exports.receiveWebhook = async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Delivery receipts for messages we sent (sent/delivered/read/failed) —
    // this is the only way to catch a template that Meta "accepted" at send
    // time but never actually delivered (e.g. the recipient hasn't opted in).
    for (const statusUpdate of value?.statuses || []) {
      const errorMessage = statusUpdate.errors?.[0]?.title || statusUpdate.errors?.[0]?.message;
      await recordStatusUpdate(statusUpdate.id, statusUpdate.status, errorMessage);
      if (statusUpdate.status === "failed") {
        console.error(`WhatsApp delivery failed for ${statusUpdate.recipient_id}: ${errorMessage}`);
      }
    }

    const message = value?.messages?.[0];
    if (!message) return;
    const from = message.from;
    const profileName = value?.contacts?.[0]?.profile?.name;

    const conversation = await findOrCreateConversation(from, profileName);
    await recordMessage(conversation, {
      direction: "in",
      sentBy: "customer",
      body: previewForInbound(message),
      type: message.type
    });

    // An admin has taken this conversation over manually — the bot stays
    // quiet here until they hand it back, so replies don't collide.
    if (conversation.isBotPaused) return;

    if (message.type === "order") {
      await handleCartOrder(from, message.order);
      return;
    }

    if (message.type === "interactive") {
      const replyId = message.interactive?.button_reply?.id;
      if (replyId === "browse_catalog") {
        await whatsappService.sendCatalogPrompt(from, "Browse our products and add what you'd like to your cart:");
      } else if (replyId === "pay_online" || replyId === "pay_cod") {
        const whatsappOrder = await WhatsappOrder.findOne({
          whatsappPhone: from,
          status: "awaiting_payment_method"
        }).sort({ createdAt: -1 });
        if (whatsappOrder) {
          if (replyId === "pay_online") {
            await createPaymentLinkAndNotify(whatsappOrder);
          } else {
            await confirmCodOrder(whatsappOrder);
          }
        }
      }
      return;
    }

    if (message.type === "text") {
      const text = message.text?.body?.trim() || "";

      const awaiting = await WhatsappOrder.findOne({
        whatsappPhone: from,
        status: { $in: ADDRESS_STEP_STATUSES }
      }).sort({ createdAt: -1 });

      if (awaiting) {
        await handleAddressStepReply(awaiting, text);
        return;
      }

      await whatsappService.sendButtons(
        from,
        "Welcome to GMKart! 🛒 Tap below to browse products.",
        [{ id: "browse_catalog", title: "View Catalog" }]
      );
    }
  } catch (error) {
    console.error("WhatsApp webhook processing error:", error.message);
  }
};

// Customer submitted their WhatsApp cart — build it against real DB prices
// (never trust the price WhatsApp echoes back). If we already know a delivery
// address for them, go straight to a payment link; otherwise ask for one first.
const handleCartOrder = async (from, order) => {
  const items = order?.product_items || [];
  if (!items.length) {
    await whatsappService.sendText(from, "Your cart looks empty — please add a product and try again.");
    return;
  }

  const productIds = items.map((i) => i.product_retailer_id);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true }).select("name price stockStatus");
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const resolvedItems = [];
  const summaryLines = [];
  let subtotal = 0;
  const unavailable = [];

  for (const item of items) {
    const product = productMap.get(item.product_retailer_id);
    if (!product || product.stockStatus === "out-of-stock") {
      unavailable.push(item.product_retailer_id);
      continue;
    }
    const quantity = Number(item.quantity) || 1;
    const lineTotal = product.price * quantity;
    subtotal += lineTotal;
    resolvedItems.push({ product: product._id, quantity, price: product.price });
    summaryLines.push(`${quantity} x ${product.name} — ₹${lineTotal}`);
  }

  if (!resolvedItems.length) {
    await whatsappService.sendText(from, "Sorry, none of those items are available right now.");
    return;
  }

  if (unavailable.length) {
    summaryLines.push(`\n(${unavailable.length} item(s) removed — out of stock)`);
  }

  const user = await getOrCreateWhatsappUser(from);
  const summary = summaryLines.join("\n");

  const knownAddress = await getMostRecentAddress(user._id);

  if (knownAddress) {
    const whatsappOrder = await WhatsappOrder.create({
      whatsappPhone: from,
      items: resolvedItems,
      subtotal,
      shippingAddress: knownAddress,
      user: user._id,
      status: "awaiting_payment_method"
    });
    await promptPaymentMethod(whatsappOrder, summary, subtotal);
    return;
  }

  await WhatsappOrder.create({
    whatsappPhone: from,
    items: resolvedItems,
    subtotal,
    user: user._id,
    status: ADDRESS_STEPS[0].status
  });

  await whatsappService.sendText(
    from,
    `Your order:\n\n${summary}\n\nTotal: ₹${subtotal}\n\n` +
      `Let's get your delivery address.\n\n${ADDRESS_STEPS[0].question}`
  );
};

// Asks whether to pay online (Razorpay link) or cash on delivery before
// actually placing/charging the order. Shows the resolved delivery address
// back to the customer so they can catch a mistake before paying.
const promptPaymentMethod = async (whatsappOrder, summary, subtotal) => {
  await whatsappService.sendButtons(
    whatsappOrder.whatsappPhone,
    `Delivering to:\n${formatAddress(whatsappOrder.shippingAddress)}\n\n` +
      `Your order:\n\n${summary}\n\nTotal: ₹${subtotal}\n\nHow would you like to pay?`,
    [
      { id: "pay_online", title: "Pay Online" },
      { id: "pay_cod", title: "Cash on Delivery" }
    ]
  );
};

// Reuses the address from this user's most recent order — most WhatsApp
// shoppers will already be existing app/web customers.
const getMostRecentAddress = async (userId) => {
  const lastOrder = await Order.findOne({ user: userId, "shippingAddress.pinCode": { $exists: true } })
    .sort({ createdAt: -1 })
    .select("shippingAddress")
    .lean();
  if (!lastOrder?.shippingAddress?.pinCode) return null;
  const { name, addressLine, city, state, pinCode, phone } = lastOrder.shippingAddress;
  return { name, addressLine, city, state, pinCode, phone };
};

// Customer replied while an address field was awaiting an answer — validates
// it, saves it, and either asks the next question or (once all fields are in)
// moves on to the payment-method prompt.
const handleAddressStepReply = async (whatsappOrder, text) => {
  const stepIndex = ADDRESS_STEPS.findIndex((s) => s.status === whatsappOrder.status);
  const step = ADDRESS_STEPS[stepIndex];

  const validationError = step.validate(text);
  if (validationError) {
    await whatsappService.sendText(whatsappOrder.whatsappPhone, validationError);
    return;
  }

  whatsappOrder.shippingAddress = whatsappOrder.shippingAddress || {};
  whatsappOrder.shippingAddress[step.field] = text.trim();
  whatsappOrder.shippingAddress.phone = normalizeWaPhone(whatsappOrder.whatsappPhone);

  const nextStep = ADDRESS_STEPS[stepIndex + 1];
  if (nextStep) {
    whatsappOrder.status = nextStep.status;
    await whatsappOrder.save();
    await whatsappService.sendText(whatsappOrder.whatsappPhone, nextStep.question);
    return;
  }

  whatsappOrder.status = "awaiting_payment_method";
  await whatsappOrder.save();

  const summary = await buildSummaryFromItems(whatsappOrder.items);
  await promptPaymentMethod(whatsappOrder, summary, whatsappOrder.subtotal);
};

const createPaymentLinkAndNotify = async (whatsappOrder) => {
  const phone = normalizeWaPhone(whatsappOrder.whatsappPhone);

  const paymentLink = await razorpay.paymentLink.create({
    amount: Math.round(whatsappOrder.subtotal * 100), // paise
    currency: "INR",
    description: `GMKart order via WhatsApp (${whatsappOrder.items.length} item(s))`,
    customer: { contact: `+91${phone}` },
    notify: { sms: false, email: false },
    notes: { source: "whatsapp", whatsappOrderId: whatsappOrder._id.toString() }
  });

  whatsappOrder.razorpayPaymentLinkId = paymentLink.id;
  whatsappOrder.paymentLinkUrl = paymentLink.short_url;
  whatsappOrder.status = "pending";
  await whatsappOrder.save();

  const summary = await buildSummaryFromItems(whatsappOrder.items);

  await whatsappService.sendPaymentLink(
    whatsappOrder.whatsappPhone,
    summary,
    whatsappOrder.subtotal,
    paymentLink.short_url
  );
};

// Places the order immediately against the real Order collection, same as
// the paid-webhook path below, but with no payment taken yet.
const confirmCodOrder = async (whatsappOrder) => {
  try {
    const order = await createOrderForWhatsapp(whatsappOrder, {
      paymentMethod: "cod",
      paymentStatus: "pending"
    });

    whatsappOrder.status = "cod_confirmed";
    whatsappOrder.order = order._id;
    await whatsappOrder.save();

    await whatsappService.sendText(
      whatsappOrder.whatsappPhone,
      `Order confirmed! ✅ Your order #${order.orderId} will be delivered — pay cash on delivery.`
    );
  } catch (error) {
    console.error("confirmCodOrder error:", error.message);
  }
};

const buildSummaryFromItems = async (items) => {
  const productIds = items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds } }).select("name").lean();
  const nameMap = new Map(products.map((p) => [p._id.toString(), p.name]));
  return items
    .map((i) => `${i.quantity} x ${nameMap.get(i.product.toString()) || "Item"} — ₹${i.price * i.quantity}`)
    .join("\n");
};

// Shared by the COD and paid-online paths below — builds and saves the real
// Order from a WhatsappOrder, and fires the usual driver/seller notifications.
const createOrderForWhatsapp = async (whatsappOrder, { paymentMethod, paymentStatus, razorpayPaymentId }) => {
  let userId = whatsappOrder.user;
  if (!userId) {
    const user = await getOrCreateWhatsappUser(whatsappOrder.whatsappPhone);
    userId = user?._id;
    whatsappOrder.user = userId;
  }
  if (!userId) throw new Error(`No user available for WhatsApp order ${whatsappOrder._id}`);

  const primarySellerProduct = await Product.findById(whatsappOrder.items[0].product).select("seller");

  const order = new Order({
    user: userId,
    seller: primarySellerProduct?.seller,
    items: whatsappOrder.items,
    subtotal: whatsappOrder.subtotal,
    total: whatsappOrder.subtotal,
    finalAmount: whatsappOrder.subtotal,
    deliveryCharges: 0,
    handlingCharge: 0,
    totalGst: 0,
    shippingAddress: whatsappOrder.shippingAddress,
    paymentMethod,
    paymentStatus,
    ...(razorpayPaymentId && { razorpayPaymentId }),
    status: paymentStatus === "paid" ? "confirmed" : "pending"
  });
  await order.save();

  try {
    const { notifyDriversForOrder, notifySellersForOrder } = require("../order/order");
    if (typeof notifyDriversForOrder === "function") {
      await notifyDriversForOrder(order, userId);
    }
    if (typeof notifySellersForOrder === "function") {
      await notifySellersForOrder(order);
    }
  } catch (_) {}

  return order;
};

// ─── Called from the Razorpay payment_link.paid webhook ───────────────────
// Turns a paid WhatsApp cart into a real Order, same as any other checkout.
exports.handleWhatsappPaymentLinkPaid = async (paymentLinkEntity, paymentEntity) => {
  try {
    const whatsappOrder = await WhatsappOrder.findOne({ razorpayPaymentLinkId: paymentLinkEntity.id });
    if (!whatsappOrder || whatsappOrder.status === "paid") return;

    const order = await createOrderForWhatsapp(whatsappOrder, {
      paymentMethod: "online",
      paymentStatus: "paid",
      razorpayPaymentId: paymentEntity?.id
    });

    whatsappOrder.status = "paid";
    whatsappOrder.order = order._id;
    await whatsappOrder.save();

    await whatsappService.sendText(
      whatsappOrder.whatsappPhone,
      `Payment received! ✅ Your order #${order.orderId} has been placed and is being prepared.`
    );
  } catch (error) {
    console.error("handleWhatsappPaymentLinkPaid error:", error.message);
  }
};

// ─── GET: Product feed Meta polls to keep the Commerce Catalog in sync ─────
// No manual re-upload needed — this mirrors the live Product collection.
exports.catalogFeed = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .select("name slug description price images stockStatus category")
      .lean();

    const header = ["id", "title", "description", "availability", "condition", "price", "link", "image_link"];
    const rows = products.map((p) => {
      const image = p.images?.[0]?.url || "";
      const link = `https://www.gmkart.com/product/${Product.slugifyProductName(p.name) || p.slug || p._id}`;
      const availability = p.stockStatus === "in-stock" ? "in stock" : "out of stock";
      const description = (p.description || p.name || "")
        .replace(/<[^>]*>/g, " ") // strip HTML tags — Meta's catalog shows raw text, not markup
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
      return [
        p._id.toString(),
        (p.name || "").replace(/\t/g, " "),
        description,
        availability,
        "new",
        `${p.price} INR`,
        link,
        image
      ].join("\t");
    });

    res.setHeader("Content-Type", "text/tab-separated-values");
    res.send([header.join("\t"), ...rows].join("\n"));
  } catch (error) {
    console.error("Catalog feed error:", error.message);
    res.status(500).send("");
  }
};

exports.normalizeWaPhone = normalizeWaPhone;
