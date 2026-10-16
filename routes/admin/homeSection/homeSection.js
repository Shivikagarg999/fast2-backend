const express = require('express');
const router = express.Router();
const upload = require('../../../middlewares/upload');
const { adminAuth } = require('../../../middlewares/adminAuth');
const {
  uploadImage,
  createHomeSection,
  updateHomeSection,
  deleteHomeSection,
  getHomeSectionsAdmin,
  reorderHomeSections
} = require('../../../controllers/admin/homeSection/homeSectionController');

router.get('/', adminAuth, getHomeSectionsAdmin);
router.post('/upload-image', adminAuth, upload.single('image'), uploadImage);
router.post('/', adminAuth, createHomeSection);
router.put('/reorder', adminAuth, reorderHomeSections);
router.put('/:id', adminAuth, updateHomeSection);
router.delete('/:id', adminAuth, deleteHomeSection);

module.exports = router;
