const mongoose = require("mongoose");
const Order = require("../../models/order");
const Product = require("../../models/product");
const Category = require("../../models/category");
const AnalyticsEvent = require("../../models/analyticsEvent");
const Occasion = require("../../models/occasion");
const SocialAutoPost = require("../../models/socialAutoPost");
const SocialAutoPostLog = require("../../models/socialAutoPostLog");
const socialAutoPostService = require("../../services/socialAutoPostService");
const { generatePromoImage, generateLifestylePost, toDataUri, PLATFORM_SIZES } = require("../../utils/socialPostGenerator");
const { generateBackgroundImage, generateLifestyleScene, isConfigured: isGeminiConfigured } = require("../../utils/geminiImageGenerator");
const { isConfigured: isMetaPublisherConfigured, postToFacebookPage, postToInstagram } = require("../../utils/metaPublisher");
const imagekit = require("../../utils/imagekit");

const PRODUCTS_PER_POST = 4;

// Helper to publish an image to Facebook and/or Instagram
const publishToMeta = async (imageUrl, caption, platforms = ["facebook", "instagram"]) => {
  const targets = Array.isArray(platforms) && platforms.length ? platforms : ["facebook", "instagram"];
  if (!isMetaPublisherConfigured()) {
    return { error: "Meta publishing is not configured (missing WHATSAPP_ACCESS_TOKEN)" };
  }
  const results = {};
  await Promise.all(targets.map(async (platform) => {
    try {
      const publishFn = platform === "instagram" ? postToInstagram : platform === "facebook" ? postToFacebookPage : null;
      if (!publishFn) {
        results[platform] = { success: false, error: `Unknown platform: ${platform}` };
        return;
      }
      const result = await publishFn(imageUrl, caption || "");
      results[platform] = { success: true, ...result };
    } catch (error) {
      results[platform] = { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }));
  return results;
};

// @desc    Active, in-stock products in a category for the admin to pick from
//          (lifestyle-post product picker). Deliberately NOT the customer-facing
//          /api/product/category/:id route — that one requires lat/lng to only
//          show products from nearby open shops, which doesn't apply here.
// @route   GET /api/admin/marketing/category-products/:categoryId
exports.getCategoryProducts = async (req, res) => {
  try {
    const products = await Product.find({
      category: req.params.categoryId,
      isActive: true,
      stockStatus: "in-stock"
    })
      .select("name images")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Get category products error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load products" });
  }
};

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
//          best products — downloadable, or auto-posted if requested.
// @route   POST /api/admin/marketing/generate-post
exports.generatePost = async (req, res) => {
  try {
    const { categoryId, platform = "instagram", useAiBackground, backgroundPrompt, autoPublish, caption, publishPlatforms } = req.body;
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

    // AI paints a decorative background at ₹0 cost using Pollinations FLUX.
    // Gemini is kept disabled unless specifically requested (useGemini: true).
    let backgroundImageDataUri = null;
    if (useAiBackground && isGeminiConfigured()) {
      const prompt = backgroundPrompt || `A festive, vibrant background themed around "${category.name}" groceries, warm green and orange tones, soft bokeh, minimal`;
      backgroundImageDataUri = await generateBackgroundImage(prompt, PLATFORM_SIZES[platform], { allowGemini: !!req.body.useGemini });
    }

    const pngBuffer = await generatePromoImage({ categoryName: category.name, products: postProducts, platform, backgroundImageDataUri });

    const uploaded = await imagekit.upload({
      file: pngBuffer,
      fileName: `${platform}_${category.name.replace(/\s+/g, "_")}_${Date.now()}.png`,
      folder: "/marketing-posts"
    });

    let publishResults = null;
    if (autoPublish) {
      const postCaption = caption || `Fresh essentials in ${category.name}! 🛒\nOrder on GMKart for superfast delivery to your doorstep. Best prices & top quality guaranteed.\n\n#GMKart #QuickCommerce #Grocery #OnlineGrocery #FreshDelivery`;
      publishResults = await publishToMeta(uploaded.url, postCaption, publishPlatforms);
    }

    return res.status(200).json({
      success: true,
      data: {
        url: uploaded.url,
        platform,
        categoryName: category.name,
        productsUsed: postProducts.map((p) => p.name),
        usedAiBackground: !!backgroundImageDataUri,
        publishResults
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

// @desc    AI lifestyle post for one or multiple products — Generates a photorealistic
//          scene at ₹0 cost with Pollinations FLUX. Supports selecting multiple products.
//          Gemini is strictly disabled unless explicitly asked (useGemini: true).
//          GMKart real logo + tagline are composited cleanly on top.
// @route   POST /api/admin/marketing/generate-lifestyle-post
exports.generateLifestylePost = async (req, res) => {
  try {
    const { productId, productIds, platform = "instagram", sceneDescription, tagline, autoPublish, caption, publishPlatforms, useGemini = false } = req.body;
    
    const selectedIds = Array.isArray(productIds) && productIds.length > 0
      ? productIds
      : productId ? [productId] : [];

    if (!selectedIds.length) {
      return res.status(400).json({ success: false, message: "Please select at least one product" });
    }
    if (!PLATFORM_SIZES[platform]) {
      return res.status(400).json({ success: false, message: "platform must be 'instagram' or 'facebook'" });
    }

    const products = await Product.find({ _id: { $in: selectedIds } })
      .select("name images price oldPrice")
      .lean();

    if (!products.length) {
      return res.status(404).json({ success: false, message: "No selected products found" });
    }

    const productNames = products.map((p) => p.name);
    const productImages = products
      .map((p) => p.images?.find((img) => img.isPrimary)?.url || p.images?.[0]?.url)
      .filter(Boolean);

    const dataUris = await Promise.all(productImages.slice(0, 4).map((url) => toDataUri(url)));
    const validDataUris = dataUris.filter(Boolean);

    const defaultNamesLabel = productNames.length > 1
      ? `${productNames.slice(0, 2).join(" & ")}${productNames.length > 2 ? ` + ${productNames.length - 2} more` : ""}`
      : productNames[0];

    const scenePrompt = sceneDescription || `a cozy, well-lit Indian home setting that fits ${defaultNamesLabel}`;
    
    // Gemini is kept disabled by default (allowGemini: false) unless useGemini is explicitly true
    const sceneImageDataUri = await generateLifestyleScene(
      validDataUris,
      scenePrompt,
      productNames,
      PLATFORM_SIZES[platform],
      { allowGemini: !!useGemini }
    );

    if (!sceneImageDataUri) {
      return res.status(502).json({ success: false, message: "Could not generate an AI lifestyle scene right now" });
    }

    const defaultTagline = productNames.length > 1
      ? `${defaultNamesLabel} — Order now on GMKart`
      : `${productNames[0]} — Order now on GMKart`;

    const pngBuffer = await generateLifestylePost({
      sceneImageDataUri,
      tagline: tagline || defaultTagline,
      platform
    });

    const safePrefix = productNames[0].slice(0, 15).replace(/[^a-zA-Z0-9]/g, "_");
    const uploaded = await imagekit.upload({
      file: pngBuffer,
      fileName: `${platform}_lifestyle_${safePrefix}_${Date.now()}.png`,
      folder: "/marketing-posts"
    });

    let publishResults = null;
    if (autoPublish) {
      const postCaption = caption || `${defaultNamesLabel} — Fresh deals on GMKart! ⚡\nGet your daily grocery essentials delivered in 10-15 minutes. Tap to order now!\n\n#GMKart #SuperfastDelivery #GroceryDeals #FreshProduce #ShopLocal`;
      publishResults = await publishToMeta(uploaded.url, postCaption, publishPlatforms);
    }

    return res.status(200).json({
      success: true,
      data: {
        url: uploaded.url,
        platform,
        productNames,
        publishResults,
        usedGemini: !!useGemini
      }
    });
  } catch (error) {
    console.error("Generate lifestyle post error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to generate lifestyle post" });
  }
};

// @desc    Publish an already-generated post image directly to Facebook
//          and/or Instagram.
// @route   POST /api/admin/marketing/publish
exports.publishPost = async (req, res) => {
  try {
    const { imageUrl, caption, platforms } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: "imageUrl is required" });
    }

    const results = await publishToMeta(imageUrl, caption, platforms);
    if (results.error) {
      return res.status(400).json({ success: false, message: results.error });
    }

    return res.status(200).json({ success: true, data: results });
  } catch (error) {
    console.error("Publish post error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to publish post" });
  }
};

// @desc    1-Click Automated Daily Post: Picks top trending category or deal,
//          generates the post image with FLUX background (₹0 cost), and publishes
//          to Facebook and Instagram automatically.
// @route   POST /api/admin/marketing/auto-daily-post
exports.autoDailyPost = async (req, res) => {
  try {
    const platform = req.body.platform || "instagram";

    // 1. Find the top active category with products
    const categories = await Category.find({ isActive: true }).select("name").lean();
    if (!categories.length) {
      return res.status(400).json({ success: false, message: "No active categories available" });
    }

    // Pick top category by sales or random from active
    let selectedCategory = categories[0];
    for (const cat of categories) {
      const prods = await getTopProductsForCategory(cat._id);
      if (prods.length >= 2) {
        selectedCategory = cat;
        break;
      }
    }

    const products = await getTopProductsForCategory(selectedCategory._id);
    if (!products.length) {
      return res.status(400).json({ success: false, message: "No products available for auto-post" });
    }

    const postProducts = products.slice(0, PRODUCTS_PER_POST).map((p) => ({
      name: p.name,
      price: p.price,
      oldPrice: p.oldPrice,
      imageUrl: p.images?.find((img) => img.isPrimary)?.url || p.images?.[0]?.url || null
    }));

    // Generate free AI background
    const prompt = `A vibrant grocery market display themed around "${selectedCategory.name}", fresh produce, warm colors, soft bokeh`;
    const backgroundImageDataUri = await generateBackgroundImage(prompt, PLATFORM_SIZES[platform]);

    const pngBuffer = await generatePromoImage({
      categoryName: selectedCategory.name,
      products: postProducts,
      platform,
      backgroundImageDataUri
    });

    const uploaded = await imagekit.upload({
      file: pngBuffer,
      fileName: `auto_${platform}_${selectedCategory.name.replace(/\s+/g, "_")}_${Date.now()}.png`,
      folder: "/marketing-posts"
    });

    const caption = req.body.caption || `Today's Special Deals on ${selectedCategory.name}! 🛒\nOrder now on GMKart for superfast delivery to your home in 10-15 mins. Tap to shop!\n\n#GMKart #SuperfastDelivery #DailyDeals #OnlineGrocery #${selectedCategory.name.replace(/\s+/g, '')}`;

    const publishResults = await publishToMeta(uploaded.url, caption, req.body.publishPlatforms || ["facebook", "instagram"]);

    return res.status(200).json({
      success: true,
      message: "Daily post generated and auto-published successfully",
      data: {
        category: selectedCategory.name,
        imageUrl: uploaded.url,
        platform,
        publishResults
      }
    });
  } catch (error) {
    console.error("Auto daily post error:", error.message);
    return res.status(500).json({ success: false, message: error.message || "Failed to auto-post" });
  }
};

// @desc    Get current social auto-post configuration and recent logs
// @route   GET /api/admin/marketing/auto-post-config
exports.getAutoPostConfig = async (req, res) => {
  try {
    const config = await socialAutoPostService.getConfig();
    const recentLogs = await SocialAutoPostLog.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        config,
        recentLogs
      }
    });
  } catch (error) {
    console.error("Get auto-post config error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load auto-post settings" });
  }
};

// @desc    Update social auto-post configuration (time, enabled, platforms, type)
// @route   PUT /api/admin/marketing/auto-post-config
exports.updateAutoPostConfig = async (req, res) => {
  try {
    const { isEnabled, scheduledTime, platforms, postType, customCaption } = req.body;
    const config = await socialAutoPostService.getConfig();

    if (typeof isEnabled === "boolean") config.isEnabled = isEnabled;
    if (scheduledTime) config.scheduledTime = scheduledTime;
    if (Array.isArray(platforms) && platforms.length) config.platforms = platforms;
    if (postType) config.postType = postType;
    if (typeof customCaption === "string") config.customCaption = customCaption;

    await config.save();

    return res.status(200).json({
      success: true,
      message: "Auto-post configuration updated",
      data: config
    });
  } catch (error) {
    console.error("Update auto-post config error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update auto-post settings" });
  }
};

// @desc    Manually trigger auto-post immediately (Run Now)
// @route   POST /api/admin/marketing/auto-post-trigger
exports.triggerAutoPostNow = async (req, res) => {
  try {
    const result = await socialAutoPostService.executeAutoPost({ triggerType: "manual" });
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error, data: result.log });
    }
    return res.status(200).json({ success: true, message: "Auto-post executed successfully", data: result.log });
  } catch (error) {
    console.error("Trigger auto-post error:", error.message);
    return res.status(500).json({ success: false, message: error.message || "Failed to trigger auto-post" });
  }
};

// @desc    Get paginated logs of past social auto-posts
// @route   GET /api/admin/marketing/auto-post-logs
exports.getAutoPostLogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const [logs, total] = await Promise.all([
      SocialAutoPostLog.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SocialAutoPostLog.countDocuments()
    ]);

    return res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error("Get auto-post logs error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load auto-post history" });
  }
};
