const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const controller = require('./controllers/order/order.js');

    const invoiceData = {
      orderId: 'TEST12345',
      orderDate: new Date(),
      secretCode: 'SC123',
      customer: { name: 'John Doe', email: 'john@example.com', phone: '9999999999' },
      seller: { businessName: 'Fallback Seller', gstNumber: 'GSTFALLBACK', address: { street: 'Fallback St', city: 'Fallback City', state: 'Fallback State', pincode: '000000' } },
      shippingAddress: { addressLine: '10 Downing St', city: 'London', state: 'State', pinCode: '123456' },
      items: [
        {
          product: {
            name: 'Test Product',
            hsnCode: '1234',
            seller: {
              businessName: 'Seller A',
              gstNumber: 'GST12345',
              address: { street: 'Shop Street 1', city: 'Gwalior', state: 'Madhya Pradesh', pincode: '474001' }
            }
          },
          quantity: 2,
          price: 100,
          itemTotal: 200,
          gstRate: 18,
          gstAmount: 36,
          taxableValue: 164,
          isWithinState: true
        }
      ],
      payment: { method: 'online', status: 'paid', walletDeduction: 0, cashOnDelivery: 0, finalAmount: 236 },
      summary: {
        subtotal: 200,
        deliveryFee: 20,
        handlingFee: 0,
        couponDiscount: 0,
        couponCode: null,
        totalBeforeWallet: 220,
        totalGST: 36,
        totalCGST: 18,
        totalSGST: 18,
        totalIGST: 0,
        grandTotal: 256,
        walletDeduction: 0,
        payableAmount: 236
      },
      gstSummary: { withinState: true, interState: false }
    };

    const buffer = await controller.generatePDFInvoice(invoiceData);
    const outPath = path.join(__dirname, 'invoice-test.pdf');
    fs.writeFileSync(outPath, buffer);
    console.log('WROTE', outPath);
  } catch (err) {
    console.error('TEST ERROR', err);
    process.exit(1);
  }
})();
