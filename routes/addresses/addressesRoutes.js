const express = require("express");
const router = express.Router();
const addressController = require("../../controllers/addresses/addressesControllers");
const authMiddleware = require("../../middlewares/userauth");

router.use(authMiddleware);

router.post("/create", addressController.createAddress);
router.get("/get", addressController.getAddresses); 
router.put("/update/:id", addressController.updateAddress); 
router.delete("/delete/:id", addressController.deleteAddress); 
router.patch("/:id/default", addressController.setDefaultAddress); 

module.exports = router;