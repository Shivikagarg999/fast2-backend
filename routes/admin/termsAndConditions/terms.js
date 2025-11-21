const express = require('express');
const router = express.Router();
const {
  getTerms,
  getTerm,
  getActiveTerms,
  createTerm,
  updateTerm,
  deleteTerm,
  setActiveTerm
} = require('../../../controllers/admin/termsAndConditions/termsController');

// Public routes
router.get('/getall', getTerms);
router.get('/get/:id', getTerm);
router.get('/active', getActiveTerms);

// Admin routes (auth middleware to be added)
router.post('/create', createTerm);
router.put('/update/:id', updateTerm);
router.delete('/delete/:id', deleteTerm);
router.put('/set-active/:id', setActiveTerm);

module.exports = router;