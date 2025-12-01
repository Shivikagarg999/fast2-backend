const Order = require('../../models/order');
const Product = require('../../models/product');
const User = require('../../models/user');
const mongoose = require('mongoose');

exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      items,
      shippingAddress,
      paymentMethod = "cod",
      useWallet = false,
      coupon
    } = req.body;

    const userId = req.user._id;

    if (!items || !items.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Order items are required"
      });
    }

    if (!shippingAddress) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Shipping address is required"
      });
    }

    const shippingPincode = shippingAddress.pincode || shippingAddress.pinCode;
    if (!shippingPincode) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Shipping address pincode is required",
        debug: {
          availableFields: Object.keys(shippingAddress),
          receivedPinCode: shippingAddress.pinCode,
          receivedPincode: shippingAddress.pincode
        }
      });
    }

    const productIds = items.map(item => item.product);

    const products = await Product.find({ 
      _id: { $in: productIds } 
    }).populate('seller').session(session);

    products.forEach((product, index) => {
      console.log(`  Product ${index + 1}:`, {
        id: product._id.toString(),
        name: product.name,
        serviceablePincodes: product.serviceablePincodes,
        serviceablePincodesCount: product.serviceablePincodes?.length || 0
      });
    });
    
    const nonServiceableProducts = [];
    
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.product.toString());
      
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          error: `Product not found: ${item.product}`
        });
      }
      
      if (product.serviceablePincodes && product.serviceablePincodes.length > 0) {

        product.serviceablePincodes.forEach((pincode, idx) => {
          console.log(`  Pincode ${idx + 1}:`, {
            raw: pincode,
            type: typeof pincode,
            length: pincode.length,
            charCodes: Array.from(pincode.toString()).map(c => c.charCodeAt(0)),
            trimmed: pincode.toString().trim(),
            matches: pincode.toString().trim() === shippingPincode.toString().trim()
          });
        });

        const comparisonMethods = {
          direct: product.serviceablePincodes.includes(shippingPincode),
          stringDirect: product.serviceablePincodes.map(p => p.toString()).includes(shippingPincode.toString()),
          trimmed: product.serviceablePincodes.some(p => p.toString().trim() === shippingPincode.toString().trim()),
          loose: product.serviceablePincodes.some(p => p.toString().replace(/\s/g, '') === shippingPincode.toString().replace(/\s/g, '')),
          numberCompare: product.serviceablePincodes.some(p => parseInt(p) === parseInt(shippingPincode))
        };

        const isServiceable = product.serviceablePincodes.some(pincode => 
          pincode.toString().trim() === shippingPincode.toString().trim()
        );
        
        if (!isServiceable) {
          nonServiceableProducts.push({
            productId: product._id,
            productName: product.name,
            serviceablePincodes: product.serviceablePincodes,
            requestedPincode: shippingPincode,
            comparisonDetails: comparisonMethods
          });
        }
      } else {
        console.log('❌ No serviceable pincodes defined for product');
        nonServiceableProducts.push({
          productId: product._id,
          productName: product.name,
          serviceablePincodes: [],
          requestedPincode: shippingPincode
        });
      }
    }

    if (nonServiceableProducts.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Some products are not serviceable to your pincode",
        nonServiceableProducts,
        shippingPincode,
        debug: {
          pincodeAnalysis: {
            value: shippingPincode,
            type: typeof shippingPincode,
            length: shippingPincode.length,
            charCodes: Array.from(shippingPincode).map(c => c.charCodeAt(0)),
            sourceField: shippingAddress.pincode ? 'pincode' : 'pinCode'
          }
        }
      });
    }

    let total = 0;
    for (const item of items) {
      total += item.price * item.quantity;
    }

    let discount = 0;
    let finalAmount = total;

    if (coupon && coupon.discount) {
      discount = Math.min(coupon.discount, total);
      finalAmount = total - discount;
    }

    let walletDeduction = 0;
    let cashOnDelivery = finalAmount;
    let paymentStatus = "pending";

    if (useWallet) {
      const user = await User.findById(userId).session(session);
      
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          error: "User not found"
        });
      }

      const walletBalance = user.wallet || 0;
      
      if (walletBalance > 0) {
        walletDeduction = Math.min(walletBalance, finalAmount);
        cashOnDelivery = finalAmount - walletDeduction;

        user.wallet = parseFloat((walletBalance - walletDeduction).toFixed(2));
        await user.save({ session });

        console.log('📊 Updated wallet balance:', user.wallet);

        if (cashOnDelivery === 0) {
          paymentStatus = "paid";
        }
      } else {
        console.log('💸 Wallet balance is 0, skipping wallet deduction');
      }
    }

    const normalizedShippingAddress = {
      ...shippingAddress,
      pincode: shippingPincode
    };

    // Get the primary seller (first product's seller)
    const primarySeller = products[0]?.seller?._id;

    const order = new Order({
      user: userId,
      items,
      total,
      coupon: coupon || {},
      finalAmount,
      shippingAddress: normalizedShippingAddress,
      paymentMethod,
      paymentStatus,
      walletDeduction,
      cashOnDelivery,
      seller: primarySeller
    });

    await order.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    await order.populate('user', 'name phone email');

    const response = {
      success: true,
      message: "Order created successfully",
      order: {
        orderId: order.orderId,
        secretCode: order.secretCode,
        total,
        finalAmount,
        walletDeduction,
        cashOnDelivery,
        paymentStatus: order.paymentStatus,
        status: order.status,
        items: order.items,
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt
      }
    };

    return res.status(201).json(response);

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      debug: err.message
    });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    const orders = await Order.find({ user: userId })
      .populate('items.product')
      .populate('seller', 'name businessName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
};

exports.downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('seller', 'name businessName gstNumber panNumber address bankDetails')
      .populate({
        path: 'items.product',
        populate: [
          {
            path: 'seller',
            model: 'Seller',
            select: 'name businessName gstNumber panNumber address'
          },
          {
            path: 'category',
            model: 'Category',
            select: 'name'
          }
        ]
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    if (order.user._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }

    // If seller is not populated, try to get it from the first product
    if (!order.seller) {
      console.log('Seller not found in order, trying to get from first product...');
      const firstProduct = order.items[0]?.product;
      if (firstProduct?.seller) {
        order.seller = firstProduct.seller;
        console.log('Found seller from product:', order.seller.businessName);
      } else {
        // Create a default seller object if no seller is found
        order.seller = {
          businessName: 'Default Store',
          gstNumber: 'Not Available',
          address: {
            street: 'Not Available',
            city: 'Not Available',
            state: 'Not Available',
            pincode: 'Not Available'
          }
        };
        console.log('Using default seller');
      }
    }

    // Calculate GST and item totals
    let orderSubtotal = 0;
    let totalGST = 0;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;
    let deliveryFee = 25; // Fixed delivery fee

    const itemsWithGST = order.items.map(item => {
      const itemTotal = item.price * item.quantity;
      const gstRate = item.product?.gstPercent || 0;
      
      // Determine if within state or inter-state
      const sellerState = item.product?.seller?.address?.state;
      const shippingState = order.shippingAddress.state;
      const isWithinState = sellerState && shippingState && sellerState === shippingState;
      
      let gstAmount = 0;
      let cgstAmount = 0;
      let sgstAmount = 0;
      let igstAmount = 0;
      let taxableValue = itemTotal;

      // Handle tax-inclusive pricing
      if (item.product?.taxType === 'inclusive' && gstRate > 0) {
        // Calculate taxable value from inclusive price
        taxableValue = itemTotal / (1 + gstRate / 100);
        gstAmount = itemTotal - taxableValue;
      } else if (gstRate > 0) {
        // Exclusive tax - GST is additional
        gstAmount = (taxableValue * gstRate) / 100;
      }

      // Split GST into CGST/SGST or IGST
      if (gstAmount > 0) {
        if (isWithinState) {
          // Within state: CGST + SGST (50% each)
          cgstAmount = gstAmount / 2;
          sgstAmount = gstAmount / 2;
        } else {
          // Inter-state: IGST
          igstAmount = gstAmount;
        }
      }

      const itemWithTax = {
        ...item.toObject(),
        itemTotal,
        taxableValue,
        gstRate,
        gstAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalWithTax: taxableValue + gstAmount,
        isWithinState
      };

      orderSubtotal += itemTotal;
      totalGST += gstAmount;
      totalCGST += cgstAmount;
      totalSGST += sgstAmount;
      totalIGST += igstAmount;

      return itemWithTax;
    });

    // Calculate final amounts
    const grandTotalBeforeWallet = orderSubtotal + deliveryFee;
    const finalPayableAmount = order.cashOnDelivery > 0 ? order.cashOnDelivery : order.finalAmount;

    const invoiceData = {
      orderId: order.orderId,
      orderDate: order.createdAt,
      secretCode: order.secretCode,
      customer: {
        name: order.user.name,
        email: order.user.email,
        phone: order.user.phone
      },
      seller: order.seller,
      shippingAddress: order.shippingAddress,
      items: itemsWithGST,
      payment: {
        method: order.paymentMethod,
        status: order.paymentStatus,
        walletDeduction: order.walletDeduction,
        cashOnDelivery: order.cashOnDelivery,
        finalAmount: order.finalAmount
      },
      summary: {
        subtotal: orderSubtotal,
        deliveryFee: deliveryFee,
        totalBeforeWallet: grandTotalBeforeWallet,
        totalGST: totalGST,
        totalCGST: totalCGST,
        totalSGST: totalSGST,
        totalIGST: totalIGST,
        grandTotal: finalPayableAmount,
        walletDeduction: order.walletDeduction,
        payableAmount: finalPayableAmount
      },
      gstSummary: {
        withinState: totalCGST > 0 || totalSGST > 0,
        interState: totalIGST > 0
      }
    };

    console.log('Invoice data prepared:', {
      orderId: invoiceData.orderId,
      seller: invoiceData.seller ? {
        businessName: invoiceData.seller.businessName,
        hasAddress: !!invoiceData.seller.address
      } : 'No seller',
      itemsCount: invoiceData.items.length
    });

    const pdfBuffer = await this.generatePDFInvoice(invoiceData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);

  } catch (err) {
    console.error('Invoice generation error:', err);
    return res.status(500).json({
      success: false,
      error: "Failed to generate invoice"
    });
  }
};

exports.generatePDFInvoice = async (invoiceData) => {
  const PDFDocument = require('pdfkit');
  
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      doc.fillColor('#1e40af')
         .rect(0, 0, 600, 80)
         .fill();
      
      doc.fillColor('#ffffff')
         .fontSize(20)
         .font('Helvetica-Bold')
         .text('Fast 2', 50, 30);
      
      doc.fontSize(10)
         .text('TAX INVOICE', 50, 55);

      doc.font('Helvetica')
         .fontSize(8)
         .text('GSTIN: 07AABCU9603R1ZM', 400, 35, { align: 'right' })
         .text('PAN: AABCU9603R', 400, 47, { align: 'right' })
         .text('123 Business Street, Delhi - 110001', 400, 59, { align: 'right' });

      let yPosition = 100;

      doc.fillColor('#000000')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('Invoice Details:', 50, yPosition);
      
      doc.font('Helvetica')
         .text(`Invoice Number: ${invoiceData.orderId}`, 150, yPosition)
         .text(`Invoice Date: ${new Date(invoiceData.orderDate).toLocaleDateString('en-IN')}`, 350, yPosition);
      
      yPosition += 15;
      doc.text(`Order Number: ${invoiceData.orderId}`, 150, yPosition)
         .text(`Place of Supply: ${invoiceData.shippingAddress.state}`, 350, yPosition);

      yPosition += 25;

      doc.font('Helvetica-Bold')
         .text('Sold By:', 50, yPosition);
      
      const sellerName = invoiceData.seller?.businessName || 'Store';
      const sellerGST = invoiceData.seller?.gstNumber || 'Not Available';
      
      doc.font('Helvetica')
         .text(sellerName, 150, yPosition)
         .text(`GSTIN: ${sellerGST}`, 350, yPosition);
      
      yPosition += 12;
      
      const sellerAddress = invoiceData.seller?.address ? 
        `${invoiceData.seller.address.street || ''}, ${invoiceData.seller.address.city || ''}, ${invoiceData.seller.address.state || ''} - ${invoiceData.seller.address.pincode || ''}` : 
        'Address not available';
      
      doc.text(sellerAddress, 150, yPosition, { width: 200 });

      yPosition += 25;

      doc.font('Helvetica-Bold')
         .text('Bill To:', 50, yPosition);
      
      doc.font('Helvetica')
         .text(invoiceData.customer.name, 150, yPosition)
         .text(`Phone: ${invoiceData.customer.phone}`, 350, yPosition);
      
      yPosition += 12;
      doc.text(invoiceData.shippingAddress.addressLine, 150, yPosition, { width: 200 })
         .text(`Email: ${invoiceData.customer.email}`, 350, yPosition);
      
      yPosition += 12;
      doc.text(`${invoiceData.shippingAddress.city}, ${invoiceData.shippingAddress.state} - ${invoiceData.shippingAddress.pinCode}`, 150, yPosition);

      yPosition += 30;

      doc.font('Helvetica-Bold')
         .fontSize(9);
      
      doc.text('Description', 50, yPosition);
      doc.text('HSN', 200, yPosition);
      doc.text('Qty', 250, yPosition);
      doc.text('Rate', 280, yPosition);
      doc.text('Amount', 320, yPosition);
      doc.text('GST%', 370, yPosition);
      doc.text('Taxable', 400, yPosition);
      doc.text('GST', 450, yPosition);
      doc.text('Total', 500, yPosition);

      yPosition += 12;
      doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 5;

      doc.font('Helvetica')
         .fontSize(8);
      
      invoiceData.items.forEach((item, index) => {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
          doc.font('Helvetica-Bold').fontSize(9);
          doc.text('Description', 50, yPosition);
          doc.text('HSN', 200, yPosition);
          doc.text('Qty', 250, yPosition);
          doc.text('Rate', 280, yPosition);
          doc.text('Amount', 320, yPosition);
          doc.text('GST%', 370, yPosition);
          doc.text('Taxable', 400, yPosition);
          doc.text('GST', 450, yPosition);
          doc.text('Total', 500, yPosition);
          yPosition += 12;
          doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
          yPosition += 5;
          doc.font('Helvetica').fontSize(8);
        }

        const product = item.product;
        doc.text(product?.name || 'Product', 50, yPosition, { width: 140 });
        doc.text(product?.hsnCode || 'N/A', 200, yPosition);
        doc.text(item.quantity.toString(), 250, yPosition);
        doc.text(`₹${item.price.toFixed(2)}`, 280, yPosition);
        doc.text(`₹${item.itemTotal.toFixed(2)}`, 320, yPosition);
        doc.text(`${item.gstRate}%`, 370, yPosition);
        doc.text(`₹${item.taxableValue.toFixed(2)}`, 400, yPosition);
        doc.text(`₹${item.gstAmount.toFixed(2)}`, 450, yPosition);
        doc.text(`₹${item.totalWithTax.toFixed(2)}`, 500, yPosition);
        
        yPosition += 20;
      });

      yPosition += 10;
      doc.moveTo(350, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 5;

      doc.fontSize(9);
      doc.text('Subtotal:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.subtotal.toFixed(2)}`, 500, yPosition, { align: 'right' });
      
      yPosition += 12;
      doc.text('Delivery Charges:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.deliveryFee.toFixed(2)}`, 500, yPosition, { align: 'right' });

      yPosition += 12;
      doc.text('Total Before Tax:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.totalBeforeWallet.toFixed(2)}`, 500, yPosition, { align: 'right' });

      // GST Breakdown
      if (invoiceData.summary.totalCGST > 0) {
        yPosition += 12;
        doc.text('CGST:', 400, yPosition);
        doc.text(`₹${invoiceData.summary.totalCGST.toFixed(2)}`, 500, yPosition, { align: 'right' });
      }

      if (invoiceData.summary.totalSGST > 0) {
        yPosition += 12;
        doc.text('SGST:', 400, yPosition);
        doc.text(`₹${invoiceData.summary.totalSGST.toFixed(2)}`, 500, yPosition, { align: 'right' });
      }

      if (invoiceData.summary.totalIGST > 0) {
        yPosition += 12;
        doc.text('IGST:', 400, yPosition);
        doc.text(`₹${invoiceData.summary.totalIGST.toFixed(2)}`, 500, yPosition, { align: 'right' });
      }

      yPosition += 12;
      doc.text('Total GST:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.totalGST.toFixed(2)}`, 500, yPosition, { align: 'right' });

      if (invoiceData.payment.walletDeduction > 0) {
        yPosition += 12;
        doc.text('Wallet Deduction:', 400, yPosition);
        doc.text(`-₹${invoiceData.payment.walletDeduction.toFixed(2)}`, 500, yPosition, { align: 'right' });
      }

      yPosition += 15;
      doc.moveTo(400, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 5;

      doc.font('Helvetica-Bold')
         .fontSize(11);
      doc.text('Grand Total:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.payableAmount.toFixed(2)}`, 500, yPosition, { align: 'right' });

      yPosition += 30;
      doc.font('Helvetica')
         .fontSize(9);
      doc.text('Payment Details:', 50, yPosition);
      yPosition += 12;
      doc.text(`Method: ${invoiceData.payment.method.toUpperCase()}`, 50, yPosition);
      doc.text(`Status: ${invoiceData.payment.status}`, 200, yPosition);
      
      if (invoiceData.secretCode) {
        yPosition += 12;
        doc.text(`Secret Code: ${invoiceData.secretCode}`, 50, yPosition);
      }

      yPosition += 25;
      doc.font('Helvetica-Bold')
         .text('GST Summary:', 50, yPosition);
      
      yPosition += 15;
      doc.font('Helvetica')
         .fontSize(8);
      
      if (invoiceData.gstSummary.withinState) {
        doc.text(`Within State Supply (CGST + SGST): ₹${invoiceData.summary.totalCGST.toFixed(2)} + ₹${invoiceData.summary.totalSGST.toFixed(2)}`, 50, yPosition);
        yPosition += 10;
      }
      
      if (invoiceData.gstSummary.interState) {
        doc.text(`Inter-State Supply (IGST): ₹${invoiceData.summary.totalIGST.toFixed(2)}`, 50, yPosition);
        yPosition += 10;
      }

      doc.fontSize(7)
         .text('This is a computer-generated invoice and does not require a physical signature.', 50, 750, { align: 'center' })
         .text('Thank you for your business!', 50, 760, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

exports.updateOrderStatus = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied, admin only" });
    }

    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { status },
      { new: true }
    ).populate("items.product");

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(order);
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ message: "Server error" });
  }
};