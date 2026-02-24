const Seller = require('../../models/seller');
const Promotor = require('../../models/promotor');
const Shop = require('../../models/shop');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerSeller = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      businessName,
      gstNumber,
      panNumber,
      address,
      bankDetails,
      promotor
    } = req.body;

    const existingSeller = await Seller.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingSeller) {
      return res.status(400).json({
        success: false,
        message: 'Seller with this email or phone already exists'
      });
    }

    const promotorData = await Promotor.findById(promotor);
    if (!promotorData) {
      return res.status(404).json({
        success: false,
        message: 'Promotor not found'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newSeller = new Seller({
      name,
      email,
      phone,
      password: hashedPassword,
      businessName,
      gstNumber,
      panNumber,
      address,
      bankDetails,
      promotor,
      approvalStatus: 'pending'
    });

    await newSeller.save();

    // ── Auto-create a Shop for this seller ─────────────────────────────────────
    try {
      const newShop = new Shop({
        seller: newSeller._id,
        shopName: businessName,
        contactEmail: email,
        contactPhone: phone,
        description: '',
        address: address || {},
      });
      await newShop.save();
      // Store shop ref on seller
      newSeller.shop = newShop._id;
      await newSeller.save();
    } catch (shopError) {
      // Shop creation failure shouldn't block seller registration
      console.error('Auto shop creation error:', shopError);
    }

    res.status(201).json({
      success: true,
      message: 'Seller registered successfully. Awaiting admin approval.',
      data: {
        seller: {
          id: newSeller._id,
          name: newSeller.name,
          email: newSeller.email,
          businessName: newSeller.businessName,
          approvalStatus: newSeller.approvalStatus
        },
        promotor: {
          id: promotorData._id,
          name: promotorData.name,
          city: promotorData.address.city
        }
      }
    });

  } catch (error) {
    console.error('Seller registration error:', error);

    if (req.body.email) {
      await Seller.findOneAndDelete({ email: req.body.email });
    }

    res.status(500).json({
      success: false,
      message: 'Error registering seller',
      error: error.message
    });
  }
};

exports.loginSeller = async (req, res) => {
  try {
    const { email, password } = req.body;

    const seller = await Seller.findOne({ email });
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    const token = jwt.sign(
      { id: seller._id, email: seller.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      seller: {
        id: seller._id,
        name: seller.name,
        email: seller.email,
        approvalStatus: seller.approvalStatus
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
};