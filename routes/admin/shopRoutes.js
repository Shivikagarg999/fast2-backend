const express = require('express');
const router = express.Router();
const adminShopController = require('../../controllers/admin/shop');
const { adminAuth } = require('../../middlewares/adminAuth');
const upload = require('../../middlewares/upload');

// All routes here should be protected by admin authentication
router.use(adminAuth);

router.get('/', adminShopController.getAllShops);
router.post('/', adminShopController.createShop);
router.get('/:id', adminShopController.getShopDetails);
router.put(
    '/:id',
    upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'coverImage', maxCount: 1 },
        { name: 'video', maxCount: 1 },
    ]),
    adminShopController.updateShop
);
router.patch('/:id/verify', adminShopController.toggleVerification);
router.patch('/:id/status', adminShopController.toggleActiveStatus);
router.post('/:id/badges', adminShopController.manageBadges);
router.delete('/:id', adminShopController.deleteShop);

module.exports = router;
