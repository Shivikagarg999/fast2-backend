const express = require('express');
const { createCategory, getCategories, getCategoryById, updateCategory, deleteCategory } = require('../../controllers/category/categoryController');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post('/create', upload.single('image'), createCategory);
router.get('/getall', getCategories);
router.get('/:id', getCategoryById);
router.put('edit/:id', upload.single('image'), updateCategory);
router.delete('delete/:id', deleteCategory);

module.exports = router;