const Product = require("../../models/product");
const User = require("../../models/user");
const Order = require("../../models/order");
const WhatsappOrder = require("../../models/whatsappOrder");
const whatsappService = require("../../services/whatsappService");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// WhatsApp sends numbers as full international format with no "+", e.g.
// "919981396588" — the rest of this codebase stores/matches on the plain
// 10-digit Indian number, same normalization used for Firebase phone auth.
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

const parseAddressText = (text, phone) => {
  const pincodeMatch = text.match(/\b(\d{6})\b/);
  if (!pincodeMatch) return null;

  const withoutPincode = text.replace(pincodeMatch[0], " ");
  const parts = withoutPincode
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    addressLine: text,
    city: parts.length >= 3 ? parts[parts.length - 2] : "Not Available",
    state: parts.length >= 2 ? parts[parts.length - 1] : "Not Available",
    pinCode: pincodeMatch[1],
    phone
  };
};

// ─── GET: Meta's webhook verification handshake ────────────────────────────
exports.verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

// ─── POST: Incoming messages, button replies, and cart/order submissions ──
exports.receiveWebhook = async (req, res) => {
  // Always 200 immediately — Meta retries aggressively on non-200s, and any
  // real error here shouldn't turn into a storm of redelivered webhooks.
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return; // status updates (sent/delivered/read) etc. — ignore

    const from = message.from; // wa_id, e.g. "919981396588"

    if (message.type === "order") {
      await handleCartOrder(from, message.order);
      return;
    }

    if (message.type === "interactive") {
      const replyId = message.interactive?.button_reply?.id;
      if (replyId === "browse_catalog") {
        await whatsappService.sendCatalogPrompt(from, "Browse our products and add what you'd like to your cart:");
      }
      return;
    }

    if (message.type === "text") {
      const text = message.text?.body?.trim() || "";

      // If this customer has a cart waiting on an address, treat this text
      // as that address rather than as a fresh "show menu" message.
      const awaiting = await WhatsappOrder.findOne({
        whatsappPhone: from,
        status: "awaiting_address"
      }).sort({ createdAt: -1 });

      if (awaiting) {
        await handleAddressReply(awaiting, text);
        return;
      }

      // Plain text — treat anything else as "show the menu"
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
      status: "awaiting_address" // set to pending right after link creation below
    });
    await createPaymentLinkAndNotify(whatsappOrder, summary);
    return;
  }

  await WhatsappOrder.create({
    whatsappPhone: from,
    items: resolvedItems,
    subtotal,
    user: user._id,
    status: "awaiting_address"
  });

  await whatsappService.sendText(
    from,
    `Your order:\n\n${summary}\n\nTotal: ₹${subtotal}\n\n` +
      `Please reply with your full delivery address (including 6-digit pincode) to continue.`
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
  const { addressLine, city, state, pinCode, phone } = lastOrder.shippingAddress;
  return { addressLine, city, state, pinCode, phone };
};

// Customer replied with their address text while a cart was awaiting one.
const handleAddressReply = async (whatsappOrder, text) => {
  const shippingAddress = parseAddressText(text, normalizeWaPhone(whatsappOrder.whatsappPhone));
  if (!shippingAddress) {
    await whatsappService.sendText(
      whatsappOrder.whatsappPhone,
      "I couldn't find a 6-digit pincode in that — please resend your full address including the pincode."
    );
    return;
  }

  whatsappOrder.shippingAddress = shippingAddress;
  await whatsappOrder.save();

  await createPaymentLinkAndNotify(whatsappOrder);
};

// Creates the Razorpay payment link for a cart that now has an address, and
// messages it back to the customer.
const createPaymentLinkAndNotify = async (whatsappOrder, summaryOverride) => {
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

  const summary = summaryOverride || (await buildSummaryFromItems(whatsappOrder.items));

  await whatsappService.sendPaymentLink(
    whatsappOrder.whatsappPhone,
    summary,
    whatsappOrder.subtotal,
    paymentLink.short_url
  );
};

const buildSummaryFromItems = async (items) => {
  const productIds = items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds } }).select("name").lean();
  const nameMap = new Map(products.map((p) => [p._id.toString(), p.name]));
  return items
    .map((i) => `${i.quantity} x ${nameMap.get(i.product.toString()) || "Item"} — ₹${i.price * i.quantity}`)
    .join("\n");
};

// ─── Called from the Razorpay payment_link.paid webhook ───────────────────
// Turns a paid WhatsApp cart into a real Order, same as any other checkout.
exports.handleWhatsappPaymentLinkPaid = async (paymentLinkEntity, paymentEntity) => {
  try {
    const whatsappOrder = await WhatsappOrder.findOne({ razorpayPaymentLinkId: paymentLinkEntity.id });
    if (!whatsappOrder || whatsappOrder.status === "paid") return;

    let userId = whatsappOrder.user;
    if (!userId) {
      const user = await getOrCreateWhatsappUser(whatsappOrder.whatsappPhone);
      userId = user?._id;
      whatsappOrder.user = userId;
      await whatsappOrder.save();
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
      paymentMethod: "online",
      paymentStatus: "paid",
      razorpayPaymentId: paymentEntity?.id,
      status: "confirmed"
    });
    await order.save();

    whatsappOrder.status = "paid";
    whatsappOrder.order = order._id;
    await whatsappOrder.save();

    try {
      const { notifyDriversForOrder, notifySellersForOrder } = require("../order/order");
      if (typeof notifyDriversForOrder === "function") {
        await notifyDriversForOrder(order, userId);
      }
      if (typeof notifySellersForOrder === "function") {
        await notifySellersForOrder(order);
      }
    } catch (_) {}

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
      .select("name description price images stockStatus category")
      .lean();

    const header = ["id", "title", "description", "availability", "condition", "price", "link", "image_link"];
    const rows = products.map((p) => {
      const image = p.images?.[0]?.url || "";
      const link = `https://www.gmkart.com/product/${p._id}`;
      const availability = p.stockStatus === "in-stock" ? "in stock" : "out of stock";
      const description = (p.description || p.name || "").replace(/[\r\n\t]/g, " ").slice(0, 500);
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
