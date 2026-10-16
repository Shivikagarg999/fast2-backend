const HomeSection = require('../../models/homeSection');
const Product = require('../../models/product');
const Category = require('../../models/category');
const Subcategory = require('../../models/subcategory');
const { getActiveDiscounts, applyDiscountToProduct } = require('../../utils/discountHelper');
const { getNearbyShopProductFilter } = require('../product/productController');

// Resolves a `link` (tag/category/subcategory/product/url) into a plain object
// the client can act on directly, e.g. navigate to a filtered product list.
const resolveLink = async (link) => {
  if (!link || link.type === 'none' || !link.value) return null;
  if (link.type === 'category') {
    const category = await Category.findById(link.value).select('name').lean();
    if (!category) return null;
    return { type: 'category', id: link.value, name: category.name };
  }
  if (link.type === 'subcategory') {
    const subcategory = await Subcategory.findById(link.value).select('name').lean();
    if (!subcategory) return null;
    return { type: 'subcategory', id: link.value, name: subcategory.name };
  }
  if (link.type === 'product') {
    return { type: 'product', id: link.value };
  }
  if (link.type === 'tag') {
    return { type: 'tag', value: link.value };
  }
  if (link.type === 'url') {
    return { type: 'url', value: link.value };
  }
  return null;
};

const resolveProductsForSection = async (section, productFilter, discounts) => {
  const { mode, manualProducts, tag, maxPrice, minDiscountPercent, limit } = section.productSource || {};
  const baseFilter = { isActive: true, ...productFilter };

  let products = [];

  if (mode === 'manual') {
    if (!manualProducts?.length) return [];
    products = await Product.find({ _id: { $in: manualProducts }, ...baseFilter })
      .populate('category').populate('subcategory');
    // Preserve the admin's chosen order rather than whatever Mongo returns.
    const order = manualProducts.map((id) => id.toString());
    products.sort((a, b) => order.indexOf(a._id.toString()) - order.indexOf(b._id.toString()));
  } else if (mode === 'tag') {
    if (!tag) return [];
    products = await Product.find({ tags: tag, ...baseFilter })
      .populate('category').populate('subcategory')
      .limit(limit || 20);
  } else if (mode === 'maxPrice') {
    if (maxPrice == null) return [];
    products = await Product.find({ price: { $lte: maxPrice }, ...baseFilter })
      .populate('category').populate('subcategory')
      .sort({ price: 1 })
      .limit(limit || 20);
  } else if (mode === 'minDiscount') {
    if (minDiscountPercent == null) return [];
    products = await Product.find({ discountPercentage: { $gte: minDiscountPercent }, ...baseFilter })
      .populate('category').populate('subcategory')
      .sort({ discountPercentage: -1 })
      .limit(limit || 20);
  }

  return products.map((p) => applyDiscountToProduct(p.toObject(), discounts));
};

// @desc    Live, resolved home-page sections — active, within date window, with
//          products/tile links fully resolved for direct rendering.
// @route   GET /api/home-sections?latitude=..&longitude=..
exports.getHomeSections = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    const now = new Date();

    const sections = await HomeSection.find({
      isActive: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
      ]
    }).sort({ order: 1, createdAt: -1 }).lean();

    if (!sections.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const [discounts, { productFilter }] = await Promise.all([
      getActiveDiscounts(),
      getNearbyShopProductFilter(latitude, longitude)
    ]);

    const data = await Promise.all(sections.map(async (section) => {
      const viewAllLink = await resolveLink(section.viewAllLink);

      if (section.type === 'product_carousel') {
        const products = await resolveProductsForSection(section, productFilter, discounts);
        if (!products.length) return null; // don't show an empty row
        return {
          _id: section._id,
          title: section.title,
          subtitle: section.subtitle,
          type: section.type,
          theme: section.theme,
          products,
          viewAllLink
        };
      }

      // tile_grid
      const tiles = await Promise.all((section.tiles || []).map(async (tile) => ({
        label: tile.label,
        image: tile.image,
        featured: tile.featured,
        priceLabel: tile.priceLabel,
        link: await resolveLink(tile.link)
      })));
      if (!tiles.length) return null;
      return {
        _id: section._id,
        title: section.title,
        subtitle: section.subtitle,
        type: section.type,
        theme: section.theme,
        tiles,
        viewAllLink
      };
    }));

    return res.status(200).json({ success: true, data: data.filter(Boolean) });
  } catch (error) {
    console.error('Get home sections error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to load home sections' });
  }
};
