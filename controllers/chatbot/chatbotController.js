const Product = require('../../models/product');
const Category = require('../../models/category');
const { getActiveDiscounts, getEffectivePrice } = require('../../utils/discountHelper');
const { addItemToCart } = require('../../controllers/cart/cartController');
const { getNearbyShopProductFilter } = require('../../controllers/product/productController');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const MAX_HISTORY = 20;
const MAX_TOOL_ITERATIONS = 4;

const BASE_SYSTEM_PROMPT = `You are Kartie, the friendly shopping assistant for GMKart — a quick grocery and daily essentials delivery platform. Talk like a helpful, upbeat teammate, not a rigid FAQ script. Vary your phrasing, keep most answers to 2-4 sentences, and feel free to ask a quick clarifying question if the user's request is ambiguous.

The facts below are what you actually know about GMKart — use them as your knowledge base, not as a rigid script to recite. You can reason with them: explain benefits, compare GMKart's own strengths against general alternatives, answer "why should I use GMKart" or "what makes GMKart good" type questions confidently using these facts, and hold a normal back-and-forth conversation.

Only fall back to "I don't have that specific information, contact support@gmkart.com or +91 9479467874" for things that genuinely require data you don't have here — a specific user's order/account details, exact pricing or legal/policy specifics not listed below, or comparisons that would require asserting facts about a competitor you don't actually know. Never invent specific facts (prices, dates, policies) that aren't given below. It's fine to speak positively and naturally about GMKart itself without that counting as "making something up."

SHOPPING ASSISTANT — you can help the user find and buy products, not just answer questions:
- When someone wants to buy something, have a short natural conversation to understand what they need: what product/category, roughly how many/what quantity, and their budget if relevant. Don't interrogate them with a checklist — ask only what you're actually missing, one or two things at a time.
- Once you have enough to search (at least a product/category), call the search_products tool. Don't call it on vague chit-chat with no product intent.
- After search_products returns results, briefly describe what you found in your own words (name a few, mention price) — the app will also show the products as cards, so you don't need to list every field.
- If nothing matches, say so plainly and suggest broadening the budget or trying a different term rather than calling the tool repeatedly with the same input.
- Only call add_to_cart when the user has clearly said which specific item they want added (by name, or "the first one", "that one", etc.) and how many. Never guess-add something they only asked about.
- After add_to_cart succeeds, confirm what was added and the new cart total in one short sentence. If it fails (out of stock, not logged in, etc.), explain why in plain language — if the reason is "not logged in", tell them to log in first (there's a login option on the site) and don't claim anything was added.
- You can also call get_cart to check what's already in their cart before adding more, or to answer "what's in my cart" / "what's my total".

ORDERING:
- Browse products by category or by shop on the website.
- Add items to cart, then go to checkout.
- Enter or select a delivery address (delivery availability depends on pincode).
- Choose payment method: Cash on Delivery (COD) or online payment.
- Place the order — you'll get an order confirmation with an Order ID.

TRACKING AN ORDER:
- Go to "My Orders" (under the Account menu).
- Each order shows a live shipment progress panel: Order Placed -> Confirmed -> Accepted -> Picked Up -> Delivered.
- Click an order to see full details, order items, and the order update timeline.
- You can download the invoice (with GST details and a payment QR code) from the order detail page.

WALLET:
- GMKart wallet balance comes from cashback, promotions, or referral bonuses.
- It's automatically applied at checkout to reduce the order total.
- View wallet balance under Account > My Wallet.

REFER & EARN:
- Every user has a referral code, found under Account > Refer & Earn.
- When a new user signs up and applies your referral code, BOTH of you get a wallet bonus.

BECOMING A DELIVERY PARTNER:
- Go to the "Deliver with GMKart" page (/deliver) on the website.
- Click "Start Registration" and fill the form: name, email, phone, password.
- Upload required documents: Aadhaar card (front & back), PAN card, Driving Licence, Vehicle RC, Vehicle Insurance, and a Bank Passbook or Cancelled Cheque photo.
- The application is reviewed by the GMKart team before approval.
- Once approved, delivery partners manage deliveries through the GMKart Partner app.

RETURNS / ISSUES WITH AN ORDER:
- Use the "Need Help" option on the order detail page, or contact support directly.

CONTACT SUPPORT:
- Email: support@gmkart.com
- Phone: +91 9479467874
- Address: Indra Nagar near Sain Devin school, Thatipur, Gwalior, MP 474011

COMPANY INFO:
- GSTIN: 23LQZPK8550M1ZO`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search GMKart\'s product catalog by keyword/category and optional price range. Only returns products from shops that deliver to the user\'s current location, if a location is set.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keyword to match against product name/description, e.g. "milk" or "chips"' },
          category: { type: 'string', description: 'Category name to filter by, e.g. "Dairy" or "Snacks" (optional)' },
          minPrice: { type: 'number', description: 'Minimum price in rupees (optional)' },
          maxPrice: { type: 'number', description: 'Maximum price in rupees, i.e. the user\'s budget (optional)' },
          limit: { type: 'number', description: 'Max results to return, default 6, max 10 (optional)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description: 'Add a specific product (from a previous search_products result) to the logged-in user\'s cart.',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'The product\'s id, exactly as given in a prior search_products result' },
          quantity: { type: 'number', description: 'How many units to add, default 1' }
        },
        required: ['productId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_cart',
      description: 'Get the logged-in user\'s current cart items and total, to answer questions about their cart or before adding more.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

const clampLimit = (limit) => {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return 6;
  return Math.min(Math.floor(n), 10);
};

const toCardProduct = (product, effectivePrice) => ({
  id: String(product._id),
  name: product.name,
  price: Math.round(effectivePrice),
  oldPrice: product.oldPrice > effectivePrice ? product.oldPrice : undefined,
  weight: product.weight,
  weightUnit: product.weightUnit,
  image: product.images?.[0]?.url || null,
  category: product.category?.name || undefined
});

const runSearchProducts = async ({ query, category, minPrice, maxPrice, limit }, { latitude, longitude }) => {
  const filter = { isActive: { $ne: false }, stockStatus: 'in-stock' };

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    try {
      const { productFilter } = await getNearbyShopProductFilter(latitude, longitude);
      Object.assign(filter, productFilter);
    } catch {
      // fall through without a location filter rather than failing the whole search
    }
  }

  if (query && query.trim()) {
    const safe = query.trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(safe, 'i');
    filter.$or = [{ name: regex }, { description: regex }];
  }

  if (category && category.trim()) {
    const categoryDocs = await Category.find({ name: new RegExp(category.trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
      .select('_id').lean();
    if (categoryDocs.length) {
      filter.category = { $in: categoryDocs.map((c) => c._id) };
    }
  }

  const priceFilter = {};
  if (Number.isFinite(Number(minPrice))) priceFilter.$gte = Number(minPrice);
  if (Number.isFinite(Number(maxPrice))) priceFilter.$lte = Number(maxPrice);
  if (Object.keys(priceFilter).length) filter.price = priceFilter;

  const products = await Product.find(filter)
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .limit(clampLimit(limit))
    .lean();

  const discounts = await getActiveDiscounts();
  const cardProducts = products.map((product) => {
    const { effectivePrice } = getEffectivePrice(product, discounts);
    return toCardProduct(product, effectivePrice);
  });

  return {
    count: cardProducts.length,
    locationApplied: Number.isFinite(latitude) && Number.isFinite(longitude),
    products: cardProducts
  };
};

const runAddToCart = async ({ productId, quantity }, { user }) => {
  if (!user) {
    return { error: 'not_logged_in', message: 'The user is not logged in, so nothing was added. Tell them to log in first.' };
  }
  if (!productId) {
    return { error: 'invalid_input', message: 'No productId given.' };
  }
  const qty = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1;

  try {
    const cart = await addItemToCart(user._id, productId, qty);
    const addedItem = cart.items.find((item) => item.product?._id?.toString() === productId || item.product?.toString() === productId);
    const total = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return {
      success: true,
      addedProductName: addedItem?.product?.name || 'the item',
      addedQuantity: qty,
      cartItemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      cartTotal: Math.round(total)
    };
  } catch (error) {
    return { error: 'add_failed', message: error.message || 'Could not add this product to the cart.' };
  }
};

const runGetCart = async (_args, { user }) => {
  if (!user) {
    return { error: 'not_logged_in', message: 'The user is not logged in.' };
  }
  const Cart = require('../../models/cart');
  const cart = await Cart.findOne({ user: user._id }).populate('items.product', 'name');
  if (!cart || !cart.items.length) {
    return { items: [], total: 0 };
  }
  const total = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return {
    items: cart.items.map((item) => ({
      name: item.product?.name || 'Unknown item',
      quantity: item.quantity,
      price: item.price
    })),
    total: Math.round(total)
  };
};

const executeTool = async (toolCall, context, collectedProducts) => {
  let args = {};
  try {
    args = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    args = {};
  }

  switch (toolCall.function.name) {
    case 'search_products': {
      const result = await runSearchProducts(args, context);
      collectedProducts.push(...result.products);
      // Trim the tool result the model sees (no need to repeat full image URLs to the LLM)
      return {
        count: result.count,
        locationApplied: result.locationApplied,
        products: result.products.map(({ image, ...rest }) => rest)
      };
    }
    case 'add_to_cart': {
      const result = await runAddToCart(args, context);
      if (result.success) context.cartUpdated = true;
      return result;
    }
    case 'get_cart':
      return runGetCart(args, context);
    default:
      return { error: 'unknown_tool' };
  }
};

const callGroq = async (messages, tools) => {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.5,
      max_tokens: 600
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Groq API error');
    error.groqData = data;
    throw error;
  }
  return data;
};

exports.sendMessage = async (req, res) => {
  try {
    const { messages, latitude, longitude, language } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'messages must be a non-empty array' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ success: false, message: 'Chat assistant is not configured on this server.' });
    }

    const trimmedHistory = messages
      .slice(-MAX_HISTORY)
      .filter((m) => m && typeof m.content === 'string')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.slice(0, 4000),
      }));

    if (trimmedHistory.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid messages provided' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const locationNote = Number.isFinite(lat) && Number.isFinite(lng)
      ? 'The user currently has a delivery location set, so search_products will automatically be limited to shops that deliver there — you do not need to ask for their pincode.'
      : 'The user has not set a delivery location yet. If they want to search for products, you can still search (results won\'t be location-filtered), but mention that setting their location (via the location picker on the site) will show them what\'s actually deliverable to them.';

    const languageNote = language === 'hi'
      ? 'Respond in Hindi (Devanagari script), in a warm, natural, conversational tone — not a stiff literal translation. Keep product names, brand names, and prices as-is (do not translate them).'
      : 'Respond in English.';

    const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\n${locationNote}\n\n${languageNote}`;

    const context = { user: req.user || null, latitude: lat, longitude: lng, cartUpdated: false };
    const collectedProducts = [];
    let workingMessages = [{ role: 'system', content: systemPrompt }, ...trimmedHistory];
    let finalReply = null;

    for (let i = 0; i < MAX_TOOL_ITERATIONS && finalReply === null; i++) {
      const data = await callGroq(workingMessages, TOOLS);
      const message = data.choices?.[0]?.message;

      if (!message) {
        finalReply = "Sorry, I couldn't generate a response. Please contact support@gmkart.com.";
        break;
      }

      if (!message.tool_calls || message.tool_calls.length === 0) {
        finalReply = message.content || "Sorry, I couldn't generate a response. Please contact support@gmkart.com.";
        break;
      }

      workingMessages.push(message);

      for (const toolCall of message.tool_calls) {
        const result = await executeTool(toolCall, context, collectedProducts);
        workingMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }

    if (finalReply === null) {
      finalReply = "I found a few things but I'm having trouble wrapping up — could you tell me which one you'd like, or try rephrasing?";
    }

    // De-dupe products across multiple search calls in the same turn, keep first 10
    const seen = new Set();
    const products = collectedProducts.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }).slice(0, 10);

    return res.json({
      success: true,
      reply: finalReply,
      products,
      cartUpdated: context.cartUpdated
    });
  } catch (error) {
    console.error('Chatbot error:', error, error.groqData);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please contact support@gmkart.com.'
    });
  }
};
