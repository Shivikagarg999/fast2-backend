const express = require('express');
const router = express.Router();
const promotorController = require('../../../controllers/admin/promotor/promotor');

router.post('/', promotorController.createPromotor);
router.get('/', promotorController.getPromotors);
router.get('/:id', promotorController.getPromotorById);
router.put('/:id', promotorController.updatePromotor);
router.delete('/:id', promotorController.deletePromotor);

module.exports = router;
