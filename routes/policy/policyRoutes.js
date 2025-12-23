const express = require('express');
const router = express.Router();
const policyController = require('../../controllers/policy/policyController');

router.get('/active', policyController.getAllActivePolicies);
router.get('/active/:policyType', policyController.getActivePolicyByType);
router.get('/', policyController.getAllPolicies);
router.get('/:id', policyController.getPolicyById);
router.post('/', policyController.createPolicy);
router.put('/:id', policyController.updatePolicy);
router.patch('/:id/activate', policyController.activatePolicy);
router.delete('/:id', policyController.deletePolicy);

module.exports = router;