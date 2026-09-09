const express = require('express');
const {
  createSubcategory,
  getSubcategories,
  getSubcategoryById,
  updateSubcategory,
  deleteSubcategory,
  bulkDeleteSubcategories
} = require('../../controllers/subcategory/subcategoryController');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post('/create', upload.single('image'), createSubcategory);
router.get('/getall', getSubcategories);
router.get('/:id', getSubcategoryById);
router.put('/update/:id', upload.single('image'), updateSubcategory);
router.delete('/delete/:id', deleteSubcategory);
router.post('/bulk-delete', bulkDeleteSubcategories);

module.exports = router;
