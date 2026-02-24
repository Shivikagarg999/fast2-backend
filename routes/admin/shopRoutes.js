const express = require('express');
const router = express.Router();
const adminShopController = require('../../controllers/admin/shop');
const { adminAuth } = require('../../middlewares/adminAuth');

// All routes here should be protected by admin authentication
router.use(adminAuth);

router.get('/', adminShopController.getAllShops);
router.post('/', adminShopController.createShop);
router.get('/:id', adminShopController.getShopDetails);
router.put('/:id', adminShopController.updateShop);
router.patch('/:id/verify', adminShopController.toggleVerification);
router.patch('/:id/status', adminShopController.toggleActiveStatus);
router.post('/:id/badges', adminShopController.manageBadges);
router.delete('/:id', adminShopController.deleteShop);

module.exports = router;
