const express = require("express");
const router = express.Router();
const profileController = require("../../controllers/user/profileController");
const authMiddleware = require("../../middlewares/userauth");

router.get("/", authMiddleware, profileController.getProfile);
router.put("/", authMiddleware, profileController.updateProfile);
router.put("/avatar", authMiddleware, profileController.uploadAvatar);
router.delete("/", authMiddleware, profileController.deleteAccount);

module.exports = router;
