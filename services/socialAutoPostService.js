const cron = require('node-cron');
const mongoose = require('mongoose');
const SocialAutoPost = require('../models/socialAutoPost');
const SocialAutoPostLog = require('../models/socialAutoPostLog');
const Category = require('../models/category');
const Product = require('../models/product');
const Order = require('../models/order');
const imagekit = require('../utils/imagekit');
const { generatePromoImage, generateLifestylePost, toDataUri, PLATFORM_SIZES } = require('../utils/socialPostGenerator');
const { generateBackgroundImage, generateLifestyleScene, isConfigured: isAiConfigured } = require('../utils/geminiImageGenerator');
const { isConfigured: isMetaConfigured, postToFacebookPage, postToInstagram } = require('../utils/metaPublisher');

const PRODUCTS_PER_POST = 4;

// Get or initialize singleton config
const getConfig = async () => {
  let config = await SocialAutoPost.findOne();
  if (!config) {
    config = await SocialAutoPost.create({
      isEnabled: false,
      scheduledTime: "10:00",
      platforms: ["facebook", "instagram"],
      postType: "category-deals",
      customCaption: ""
    });
  }
  return config;
};

// Top products for a category
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

// Publish helper
const publishToMeta = async (imageUrl, caption, platforms = ["facebook", "instagram"]) => {
  const targets = Array.isArray(platforms) && platforms.length ? platforms : ["facebook", "instagram"];
  if (!isMetaConfigured()) {
    throw new Error("Meta publishing is not configured (missing WHATSAPP_ACCESS_TOKEN)");
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

// Main auto-post executor
const executeAutoPost = async ({ triggerType = "cron", overrideConfig = null } = {}) => {
  const config = overrideConfig || await getConfig();
  const platforms = config.platforms && config.platforms.length ? config.platforms : ["facebook", "instagram"];
  const postType = config.postType || "category-deals";
  const platform = "instagram"; // standard 1080x1080 square format works best across both IG & FB

  try {
    let uploadedImageUrl = null;
    let postCaption = "";
    let categoryName = "";
    let productNames = [];
    let title = "";

    if (postType === "category-deals") {
      // Find top active category with products
      const categories = await Category.find({ isActive: true }).select("name").lean();
      if (!categories.length) throw new Error("No active categories found");

      let chosenCategory = null;
      let chosenProducts = [];

      for (const cat of categories) {
        const prods = await getTopProductsForCategory(cat._id);
        if (prods.length >= 2) {
          chosenCategory = cat;
          chosenProducts = prods;
          break;
        }
      }

      if (!chosenCategory || !chosenProducts.length) {
        throw new Error("No active category with sufficient products found");
      }

      categoryName = chosenCategory.name;
      productNames = chosenProducts.map((p) => p.name);
      title = `Daily Deals: ${categoryName}`;

      const postProducts = chosenProducts.slice(0, PRODUCTS_PER_POST).map((p) => ({
        name: p.name,
        price: p.price,
        oldPrice: p.oldPrice,
        imageUrl: p.images?.find((img) => img.isPrimary)?.url || p.images?.[0]?.url || null
      }));

      // Generate free AI background (Pollinations FLUX)
      const prompt = `A vibrant grocery display themed around "${categoryName}", warm natural light, soft bokeh blur`;
      const backgroundImageDataUri = await generateBackgroundImage(prompt, PLATFORM_SIZES[platform]);

      const pngBuffer = await generatePromoImage({
        categoryName,
        products: postProducts,
        platform,
        backgroundImageDataUri
      });

      const uploaded = await imagekit.upload({
        file: pngBuffer,
        fileName: `autopost_${platform}_${categoryName.replace(/\s+/g, "_")}_${Date.now()}.png`,
        folder: "/marketing-posts"
      });

      uploadedImageUrl = uploaded.url;

      postCaption = config.customCaption
        ? config.customCaption.replace("{category}", categoryName)
        : `Today's Special Deals on ${categoryName}! 🛒\nOrder now on GMKart for superfast 10-15 minute doorstep delivery. Best prices & freshest quality guaranteed!\n\n#GMKart #SuperfastDelivery #DailyDeals #OnlineGrocery #${categoryName.replace(/[^a-zA-Z0-9]/g, '')}`;

    } else {
      // Lifestyle Scene for top product
      const product = await Product.findOne({ isActive: true, stockStatus: "in-stock" })
        .sort({ discountPercentage: -1, createdAt: -1 })
        .select("name images price oldPrice")
        .lean();

      if (!product) throw new Error("No active in-stock product found for lifestyle post");

      const productImageUrl = product.images?.find((img) => img.isPrimary)?.url || product.images?.[0]?.url;
      if (!productImageUrl) throw new Error("Product has no image");

      const productImageDataUri = await toDataUri(productImageUrl);
      productNames = [product.name];
      title = `Lifestyle Spotlight: ${product.name}`;

      const scenePrompt = `a cozy, modern Indian kitchen breakfast table with warm morning sunlight`;
      const sceneImageDataUri = await generateLifestyleScene(
        [productImageDataUri],
        scenePrompt,
        [product.name],
        PLATFORM_SIZES[platform]
      );

      if (!sceneImageDataUri) throw new Error("Failed to generate lifestyle scene");

      const pngBuffer = await generateLifestylePost({
        sceneImageDataUri,
        tagline: `${product.name} — Order now on GMKart`,
        platform
      });

      const uploaded = await imagekit.upload({
        file: pngBuffer,
        fileName: `autopost_lifestyle_${product.name.slice(0, 15).replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.png`,
        folder: "/marketing-posts"
      });

      uploadedImageUrl = uploaded.url;

      postCaption = config.customCaption
        ? config.customCaption.replace("{product}", product.name)
        : `${product.name} — Fresh picks on GMKart! ⚡\nOrder now for 10-15 min fast delivery right to your door.\n\n#GMKart #GroceryDelivery #FastDelivery #FreshPicks`;
    }

    // Publish to Meta platforms
    const publishResults = await publishToMeta(uploadedImageUrl, postCaption, platforms);

    const hasSuccess = Object.values(publishResults).some((r) => r.success);
    const hasFail = Object.values(publishResults).some((r) => !r.success);
    const status = hasSuccess && !hasFail ? "success" : hasSuccess && hasFail ? "partial" : "failed";

    // Save history log
    const log = await SocialAutoPostLog.create({
      triggerType,
      postType,
      title,
      categoryName,
      productNames,
      imageUrl: uploadedImageUrl,
      caption: postCaption,
      platforms,
      publishResults,
      status
    });

    // Update config status
    config.lastRunAt = new Date();
    config.lastStatus = status;
    config.lastMessage = `Posted successfully to ${Object.keys(publishResults).filter(k => publishResults[k].success).join(', ')}`;
    await config.save();

    return { success: true, log };
  } catch (error) {
    console.error("Execute social auto-post error:", error.message);

    const log = await SocialAutoPostLog.create({
      triggerType,
      postType,
      title: "Auto-Post Failed",
      imageUrl: "",
      platforms,
      status: "failed",
      error: error.message
    });

    config.lastRunAt = new Date();
    config.lastStatus = "failed";
    config.lastMessage = error.message;
    await config.save();

    return { success: false, error: error.message, log };
  }
};

let schedulerStarted = false;

// Starts the cron scheduler (every minute sweep for IST scheduledTime)
const startSocialAutoPostScheduler = () => {
  if (schedulerStarted) return;
  schedulerStarted = true;

  console.log("🚀 Social Auto-Post scheduler initialized (sweeps every minute for scheduled IST time)");

  cron.schedule('* * * * *', async () => {
    try {
      const config = await SocialAutoPost.findOne();
      if (!config || !config.isEnabled) return;

      // Current time in IST (UTC + 5:30)
      const now = new Date();
      const istTime = new Date(now.getTime() + 5.5 * 60 * 60000);
      const currentHour = String(istTime.getUTCHours()).padStart(2, '0');
      const currentMin = String(istTime.getUTCMinutes()).padStart(2, '0');
      const currentHHMM = `${currentHour}:${currentMin}`;

      if (config.scheduledTime === currentHHMM) {
        // Prevent duplicate trigger within the same hour
        if (config.lastRunAt && (now.getTime() - new Date(config.lastRunAt).getTime()) < 50 * 60 * 1000) {
          return;
        }

        console.log(`⏰ Scheduled time [${currentHHMM} IST] matched! Triggering social auto-post...`);
        await executeAutoPost({ triggerType: "cron", overrideConfig: config });
      }
    } catch (err) {
      console.error("Social auto-post cron sweep error:", err.message);
    }
  });
};

module.exports = {
  getConfig,
  executeAutoPost,
  startSocialAutoPostScheduler
};
