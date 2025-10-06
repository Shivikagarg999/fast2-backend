const Driver = require('../../models/driver');
const jwt = require('jsonwebtoken');
const imagekit = require('../../utils/imagekit');

// Helper function to upload buffer to ImageKit
const uploadBufferToImageKit = async (buffer, fileName) => {
  try {
    const uploadResponse = await imagekit.upload({
      file: buffer,
      fileName: fileName,
      folder: "/delivery_app/drivers"
    });
    return uploadResponse.url;
  } catch (error) {
    console.error('ImageKit upload error:', error);
    throw new Error('Failed to upload image');
  }
};

// Helper function to generate JWT token
const generateToken = (driverId) => {
  return jwt.sign(
    { driverId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Helper function to prepare driver data for response
const prepareDriverData = (driver) => {
  return {
    _id: driver._id,
    personalInfo: {
      name: driver.personalInfo.name,
      email: driver.personalInfo.email,
      phone: driver.personalInfo.phone,
      profilePhoto: driver.personalInfo.profilePhoto,
      dateOfBirth: driver.personalInfo.dateOfBirth,
      gender: driver.personalInfo.gender
    },
    workInfo: {
      driverId: driver.workInfo.driverId,
      status: driver.workInfo.status,
      availability: driver.workInfo.availability,
      joiningDate: driver.workInfo.joiningDate
    },
    auth: {
      isVerified: driver.auth.isVerified
    },
    address: driver.address,
    vehicle: driver.vehicle,
    deliveryStats: driver.deliveryStats,
    earnings: driver.earnings
  };
};

// @desc    Register driver with FormData
// @route   POST /api/driver/auth/register
// @access  Public
const registerDriver = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    
    // Check if files are present
    if (!req.files || !req.files['aadharFront'] || !req.files['aadharBack'] || !req.files['panCard']) {
      return res.status(400).json({
        success: false,
        message: 'Aadhar front, back and PAN card images are required'
      });
    }

    // Basic validation
    if (!name || !email || !phone || !password ) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if driver already exists
    const existingDriver = await Driver.findOne({
      $or: [
        { 'personalInfo.email': email.toLowerCase() },
        { 'personalInfo.phone': phone }
      ]
    });

    if (existingDriver) {
      return res.status(409).json({
        success: false,
        message: 'Driver already exists with this email or phone'
      });
    }

    // Upload Aadhar images to ImageKit
    const aadharFrontFile = req.files['aadharFront'][0];
    const aadharBackFile = req.files['aadharBack'][0];
    const panCardFile = req.files['panCard'][0];
    
    const aadharFrontUrl = await uploadBufferToImageKit(
      aadharFrontFile.buffer,
      `drivers/aadhar/${phone}_front.jpg`
    );

    const aadharBackUrl = await uploadBufferToImageKit(
      aadharBackFile.buffer,
      `drivers/aadhar/${phone}_back.jpg`
    );

    const panCardUrl = await uploadBufferToImageKit(
      panCardFile.buffer,
      `drivers/pan/${phone}_pan.jpg`
    );

    // Create driver
    const driver = new Driver({
      personalInfo: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim()
      },
      auth: { password },
      documents: {
        aadharCard: {
          frontImage: aadharFrontUrl,
          backImage: aadharBackUrl
        },
        panCard: {
          image: panCardUrl
        }
      }
    });

    await driver.save();
    const token = generateToken(driver._id);

    res.status(201).json({
      success: true,
      message: 'Driver registered successfully',
      token,
      driver: prepareDriverData(driver)
    });

  } catch (error) {
    console.error('Registration error:', error);

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Login driver
// @route   POST /api/driver/auth/login
// @access  Public
const loginDriver = async (req, res) => {
  try {
    const { email, phone, password, fcmToken } = req.body;

    if (!password || (!email && !phone)) {
      return res.status(400).json({
        success: false,
        message: 'Email/phone and password are required'
      });
    }

    // Find driver
    let driver;
    if (email) {
      driver = await Driver.findOne({ 'personalInfo.email': email.toLowerCase() });
    } else {
      driver = await Driver.findOne({ 'personalInfo.phone': phone });
    }

    if (!driver) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await driver.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check driver status
    

    // Update FCM token and last login
    if (fcmToken) {
      driver.auth.fcmToken = fcmToken;
    }
    driver.auth.lastLogin = new Date();
    driver.activity.lastActive = new Date();
    await driver.save();

    // Generate token
    const token = generateToken(driver._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      driver: prepareDriverData(driver)
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get driver profile
// @route   GET /api/driver/auth/profile
// @access  Private
const getDriverProfile = async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver.driverId).select('-auth.password -documents -bankDetails');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.status(200).json({
      success: true,
      driver: prepareDriverData(driver)
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Upload documents with FormData
// @route   POST /api/driver/auth/upload-documents
// @access  Private
const uploadDocuments = async (req, res) => {
  try {
    const { documentType } = req.body;
    
    if (!req.files) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const uploadedUrls = {};

    // Upload each file
    for (const [fieldName, files] of Object.entries(req.files)) {
      const file = files[0];
      const fileName = `drivers/${documentType}/${driver.personalInfo.phone}_${fieldName}.jpg`;
      const url = await uploadBufferToImageKit(file.buffer, fileName);
      uploadedUrls[fieldName] = url;
    }

    // Update driver documents based on type
    if (documentType === 'license') {
      driver.documents.drivingLicense = {
        ...driver.documents.drivingLicense,
        number: req.body.licenseNumber || driver.documents.drivingLicense.number,
        expiryDate: req.body.expiryDate || driver.documents.drivingLicense.expiryDate,
        ...uploadedUrls
      };
    } else if (documentType === 'vehicle') {
      driver.vehicle = {
        ...driver.vehicle,
        type: req.body.vehicleType || driver.vehicle.type,
        make: req.body.vehicleMake || driver.vehicle.make,
        model: req.body.vehicleModel || driver.vehicle.model,
        registrationNumber: req.body.registrationNumber || driver.vehicle.registrationNumber,
        color: req.body.vehicleColor || driver.vehicle.color,
        ...uploadedUrls
      };
    } else if (documentType === 'profile') {
      if (uploadedUrls.profilePhoto) {
        driver.personalInfo.profilePhoto = uploadedUrls.profilePhoto;
      }
    }

    await driver.save();

    res.status(200).json({
      success: true,
      message: 'Documents uploaded successfully',
      uploadedUrls
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading documents'
    });
  }
};

// @desc    Update profile photo with FormData
// @route   PUT /api/driver/auth/profile-photo
// @access  Private
const updateProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Profile photo is required'
      });
    }

    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const profilePhotoUrl = await uploadBufferToImageKit(
      req.file.buffer,
      `drivers/profile/${driver.personalInfo.phone}_profile_${Date.now()}.jpg`
    );

    driver.personalInfo.profilePhoto = profilePhotoUrl;
    await driver.save();

    res.status(200).json({
      success: true,
      message: 'Profile photo updated successfully',
      profilePhoto: profilePhotoUrl
    });

  } catch (error) {
    console.error('Profile photo error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile photo'
    });
  }
};

// @desc    Complete driver profile
// @route   POST /api/driver/auth/complete-profile
// @access  Private
const completeDriverProfile = async (req, res) => {
  try {
    const {
      dateOfBirth,
      gender,
      address,
      vehicleType,
      vehicleMake,
      vehicleModel,
      registrationNumber,
      vehicleColor,
      licenseNumber,
      expiryDate,
      bankDetails,
      emergencyContact
    } = req.body;

    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Update basic info
    if (dateOfBirth) driver.personalInfo.dateOfBirth = dateOfBirth;
    if (gender) driver.personalInfo.gender = gender;
    
    // Update address
    if (address) {
      try {
        const addressData = typeof address === 'string' ? JSON.parse(address) : address;
        driver.address.currentAddress = addressData;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid address format'
        });
      }
    }

    // Update vehicle info
    if (vehicleType || vehicleMake || vehicleModel || registrationNumber || vehicleColor) {
      driver.vehicle = {
        type: vehicleType || driver.vehicle.type,
        make: vehicleMake || driver.vehicle.make,
        model: vehicleModel || driver.vehicle.model,
        registrationNumber: registrationNumber || driver.vehicle.registrationNumber,
        color: vehicleColor || driver.vehicle.color,
        rcDocument: driver.vehicle.rcDocument || ''
      };
    }

    // Update license info
    if (licenseNumber || expiryDate) {
      driver.documents.drivingLicense = {
        number: licenseNumber || driver.documents.drivingLicense.number,
        expiryDate: expiryDate || driver.documents.drivingLicense.expiryDate,
        frontImage: driver.documents.drivingLicense.frontImage || '',
        backImage: driver.documents.drivingLicense.backImage || ''
      };
    }

    // Update bank details
    if (bankDetails) {
      try {
        const bankData = typeof bankDetails === 'string' ? JSON.parse(bankDetails) : bankDetails;
        driver.bankDetails = bankData;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid bank details format'
        });
      }
    }

    // Update emergency contact
    if (emergencyContact) {
      try {
        const emergencyData = typeof emergencyContact === 'string' ? JSON.parse(emergencyContact) : emergencyContact;
        driver.emergencyContact = emergencyData;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid emergency contact format'
        });
      }
    }

    driver.auth.isVerified = true;
    await driver.save();

    res.status(200).json({
      success: true,
      message: 'Profile completed successfully',
      driver: prepareDriverData(driver)
    });

  } catch (error) {
    console.error('Complete profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get ImageKit authentication
// @route   GET /api/driver/auth/imagekit-auth
// @access  Private
const getImageKitAuth = (req, res) => {
  try {
    const authParameters = imagekit.getAuthenticationParameters();
    res.json({
      success: true,
      ...authParameters
    });
  } catch (error) {
    console.error('ImageKit auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating upload auth'
    });
  }
};

module.exports = {
  registerDriver,
  loginDriver,
  getDriverProfile,
  uploadDocuments,
  updateProfilePhoto,
  completeDriverProfile,
  getImageKitAuth
};