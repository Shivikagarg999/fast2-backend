const express = require('express');
const router = express.Router();
const {
  registerDriver,
  loginDriver,
  getDriverProfile,
  uploadDocuments,
  updateProfilePhoto,
  completeDriverProfile,
  getImageKitAuth
} = require('../../controllers/driver/driverAuthController');
const { authenticateToken } = require('../../middlewares/driverAuth');
const upload = require('../../middlewares/upload');

// Public routes
router.post('/register', 
  upload.fields([
    { name: 'aadharFront', maxCount: 1 },
    { name: 'aadharBack', maxCount: 1 },
    { name: 'panCard', maxCount: 1 } 
  ]),
  registerDriver
);

router.post('/login', loginDriver);

// Protected routes
router.get('/profile', authenticateToken, getDriverProfile);

router.post('/upload-documents', 
  authenticateToken,
  upload.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 },
    { name: 'rcDocument', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
  ]),
  uploadDocuments
);

router.put('/profile-photo',
  authenticateToken,
  upload.single('profilePhoto'),
  updateProfilePhoto
);

router.post('/complete-profile', authenticateToken, completeDriverProfile);
router.get('/imagekit-auth', authenticateToken, getImageKitAuth);

module.exports = router;