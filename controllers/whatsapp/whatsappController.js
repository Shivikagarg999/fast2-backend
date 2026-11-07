const Product = require("../../models/product");
const User = require("../../models/user");
const Order = require("../../models/order");
const WhatsappOrder = require("../../models/whatsappOrder");
const whatsappService = require("../../services/whatsappService");
const { findOrCreateConversation, recordMessage, recordStatusUpdate } = require("../../services/whatsappConversationService");
const { calculateOrderPricing } = require("../../utils/orderPricing");
const { getActiveDiscounts, getEffectivePrice } = require("../../utils/discountHelper");
const { resolvePincode } = require("../../utils/mapbox");
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

const ADDRESS_PROMPT =
  "Please share your delivery address, one line each:\n\n" +
  "Name\nAddress (house/flat no., street, locality)\nCity\nState\nPincode\n\n" +
  "Example:\nRahul Sharma\n12 MG Road, Sector 4\nGwalior\nMadhya Pradesh\n474001";

// Expects the 5-line format from ADDRESS_PROMPT above. Accepts commas as line
// breaks too, since customers don't always send literal newlines on mobile.
const parseFullAddress = (text) => {
  const parts = text
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 5) return null;

  const pinCode = parts[parts.length - 1];
  if (!/^\d{6}$/.test(pinCode)) return null;

  const state = parts[parts.length - 2];
  const city = parts[parts.length - 3];
  const name = parts[0];
  const addressLine = parts.slice(1, parts.length - 3).join(", ");
  if (!addressLine || !city || !state) return null;

  return { name, addressLine, city, state, pinCode };
};

const formatAddress = (address) =>
  `${address.name}\n${address.addressLine}, ${address.city}, ${address.state} - ${address.pinCode}`;

const formatMoney = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(n) ? `${n}` : n.toFixed(2);
};

// Item lines the way the app cart shows them — selling price, with the MRP
// struck through (WhatsApp ~strike~) when the product is sold below it.
// Returns the MRP total too so the bill can show the product discount.
const buildItemLines = async (items) => {
  const products = await Product.find({ _id: { $in: items.map((i) => i.product) } })
    .select("name price oldPrice")
    .lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  let totalMRP = 0;
  const lines = items.map((i) => {
    const product = productMap.get(i.product.toString());
    const mrp = Math.max(Number(product?.oldPrice) || 0, Number(product?.price) || 0, i.price);
    totalMRP += mrp * i.quantity;
    const lineTotal = i.price * i.quantity;
    const mrpLine = mrp * i.quantity;
    const strike = mrpLine > lineTotal ? ` ~₹${formatMoney(mrpLine)}~` : "";
    return `${i.quantity} x ${product?.name || "Item"} — ₹${formatMoney(lineTotal)}${strike}`;
  });

  return { text: lines.join("\n"), totalMRP };
};

// Same breakdown as the app cart / invoice: MRP → product discount → item
// total → delivery (FREE when waived) → handling → GST → coupon → to pay,
// then a "You saved" line totalling every discount on the order.
const buildBillingText = (order, totalMRP = order.subtotal) => {
  const {
    subtotal, deliveryCharges, handlingCharge, totalGst,
    couponCode, couponDiscount, couponBenefitType, couponAppliedItems, finalAmount
  } = order;
  const productDiscount = Math.max(0, totalMRP - subtotal);

  const lines = ["*Bill Details*"];
  if (productDiscount > 0) {
    lines.push(`MRP Total: ₹${formatMoney(totalMRP)}`);
    lines.push(`Product Discount: -₹${formatMoney(productDiscount)}`);
  }
  lines.push(`Item Total: ₹${formatMoney(subtotal)}`);
  lines.push(`Delivery: ${deliveryCharges > 0 ? `₹${formatMoney(deliveryCharges)}` : "FREE"}`);
  if (handlingCharge > 0) lines.push(`Handling: ₹${formatMoney(handlingCharge)}`);
  if (totalGst > 0) lines.push(`GST: ₹${formatMoney(totalGst)}`);

  if (couponCode) {
    if (couponBenefitType === "free_quantity" && couponAppliedItems?.length) {
      // Freebie coupons add extra quantity instead of reducing the price.
      const freebies = couponAppliedItems.map((i) => `${i.benefitLabel} (${i.name})`).join(", ");
      lines.push(`Coupon (${couponCode}): ${freebies}`);
    } else if (couponDiscount > 0) {
      lines.push(`Coupon (${couponCode}): -₹${formatMoney(couponDiscount)}`);
    }
  }

  lines.push(`*To Pay: ₹${formatMoney(finalAmount)}*`);

  const totalSaved = productDiscount + (couponDiscount || 0);
  if (totalSaved > 0) lines.push(`You saved ₹${formatMoney(totalSaved)} on this order 🎉`);
  return lines.join("\n");
};

// Items + full bill, used for every message that shows the customer their bill.
const buildFullBill = async (order) => {
  const { text, totalMRP } = await buildItemLines(order.items);
  return `${text}\n\n${buildBillingText(order, totalMRP)}`;
};

// Mirrors the web/app checkout's per-product serviceablePincodes check —
// an empty list on a product means it ships everywhere.
const checkServiceability = async (items, pinCode) => {
  const productIds = items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds } }).select("name serviceablePincodes").lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const nonServiceableNames = [];
  for (const item of items) {
    const product = productMap.get(item.product.toString());
    if (!product) continue;
    if (product.serviceablePincodes?.length && !product.serviceablePincodes.includes(pinCode)) {
      nonServiceableNames.push(product.name);
    }
  }

  return { serviceable: nonServiceableNames.length === 0, nonServiceableNames };
};

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
  if (message.type === "button") return message.button?.text || "Tapped a template button";
  if (message.type === "text") return message.text?.body || "";
  return `[${message.type}]`;
};

// Case-insensitive match so we're not relying on a Meta-generated payload
// string we don't control — just what the button is labelled.
const isCatalogButtonText = (text) => /view\s*catalog/i.test(text || "");
const isApplyCouponButtonText = (text) => /apply\s*coupon/i.test(text || "");

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
      } else if (replyId === "apply_coupon") {
        await promptForCoupon(from);
      }
      return;
    }

    // Quick-reply buttons tapped from a message *template* (as opposed to one
    // of our own interactive messages) arrive as this separate type.
    if (message.type === "button") {
      if (isCatalogButtonText(message.button?.text)) {
        await whatsappService.sendCatalogPrompt(from, "Browse our products and add what you'd like to your cart:");
      } else if (isApplyCouponButtonText(message.button?.text)) {
        await promptForCoupon(from);
      }
      return;
    }

    if (message.type === "text") {
      const text = message.text?.body?.trim() || "";

      const awaiting = await WhatsappOrder.findOne({
        whatsappPhone: from,
        status: { $in: ["awaiting_address", "awaiting_coupon"] }
      }).sort({ createdAt: -1 });

      if (awaiting?.status === "awaiting_address") {
        await handleAddressReply(awaiting, text);
        return;
      }
      if (awaiting?.status === "awaiting_coupon") {
        await handleCouponReply(awaiting, text);
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
  const products = await Product.find({ _id: { $in: productIds }, isActive: true })
    .populate("seller")
    .populate("shop")
    .populate("category");
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const resolvedItems = [];
  const unavailable = [];
  // Same price the app cart would charge — active admin discount campaigns applied.
  const discounts = await getActiveDiscounts();

  for (const item of items) {
    const product = productMap.get(item.product_retailer_id);
    if (!product || product.stockStatus === "out-of-stock") {
      unavailable.push(item.product_retailer_id);
      continue;
    }
    const quantity = Number(item.quantity) || 1;
    const { effectivePrice } = getEffectivePrice(product, discounts);
    resolvedItems.push({ product: product._id, quantity, price: effectivePrice });
  }

  if (!resolvedItems.length) {
    await whatsappService.sendText(from, "Sorry, none of those items are available right now.");
    return;
  }

  const { text: itemLines, totalMRP } = await buildItemLines(resolvedItems);
  const summary = unavailable.length
    ? `${itemLines}\n\n(${unavailable.length} item(s) removed — out of stock)`
    : itemLines;

  const user = await getOrCreateWhatsappUser(from);
  const subtotal = resolvedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Delivery charge depends on the customer's location, which we only get
  // once they've shared their pincode — final billing (delivery/handling/GST)
  // is calculated in handleAddressReply once that's in.
  await WhatsappOrder.create({
    whatsappPhone: from,
    items: resolvedItems,
    subtotal,
    user: user._id,
    status: "awaiting_address"
  });

  await whatsappService.sendText(
    from,
    `Your order:\n\n${summary}\n\n` +
      (totalMRP > subtotal ? `MRP Total: ₹${formatMoney(totalMRP)}\nProduct Discount: -₹${formatMoney(totalMRP - subtotal)}\n` : "") +
      `Item Total: ₹${formatMoney(subtotal)}\n(delivery, handling and GST added after your address)\n\n${ADDRESS_PROMPT}`
  );
};

// Asks whether to pay online (Razorpay link) or cash on delivery before
// actually placing/charging the order. Shows the resolved delivery address
// back to the customer so they can catch a mistake before paying.
const promptPaymentMethod = async (whatsappOrder) => {
  const buttons = [
    { id: "pay_online", title: "Pay Online" },
    { id: "pay_cod", title: "Cash on Delivery" }
  ];
  if (!whatsappOrder.couponCode) buttons.push({ id: "apply_coupon", title: "Apply Coupon" });

  await whatsappService.sendButtons(
    whatsappOrder.whatsappPhone,
    `Delivering to:\n${formatAddress(whatsappOrder.shippingAddress)}\n\n` +
      `Your order:\n\n${await buildFullBill(whatsappOrder)}\n\nHow would you like to pay?`,
    buttons
  );
};

// Triggered either from the "Apply Coupon" button at the payment-method stage,
// or from a marketing template's own "Apply Coupon" quick-reply button.
const promptForCoupon = async (from) => {
  const whatsappOrder = await WhatsappOrder.findOne({
    whatsappPhone: from,
    status: "awaiting_payment_method"
  }).sort({ createdAt: -1 });

  if (!whatsappOrder) {
    await whatsappService.sendButtons(
      from,
      "Add some products to your cart first, then I'll help you apply a coupon!",
      [{ id: "browse_catalog", title: "View Catalog" }]
    );
    return;
  }

  whatsappOrder.status = "awaiting_coupon";
  await whatsappOrder.save();
  await whatsappService.sendText(from, "Please reply with your coupon code:");
};

// Customer replied with a coupon code while an order was awaiting one —
// re-runs the same pricing math with the coupon included, same validation
// (expiry, per-user limit, min order amount, product scope) as web/app
// checkout. On any failure, falls back to showing payment options without it
// rather than leaving the customer stuck.
const handleCouponReply = async (whatsappOrder, text) => {
  const products = await Product.find({ _id: { $in: whatsappOrder.items.map((i) => i.product) } })
    .populate("seller")
    .populate("shop")
    .populate("category");

  try {
    const pricing = await calculateOrderPricing({
      items: whatsappOrder.items,
      products,
      coupon: { code: text.trim() },
      paymentMethod: "cod",
      userId: whatsappOrder.user,
      customerLat: whatsappOrder.shippingAddress?.lat,
      customerLng: whatsappOrder.shippingAddress?.lng
    });

    whatsappOrder.subtotal = pricing.subtotal;
    whatsappOrder.deliveryCharges = pricing.deliveryCharges;
    whatsappOrder.handlingCharge = pricing.handlingCharge;
    whatsappOrder.totalGst = pricing.totalGst;
    whatsappOrder.total = pricing.total;
    whatsappOrder.finalAmount = pricing.finalAmount;
    whatsappOrder.couponCode = pricing.appliedCoupon?.code || null;
    whatsappOrder.couponDiscount = pricing.discount || 0;
    whatsappOrder.couponBenefitType = pricing.appliedCoupon?.benefitType || null;
    whatsappOrder.couponAppliedItems = pricing.appliedCoupon?.appliedItems || [];
    whatsappOrder.couponFreebieRule = pricing.appliedCoupon?.freebieRule || null;
    whatsappOrder.status = "awaiting_payment_method";
    await whatsappOrder.save();

    await whatsappService.sendText(whatsappOrder.whatsappPhone, `Coupon ${whatsappOrder.couponCode} applied! 🎉`);
  } catch (error) {
    whatsappOrder.status = "awaiting_payment_method";
    await whatsappOrder.save();
    await whatsappService.sendText(whatsappOrder.whatsappPhone, error.message || "That coupon couldn't be applied.");
  }

  await promptPaymentMethod(whatsappOrder);
};

// Customer replied with their full address in one message — parses it,
// checks delivery serviceability for the pincode, and either rejects the
// order or moves on to the payment-method prompt.
const handleAddressReply = async (whatsappOrder, text) => {
  const shippingAddress = parseFullAddress(text);
  if (!shippingAddress) {
    await whatsappService.sendText(
      whatsappOrder.whatsappPhone,
      `I couldn't read that address — please resend it in this exact format:\n\n${ADDRESS_PROMPT}`
    );
    return;
  }
  shippingAddress.phone = normalizeWaPhone(whatsappOrder.whatsappPhone);

  const { serviceable, nonServiceableNames } = await checkServiceability(whatsappOrder.items, shippingAddress.pinCode);
  if (!serviceable) {
    whatsappOrder.shippingAddress = shippingAddress;
    whatsappOrder.status = "undeliverable";
    await whatsappOrder.save();
    await whatsappService.sendText(
      whatsappOrder.whatsappPhone,
      `Sorry, we don't deliver to pincode ${shippingAddress.pinCode} yet for: ${nonServiceableNames.join(", ")}.\n\n` +
        `This order has been cancelled — feel free to browse the catalog again for items we can deliver to you.`
    );
    return;
  }

  // Resolve the pincode to coordinates (not the free-text address — place
  // names repeat across states, a pincode doesn't) so delivery charge uses
  // the real distance-based slabs instead of falling back to a flat rate.
  const coords = await resolvePincode(shippingAddress.pinCode);
  if (coords) {
    shippingAddress.lat = coords.lat;
    shippingAddress.lng = coords.lng;
  }

  whatsappOrder.shippingAddress = shippingAddress;

  const products = await Product.find({ _id: { $in: whatsappOrder.items.map((i) => i.product) } })
    .populate("seller")
    .populate("shop")
    .populate("category");

  const pricing = await calculateOrderPricing({
    items: whatsappOrder.items,
    products,
    paymentMethod: "cod",
    userId: whatsappOrder.user,
    customerLat: coords?.lat,
    customerLng: coords?.lng
  });

  whatsappOrder.subtotal = pricing.subtotal;
  whatsappOrder.deliveryCharges = pricing.deliveryCharges;
  whatsappOrder.handlingCharge = pricing.handlingCharge;
  whatsappOrder.totalGst = pricing.totalGst;
  whatsappOrder.total = pricing.total;
  whatsappOrder.finalAmount = pricing.finalAmount;
  whatsappOrder.status = "awaiting_payment_method";
  await whatsappOrder.save();

  await promptPaymentMethod(whatsappOrder);
};

const createPaymentLinkAndNotify = async (whatsappOrder) => {
  const phone = normalizeWaPhone(whatsappOrder.whatsappPhone);

  const paymentLink = await razorpay.paymentLink.create({
    amount: Math.round(whatsappOrder.finalAmount * 100), // paise
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

  await whatsappService.sendPaymentLink(
    whatsappOrder.whatsappPhone,
    await buildFullBill(whatsappOrder),
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
      `Order confirmed! ✅ Your order #${order.orderId} will be delivered — pay cash on delivery.\n\n` +
        `${await buildFullBill(whatsappOrder)}`
    );
  } catch (error) {
    console.error("confirmCodOrder error:", error.message);
  }
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
    total: whatsappOrder.total,
    finalAmount: whatsappOrder.finalAmount,
    deliveryCharges: whatsappOrder.deliveryCharges,
    handlingCharge: whatsappOrder.handlingCharge,
    totalGst: whatsappOrder.totalGst,
    shippingAddress: whatsappOrder.shippingAddress,
    paymentMethod,
    paymentStatus,
    ...(razorpayPaymentId && { razorpayPaymentId }),
    ...(whatsappOrder.couponCode && {
      coupon: {
        code: whatsappOrder.couponCode,
        discount: whatsappOrder.couponDiscount,
        benefitType: whatsappOrder.couponBenefitType,
        ...(whatsappOrder.couponFreebieRule && { freebieRule: whatsappOrder.couponFreebieRule }),
        ...(whatsappOrder.couponAppliedItems?.length && { appliedItems: whatsappOrder.couponAppliedItems })
      }
    }),
    status: paymentStatus === "paid" ? "confirmed" : "pending"
  });
  await order.save();

  if (whatsappOrder.couponCode) {
    const Coupon = require("../../models/coupon");
    await Coupon.findOneAndUpdate({ code: whatsappOrder.couponCode }, { $inc: { usedCount: 1 } });
  }

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
      `Payment received! ✅ Your order #${order.orderId} has been placed and is being prepared.\n\n` +
        `${await buildFullBill(whatsappOrder)}`
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
