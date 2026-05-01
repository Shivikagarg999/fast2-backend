// controllers/admin/reports/productReport.js
const Product = require("../../../models/product");
const Order = require("../../../models/order");

const getProductReport = async (req, res) => {
  try {
    const {
      sellerId,
      categoryId,
      stockStatus,
      minPrice,
      maxPrice,
      format = "json",
      page = 1,
      limit = 20
    } = req.query;

    const filter = {};
    if (sellerId) filter.seller = sellerId;
    if (categoryId) filter.category = categoryId;
    if (stockStatus) filter.stockStatus = stockStatus;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Get total count for pagination
    const totalCount = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .populate("seller", "name email phone businessName")
      .populate("category", "name")
      .populate({
        path: "promotor.id",
        model: "Promotor",
        select: "name email phone commissionRate"
      })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const reportData = await Promise.all(products.map(async (product) => {
      // Get sales data for this product
      const orders = await Order.find({ "items.product": product._id }).lean();
      
      let totalQuantitySold = 0;
      let totalRevenue = 0;
      
      orders.forEach(order => {
        const orderItem = order.items.find(item => 
          item.product.toString() === product._id.toString()
        );
        if (orderItem) {
          totalQuantitySold += orderItem.quantity;
          totalRevenue += (orderItem.price * orderItem.quantity);
        }
      });

      const uniqueOrders = new Set(orders.map(o => o._id.toString()));
      const totalOrdersCount = uniqueOrders.size;

      return {
        productId: product._id,
        name: product.name,
        description: product.description || 'N/A',
        brand: product.brand || 'N/A',
        category: product.category?.name || 'N/A',
        price: product.price,
        oldPrice: product.oldPrice || 0,
        discountPercentage: product.discountPercentage || 0,
        hsnCode: product.hsnCode || 'N/A',
        gstPercent: product.gstPercent,
        taxType: product.taxType === 'inclusive' ? 'Inclusive' : 'Exclusive',
        currentStock: product.quantity,
        stockStatus: product.stockStatus === 'in-stock' ? 'In Stock' : 'Out of Stock',
        minOrderQuantity: product.minOrderQuantity,
        maxOrderQuantity: product.maxOrderQuantity,
        isLowStock: product.quantity <= (product.lowStockThreshold || 10),
        weight: product.weight ? `${product.weight} ${product.weightUnit || 'g'}` : 'N/A',
        dimensions: product.dimensions ? 
          `${product.dimensions.length}x${product.dimensions.width}x${product.dimensions.height} ${product.dimensions.unit}` : 'N/A',
        sellerName: product.seller?.businessName || product.seller?.name || 'N/A',
        sellerEmail: product.seller?.email || 'N/A',
        sellerPhone: product.seller?.phone || 'N/A',
        promotorName: product.promotor?.id?.name || 'N/A',
        promotorCommissionRate: product.promotor?.commissionRate || 0,
        totalQuantitySold,
        totalRevenue,
        totalOrdersCount,
        averagePrice: totalQuantitySold > 0 ? totalRevenue / totalQuantitySold : 0,
        primaryImage: product.images?.find(img => img.isPrimary)?.url || product.images?.[0]?.url || 'No Image',
        totalImages: product.images?.length || 0,
        estimatedDeliveryTime: product.delivery?.estimatedDeliveryTime || 'N/A',
        deliveryCharges: product.delivery?.deliveryCharges || 0,
        serviceablePincodes: product.serviceablePincodes?.length || 0,
        isActive: product.isActive ? 'Active' : 'Inactive',
        createdAt: new Date(product.createdAt).toLocaleString(),
        lastUpdated: new Date(product.updatedAt).toLocaleString()
      };
    }));

    // Calculate summary from all data without pagination limit
    const allProductsForSummary = await Product.find(filter).lean();
    const allOrdersForSummary = await Order.find({ 
      "items.product": { $in: allProductsForSummary.map(p => p._id) } 
    }).lean();
    
    let totalQuantitySoldAll = 0;
    let totalRevenueAll = 0;
    
    allOrdersForSummary.forEach(order => {
      order.items.forEach(item => {
        if (allProductsForSummary.some(p => p._id.toString() === item.product.toString())) {
          totalQuantitySoldAll += item.quantity;
          totalRevenueAll += (item.price * item.quantity);
        }
      });
    });
    
    const summary = {
      totalProducts: totalCount,
      totalValue: allProductsForSummary.reduce((sum, p) => sum + p.price, 0),
      totalRevenue: totalRevenueAll,
      totalQuantitySold: totalQuantitySoldAll,
      activeProducts: allProductsForSummary.filter(p => p.isActive).length,
      outOfStockProducts: allProductsForSummary.filter(p => p.stockStatus === 'out-of-stock').length,
      lowStockProducts: allProductsForSummary.filter(p => p.quantity <= (p.lowStockThreshold || 10)).length,
      categoriesCount: new Set(allProductsForSummary.map(p => p.category?.toString())).size,
      sellersCount: new Set(allProductsForSummary.map(p => p.seller?.toString())).size
    };

    if (format === 'csv') {
      const csvHeaders = [
        'Product Name', 'Category', 'Price', 'Old Price', 'Discount (%)',
        'GST (%)', 'HSN Code', 'Current Stock', 'Stock Status',
        'Total Quantity Sold', 'Total Revenue', 'Total Orders',
        'Seller Name', 'Seller Email', 'Promotor Name', 'Promotor Commission (%)',
        'Is Active', 'Created At'
      ];

      const csvRows = reportData.map(product => [
        product.name, product.category, product.price, product.oldPrice,
        product.discountPercentage, product.gstPercent, product.hsnCode,
        product.currentStock, product.stockStatus, product.totalQuantitySold,
        product.totalRevenue, product.totalOrdersCount, product.sellerName,
        product.sellerEmail, product.promotorName, product.promotorCommissionRate,
        product.isActive, product.createdAt
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="product_report_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    res.json({
      success: true,
      summary,
      data: reportData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalRecords: totalCount,
        recordsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error in getProductReport:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getProductReport };