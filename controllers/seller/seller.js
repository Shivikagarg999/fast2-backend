const Seller = require('../../models/seller');
const Warehouse= require('../../models/warehouse');
const Promotor= require('../../models/promotor');
const bcrypt = require('bcryptjs');

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

    let warehouse = await Warehouse.findOne({ promotor: promotor });
    
    if (!warehouse) {
      const warehouseCode = `WH${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
      
      warehouse = new Warehouse({
        name: `${promotorData.name}'s Warehouse`,
        code: warehouseCode,
        warehouseManager: promotorData.name,
        contact: promotorData.phone,
        promotor: promotor,
        location: {
          address: promotorData.address.street || 'Not specified',
          city: promotorData.address.city,
          state: promotorData.address.state,
          pincode: promotorData.address.pincode,
          coordinates: promotorData.address.coordinates || {}
        },
        serviceablePincodes: [promotorData.address.pincode],
        storageType: 'ambient',
        capacity: 10000,
        sellers: [],
        products: [],
        isActive: true
      });
      
      await warehouse.save();
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
      warehouse: warehouse._id, 
      approvalStatus: 'pending'
    });

    await newSeller.save();

    warehouse.sellers.push(newSeller._id);
    await warehouse.save();

    res.status(201).json({ 
      success: true,
      message: 'Seller registered successfully. Awaiting admin approval.',
      data: {
        seller: {
          id: newSeller._id,
          name: newSeller.name,
          email: newSeller.email,
          businessName: newSeller.businessName,
          approvalStatus: newSeller.approvalStatus,
          promotor: {
            id: promotorData._id,
            name: promotorData.name,
            city: promotorData.address.city
          }
        },
        warehouse: {
          id: warehouse._id,
          name: warehouse.name,
          code: warehouse.code,
          city: warehouse.location.city
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
    
    if (seller.approvalStatus !== 'approved') {
      return res.status(403).json({ message: 'Your account is not approved yet.' });
    }

    const isMatch = await bcrypt.compare(password, seller.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
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