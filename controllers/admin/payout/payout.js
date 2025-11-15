const Order = require('../../../models/order');
const Product = require('../../../models/product');
const Promotor = require('../../../models/promotor');
const Seller = require('../../../models/seller');
const Payout = require('../../../models/payout');
const mongoose = require('mongoose');

// Get pending payouts for all promotors
exports.getPromotorPayouts = async (req, res) => {
  try {
    // Get all delivered orders with populated product details
    const deliveredOrders = await Order.find({ 
      status: 'delivered',
      paymentStatus: 'paid'
    })
      .populate({
        path: 'items.product',
        populate: {
          path: 'promotor.id',
          model: 'Promotor'
        }
      });

    // Calculate pending payouts per promotor
    const promotorPayouts = {};

    for (const order of deliveredOrders) {
      for (const item of order.items) {
        if (item.product && item.product.promotor && item.product.promotor.id) {
          const promotorId = item.product.promotor.id._id.toString();
          const promotorData = item.product.promotor.id;
          
          // Calculate commission
          let commission = 0;
          if (item.product.promotor.commissionType === 'percentage') {
            commission = (item.price * item.quantity * item.product.promotor.commissionRate) / 100;
          } else {
            commission = item.product.promotor.commissionAmount * item.quantity;
          }

          if (!promotorPayouts[promotorId]) {
            promotorPayouts[promotorId] = {
              promotorId: promotorId,
              promotorName: promotorData.name,
              promotorEmail: promotorData.email,
              promotorPhone: promotorData.phone,
              commissionRate: item.product.promotor.commissionRate,
              commissionType: item.product.promotor.commissionType,
              totalPendingPayout: 0,
              orderCount: 0,
              bankDetails: promotorData.bankDetails,
              orders: []
            };
          }

          promotorPayouts[promotorId].totalPendingPayout += commission;
          promotorPayouts[promotorId].orderCount++;
          
          // Track order details
          const existingOrder = promotorPayouts[promotorId].orders.find(
            o => o.orderId === order._id.toString()
          );
          
          if (existingOrder) {
            existingOrder.commission += commission;
          } else {
            promotorPayouts[promotorId].orders.push({
              orderId: order._id,
              orderDate: order.createdAt,
              commission: commission
            });
          }
        }
      }
    }

    // Convert to array and sort by pending payout
    const payoutArray = Object.values(promotorPayouts)
      .sort((a, b) => b.totalPendingPayout - a.totalPendingPayout);

    const totalPendingPayout = payoutArray.reduce(
      (sum, p) => sum + p.totalPendingPayout, 
      0
    );

    res.json({
      success: true,
      data: {
        promotors: payoutArray,
        totalPromotors: payoutArray.length,
        totalPendingPayout: totalPendingPayout
      }
    });

  } catch (error) {
    console.error('Get promotor payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching promotor payouts',
      error: error.message
    });
  }
};

// Get pending payouts for all sellers
exports.getSellerPayouts = async (req, res) => {
  try {
    // Get all delivered orders with populated product and seller details
    const deliveredOrders = await Order.find({ 
      status: 'delivered',
      paymentStatus: 'paid'
    })
      .populate({
        path: 'items.product',
        populate: {
          path: 'category',
          model: 'Category'
        }
      });

    // Get all products with seller information
    const products = await Product.find()
      .populate('category')
      .lean();

    // Create product to seller mapping
    const productSellerMap = {};
    const sellers = await Seller.find().lean();
    
    for (const seller of sellers) {
      for (const productId of seller.products) {
        productSellerMap[productId.toString()] = seller;
      }
    }

    // Calculate pending payouts per seller
    const sellerPayouts = {};

    for (const order of deliveredOrders) {
      for (const item of order.items) {
        if (item.product) {
          const productId = item.product._id.toString();
          const seller = productSellerMap[productId];
          
          if (seller) {
            const sellerId = seller._id.toString();
            
            // Calculate seller's share (assuming seller gets product price minus promotor commission)
            let sellerShare = item.price * item.quantity;
            
            // Deduct promotor commission if exists
            if (item.product.promotor && item.product.promotor.id) {
              let promotorCommission = 0;
              if (item.product.promotor.commissionType === 'percentage') {
                promotorCommission = (sellerShare * item.product.promotor.commissionRate) / 100;
              } else {
                promotorCommission = item.product.promotor.commissionAmount * item.quantity;
              }
              sellerShare -= promotorCommission;
            }

            // Deduct platform fee (assuming 10% platform fee, adjust as needed)
            const platformFee = sellerShare * 0.10;
            sellerShare -= platformFee;

            if (!sellerPayouts[sellerId]) {
              sellerPayouts[sellerId] = {
                sellerId: sellerId,
                sellerName: seller.name,
                sellerEmail: seller.email,
                sellerPhone: seller.phone,
                businessName: seller.businessName,
                totalPendingPayout: 0,
                orderCount: 0,
                bankDetails: seller.bankDetails,
                orders: []
              };
            }

            sellerPayouts[sellerId].totalPendingPayout += sellerShare;
            sellerPayouts[sellerId].orderCount++;
            
            // Track order details
            const existingOrder = sellerPayouts[sellerId].orders.find(
              o => o.orderId === order._id.toString()
            );
            
            if (existingOrder) {
              existingOrder.amount += sellerShare;
            } else {
              sellerPayouts[sellerId].orders.push({
                orderId: order._id,
                orderDate: order.createdAt,
                amount: sellerShare
              });
            }
          }
        }
      }
    }

    // Convert to array and sort by pending payout
    const payoutArray = Object.values(sellerPayouts)
      .sort((a, b) => b.totalPendingPayout - a.totalPendingPayout);

    const totalPendingPayout = payoutArray.reduce(
      (sum, s) => sum + s.totalPendingPayout, 
      0
    );

    res.json({
      success: true,
      data: {
        sellers: payoutArray,
        totalSellers: payoutArray.length,
        totalPendingPayout: totalPendingPayout
      }
    });

  } catch (error) {
    console.error('Get seller payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching seller payouts',
      error: error.message
    });
  }
};

// Get combined payout summary for dashboard
exports.getPayoutSummary = async (req, res) => {
  try {
    // Get promotor payouts
    const deliveredOrders = await Order.find({ 
      status: 'delivered',
      paymentStatus: 'paid'
    })
      .populate({
        path: 'items.product',
        populate: {
          path: 'promotor.id',
          model: 'Promotor'
        }
      });

    let totalPromotorPayout = 0;
    let totalSellerPayout = 0;
    let promotorCount = 0;
    let sellerCount = 0;

    const promotorPayouts = {};
    const sellerPayouts = {};

    // Get all products with seller information
    const sellers = await Seller.find().lean();
    const productSellerMap = {};
    
    for (const seller of sellers) {
      for (const productId of seller.products) {
        productSellerMap[productId.toString()] = seller;
      }
    }

    // Calculate payouts
    for (const order of deliveredOrders) {
      for (const item of order.items) {
        if (item.product) {
          // Promotor commission
          if (item.product.promotor && item.product.promotor.id) {
            const promotorId = item.product.promotor.id._id.toString();
            let commission = 0;
            
            if (item.product.promotor.commissionType === 'percentage') {
              commission = (item.price * item.quantity * item.product.promotor.commissionRate) / 100;
            } else {
              commission = item.product.promotor.commissionAmount * item.quantity;
            }

            if (!promotorPayouts[promotorId]) {
              promotorPayouts[promotorId] = 0;
            }
            promotorPayouts[promotorId] += commission;
            totalPromotorPayout += commission;
          }

          // Seller payout
          const productId = item.product._id.toString();
          const seller = productSellerMap[productId];
          
          if (seller) {
            const sellerId = seller._id.toString();
            let sellerShare = item.price * item.quantity;
            
            // Deduct promotor commission
            if (item.product.promotor && item.product.promotor.id) {
              let promotorCommission = 0;
              if (item.product.promotor.commissionType === 'percentage') {
                promotorCommission = (sellerShare * item.product.promotor.commissionRate) / 100;
              } else {
                promotorCommission = item.product.promotor.commissionAmount * item.quantity;
              }
              sellerShare -= promotorCommission;
            }

            // Deduct platform fee (10%)
            const platformFee = sellerShare * 0.10;
            sellerShare -= platformFee;

            if (!sellerPayouts[sellerId]) {
              sellerPayouts[sellerId] = 0;
            }
            sellerPayouts[sellerId] += sellerShare;
            totalSellerPayout += sellerShare;
          }
        }
      }
    }

    promotorCount = Object.keys(promotorPayouts).length;
    sellerCount = Object.keys(sellerPayouts).length;

    res.json({
      success: true,
      data: {
        promotors: {
          totalPendingPayout: totalPromotorPayout,
          count: promotorCount
        },
        sellers: {
          totalPendingPayout: totalSellerPayout,
          count: sellerCount
        },
        combined: {
          totalPendingPayout: totalPromotorPayout + totalSellerPayout,
          totalRecipients: promotorCount + sellerCount
        }
      }
    });

  } catch (error) {
    console.error('Get payout summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payout summary',
      error: error.message
    });
  }
};

// Get payout details for a specific promotor
exports.getPromotorPayoutById = async (req, res) => {
  try {
    const { promotorId } = req.params;

    const deliveredOrders = await Order.find({ 
      status: 'delivered',
      paymentStatus: 'paid'
    })
      .populate({
        path: 'items.product',
        populate: {
          path: 'promotor.id',
          model: 'Promotor'
        }
      })
      .populate('user', 'name email');

    let totalPayout = 0;
    const orders = [];

    for (const order of deliveredOrders) {
      let orderCommission = 0;
      const orderItems = [];

      for (const item of order.items) {
        if (item.product && 
            item.product.promotor && 
            item.product.promotor.id && 
            item.product.promotor.id._id.toString() === promotorId) {
          
          let commission = 0;
          if (item.product.promotor.commissionType === 'percentage') {
            commission = (item.price * item.quantity * item.product.promotor.commissionRate) / 100;
          } else {
            commission = item.product.promotor.commissionAmount * item.quantity;
          }

          orderCommission += commission;
          orderItems.push({
            productName: item.product.name,
            quantity: item.quantity,
            price: item.price,
            commission: commission
          });
        }
      }

      if (orderCommission > 0) {
        totalPayout += orderCommission;
        orders.push({
          orderId: order._id,
          orderDate: order.createdAt,
          customerName: order.user?.name || 'Unknown',
          items: orderItems,
          totalCommission: orderCommission
        });
      }
    }

    const promotor = await Promotor.findById(promotorId).select('-password');

    res.json({
      success: true,
      data: {
        promotor: promotor,
        totalPendingPayout: totalPayout,
        orderCount: orders.length,
        orders: orders
      }
    });

  } catch (error) {
    console.error('Get promotor payout by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching promotor payout details',
      error: error.message
    });
  }
};

// Get payout details for a specific seller
exports.getSellerPayoutById = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    const deliveredOrders = await Order.find({ 
      status: 'delivered',
      paymentStatus: 'paid'
    })
      .populate({
        path: 'items.product'
      })
      .populate('user', 'name email');

    let totalPayout = 0;
    const orders = [];

    for (const order of deliveredOrders) {
      let orderPayout = 0;
      const orderItems = [];

      for (const item of order.items) {
        if (item.product && seller.products.includes(item.product._id)) {
          let sellerShare = item.price * item.quantity;
          
          // Deduct promotor commission
          if (item.product.promotor && item.product.promotor.id) {
            let promotorCommission = 0;
            if (item.product.promotor.commissionType === 'percentage') {
              promotorCommission = (sellerShare * item.product.promotor.commissionRate) / 100;
            } else {
              promotorCommission = item.product.promotor.commissionAmount * item.quantity;
            }
            sellerShare -= promotorCommission;
          }

          // Deduct platform fee (10%)
          const platformFee = sellerShare * 0.10;
          sellerShare -= platformFee;

          orderPayout += sellerShare;
          orderItems.push({
            productName: item.product.name,
            quantity: item.quantity,
            price: item.price,
            sellerShare: sellerShare
          });
        }
      }

      if (orderPayout > 0) {
        totalPayout += orderPayout;
        orders.push({
          orderId: order._id,
          orderDate: order.createdAt,
          customerName: order.user?.name || 'Unknown',
          items: orderItems,
          totalPayout: orderPayout
        });
      }
    }

    res.json({
      success: true,
      data: {
        seller: {
          _id: seller._id,
          name: seller.name,
          email: seller.email,
          businessName: seller.businessName,
          bankDetails: seller.bankDetails
        },
        totalPendingPayout: totalPayout,
        orderCount: orders.length,
        orders: orders
      }
    });

  } catch (error) {
    console.error('Get seller payout by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching seller payout details',
      error: error.message
    });
  }
};

// Create a payout record
exports.createPayout = async (req, res) => {
  try {
    const { recipientType, recipientId, amount, orderIds, bankDetails } = req.body;

    // Validate recipient
    let recipient;
    let recipientModel;
    
    if (recipientType === 'promotor') {
      recipient = await Promotor.findById(recipientId);
      recipientModel = 'Promotor';
    } else if (recipientType === 'seller') {
      recipient = await Seller.findById(recipientId);
      recipientModel = 'Seller';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid recipient type'
      });
    }

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: `${recipientType} not found`
      });
    }

    // Create payout record
    const payout = await Payout.create({
      recipientType,
      recipientId,
      recipientModel,
      recipientName: recipient.name,
      amount,
      orderIds: orderIds || [],
      orderCount: orderIds ? orderIds.length : 0,
      status: 'pending',
      bankDetails: bankDetails || recipient.bankDetails
    });

    res.status(201).json({
      success: true,
      message: 'Payout record created successfully',
      data: payout
    });

  } catch (error) {
    console.error('Create payout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payout record',
      error: error.message
    });
  }
};

// Mark payout as paid
exports.markPayoutAsPaid = async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { paymentMethod, paymentDate, transactionId, notes, adminId } = req.body;

    const payout = await Payout.findById(payoutId);
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout record not found'
      });
    }

    if (payout.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payout is already marked as paid'
      });
    }

    // Update payout
    payout.status = 'paid';
    payout.paymentMethod = paymentMethod;
    payout.paymentDate = paymentDate || new Date();
    payout.transactionId = transactionId;
    payout.notes = notes;
    payout.processedBy = adminId;

    await payout.save();

    res.json({
      success: true,
      message: 'Payout marked as paid successfully',
      data: payout
    });

  } catch (error) {
    console.error('Mark payout as paid error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking payout as paid',
      error: error.message
    });
  }
};

// Get all payout records
exports.getAllPayouts = async (req, res) => {
  try {
    const { 
      status, 
      recipientType, 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (recipientType) filter.recipientType = recipientType;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const payouts = await Payout.find(filter)
      .populate('recipientId')
      .populate('processedBy', 'name email')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payout.countDocuments(filter);

    res.json({
      success: true,
      data: {
        payouts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRecords: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get all payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payout records',
      error: error.message
    });
  }
};

// Get payout history for a specific recipient
exports.getPayoutHistory = async (req, res) => {
  try {
    const { recipientType, recipientId } = req.params;

    const payouts = await Payout.find({
      recipientType,
      recipientId
    })
      .populate('processedBy', 'name email')
      .sort({ createdAt: -1 });

    const stats = {
      totalPaid: 0,
      totalPending: 0,
      totalAmount: 0,
      payoutCount: payouts.length
    };

    payouts.forEach(payout => {
      stats.totalAmount += payout.amount;
      if (payout.status === 'paid') {
        stats.totalPaid += payout.amount;
      } else if (payout.status === 'pending') {
        stats.totalPending += payout.amount;
      }
    });

    res.json({
      success: true,
      data: {
        payouts,
        stats
      }
    });

  } catch (error) {
    console.error('Get payout history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payout history',
      error: error.message
    });
  }
};

// Update payout status
exports.updatePayoutStatus = async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'processing', 'paid', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const payout = await Payout.findById(payoutId);
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout record not found'
      });
    }

    payout.status = status;
    if (notes) payout.notes = notes;

    await payout.save();

    res.json({
      success: true,
      message: 'Payout status updated successfully',
      data: payout
    });

  } catch (error) {
    console.error('Update payout status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payout status',
      error: error.message
    });
  }
};