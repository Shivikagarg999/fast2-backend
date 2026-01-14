const express = require('express');
const router = express.Router();
const {
  submitContact,
  getAllContacts,
  getContactById,
  updateContactStatus,
  deleteContact,
  getContactStats,
  exportContacts
} = require('../../controllers/contact/contactController');

router.post('/submit', submitContact);

router.get('/admin/contacts', getAllContacts);
router.get('/admin/contacts/:id', getContactById);
router.put('/admin/contacts/:id', updateContactStatus);
router.delete('/admin/contacts/:id', deleteContact);
router.get('/admin/stats', getContactStats);
router.get('/admin/export', exportContacts);

module.exports = router;