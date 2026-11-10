const mongoose = require("mongoose");
const Order = require("../../models/order");
const Product = require("../../models/product");
const Category = require("../../models/category");
const AnalyticsEvent = require("../../models/analyticsEvent");
const Occasion = require("../../models/occasion");
const { generatePromoImage, PLATFORM_SIZES } = require("../../utils/socialPostGenerator");
const { generateBackgroundImage, isConfigured: isGeminiConfigured } = require("../../utils/geminiImageGenerator");
const imagekit = require("../../utils/imagekit");

const PRODUCTS_PER_POST = 4;

// Best-selling products in this category over the last 30 days; falls back to
// highest-discount active/in-stock products if the category has no sales yet
// (new category, or just not enough order history).
const getTopProductsForCategory = async (categoryId) => {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const bestSellers = await Order.aggregate([
    { $match: { status: { $in: ["confirmed", "picked-up", "delivered"] }, createdAt: { $gte: since } } },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "product"
      }
    },
    { $unwind: "$product" },
    {
      $match: {
        "product.category": new mongoose.Types.ObjectId(categoryId),
        "product.isActive": true,
        "product.stockStatus": "in-stock"
      }
    },
    {
      $group: {
        _id: "$product._id",
        totalQuantity: { $sum: "$items.quantity" },
        product: { $first: "$product" }
      }
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: PRODUCTS_PER_POST }
  ]);

  if (bestSellers.length >= PRODUCTS_PER_POST) {
    return bestSellers.map((b) => b.product);
  }

  const seenIds = new Set(bestSellers.map((b) => b.product._id.toString()));
  const fallback = await Product.find({
    category: categoryId,
    isActive: true,
    stockStatus: "in-stock",
    _id: { $nin: [...seenIds] }
  })
    .sort({ discountPercentage: -1, createdAt: -1 })
    .limit(PRODUCTS_PER_POST - bestSellers.length)
    .lean();

  return [...bestSellers.map((b) => b.product), ...fallback];
};

// @desc    Generate a branded Instagram/Facebook promo image for a category's
//          best products — downloadable, not auto-posted.
// @route   POST /api/admin/marketing/generate-post
exports.generatePost = async (req, res) => {
  try {
    const { categoryId, platform = "instagram", useAiBackground, backgroundPrompt } = req.body;
    if (!categoryId) {
      return res.status(400).json({ success: false, message: "categoryId is required" });
    }
    if (!PLATFORM_SIZES[platform]) {
      return res.status(400).json({ success: false, message: "platform must be 'instagram' or 'facebook'" });
    }

    const category = await Category.findById(categoryId).select("name").lean();
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const products = await getTopProductsForCategory(categoryId);
    if (!products.length) {
      return res.status(400).json({ success: false, message: "No active, in-stock products found in this category" });
    }

    const postProducts = products.slice(0, PRODUCTS_PER_POST).map((p) => ({
      name: p.name,
      price: p.price,
      oldPrice: p.oldPrice,
      imageUrl: p.images?.find((img) => img.isPrimary)?.url || p.images?.[0]?.url || null
    }));

    // Optional: Gemini paints only a decorative background (never the logo,
    // products or prices — those stay precise, composited afterwards). Silently
    // falls back to the plain brand gradient if no key is configured or the
    // admin didn't ask for one, so this never blocks the core feature.
    let backgroundImageDataUri = null;
    if (useAiBackground && isGeminiConfigured()) {
      const prompt = backgroundPrompt || `A festive, vibrant background themed around "${category.name}" groceries, warm green and orange tones, soft bokeh, minimal`;
      backgroundImageDataUri = await generateBackgroundImage(prompt);
    }

    const pngBuffer = await generatePromoImage({ categoryName: category.name, products: postProducts, platform, backgroundImageDataUri });

    const uploaded = await imagekit.upload({
      file: pngBuffer,
      fileName: `${platform}_${category.name.replace(/\s+/g, "_")}_${Date.now()}.png`,
      folder: "/marketing-posts"
    });

    return res.status(200).json({
      success: true,
      data: {
        url: uploaded.url,
        platform,
        categoryName: category.name,
        productsUsed: postProducts.map((p) => p.name),
        usedAiBackground: !!backgroundImageDataUri
      }
    });
  } catch (error) {
    console.error("Generate marketing post error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to generate post image" });
  }
};

// @desc    Categories trending by recent search/click activity and sales —
//          a suggestion list, not a ranking the admin has to follow.
// @route   GET /api/admin/marketing/trending-categories
exports.getTrendingCategories = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [categoryClicks, salesTrends] = await Promise.all([
      // meta.ref on a category_click event is either the category's Mongo id
      // or its slug (whatever the category-page URL used) — never just an id.
      AnalyticsEvent.aggregate([
        { $match: { event: "category_click", createdAt: { $gte: since }, "meta.ref": { $exists: true } } },
        { $group: { _id: "$meta.ref", clicks: { $sum: 1 } } },
        { $sort: { clicks: -1 } },
        { $limit: 10 }
      ]),
      Order.aggregate([
        { $match: { status: { $in: ["confirmed", "picked-up", "delivered"] }, createdAt: { $gte: since } } },
        { $unwind: "$items" },
        {
          $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "product" }
        },
        { $unwind: "$product" },
        { $group: { _id: "$product.category", unitsSold: { $sum: "$items.quantity" } } },
        { $sort: { unitsSold: -1 } },
        { $limit: 10 }
      ])
    ]);

    const clickRefs = categoryClicks.map((c) => c._id).filter(Boolean);
    const clickObjectIds = clickRefs.filter((ref) => mongoose.Types.ObjectId.isValid(ref));
    const salesIds = salesTrends.map((c) => c._id?.toString()).filter(Boolean);

    const categories = await Category.find({
      $or: [
        { _id: { $in: [...new Set([...clickObjectIds, ...salesIds])] } },
        { slug: { $in: clickRefs } }
      ]
    }).select("name image slug").lean();

    const categoryByIdOrSlug = (ref) =>
      categories.find((c) => c._id.toString() === ref || c.slug === ref);

    const clicksMap = new Map(categoryClicks.map((c) => [c._id, c.clicks]));
    const salesMap = new Map(salesTrends.map((c) => [c._id?.toString(), c.unitsSold]));

    const allRefs = [...new Set([...clickRefs, ...salesIds])];
    const combined = allRefs
      .map((ref) => {
        const category = categoryByIdOrSlug(ref);
        if (!category) return null;
        return {
          category,
          clicks: clicksMap.get(ref) || clicksMap.get(category._id.toString()) || 0,
          unitsSold: salesMap.get(category._id.toString()) || 0
        };
      })
      .filter(Boolean)
      // A category may appear once from clicks (by slug) and once from sales
      // (by id) — collapse duplicates on the resolved category id.
      .reduce((acc, row) => {
        const existing = acc.find((r) => r.category._id.toString() === row.category._id.toString());
        if (existing) {
          existing.clicks = Math.max(existing.clicks, row.clicks);
          existing.unitsSold = Math.max(existing.unitsSold, row.unitsSold);
        } else {
          acc.push(row);
        }
        return acc;
      }, [])
      .sort((a, b) => (b.clicks + b.unitsSold * 2) - (a.clicks + a.unitsSold * 2))
      .slice(0, 8);

    return res.status(200).json({ success: true, data: combined, windowDays: days });
  } catch (error) {
    console.error("Get trending categories error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load trending categories" });
  }
};

// @desc    Occasions in the next N days, each with categories whose name/tags
//          match its keywords — a starting-point suggestion for a themed post.
// @route   GET /api/admin/marketing/upcoming-occasions
exports.getUpcomingOccasions = async (req, res) => {
  try {
    const withinDays = Math.min(parseInt(req.query.withinDays) || 30, 180);
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + withinDays);

    const occasions = await Occasion.find({ isActive: true, date: { $gte: now, $lte: until } })
      .sort({ date: 1 })
      .lean();

    const allCategories = await Category.find({ isActive: true }).select("name image").lean();

    const withSuggestions = occasions.map((occasion) => {
      const keywordRegex = new RegExp(occasion.keywords.join("|"), "i");
      const matchingCategories = allCategories.filter((c) => keywordRegex.test(c.name));
      const daysAway = Math.ceil((new Date(occasion.date) - now) / (1000 * 60 * 60 * 24));
      return { ...occasion, daysAway, suggestedCategories: matchingCategories.slice(0, 5) };
    });

    return res.status(200).json({ success: true, data: withSuggestions });
  } catch (error) {
    console.error("Get upcoming occasions error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load upcoming occasions" });
  }
};
