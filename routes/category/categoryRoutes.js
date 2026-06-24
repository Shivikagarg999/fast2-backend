const express = require('express');
const multer = require('multer');
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  bulkDeleteCategories,
  downloadCategoriesCSV,
  downloadCategoryUploadTemplate,
  uploadCategoriesCSV
} = require('../../controllers/category/categoryController');
const upload = require('../../middlewares/upload');

const router = express.Router();

const csvUpload = multer({
  dest: 'uploads/csv/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

router.post('/create', upload.single('image'), createCategory);
router.get('/getall', getCategories);
router.get('/download/csv', downloadCategoriesCSV);
router.get('/download/template', downloadCategoryUploadTemplate);
router.post('/upload/csv', csvUpload.single('csvFile'), uploadCategoriesCSV);
router.get('/:id', getCategoryById);
router.put('/update/:id', upload.single('image'), updateCategory);
router.delete('/delete/:id', deleteCategory);
router.post('/bulk-delete', bulkDeleteCategories);

module.exports = router;