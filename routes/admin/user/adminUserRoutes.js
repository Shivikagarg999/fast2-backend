const express = require("express");
const {
  createUser,
  getAllUsers,
  getUserById,
  getUserDetails,
  updateUser,
  deleteUser,
  addMoneyToWallet,
  downloadUsersByStatusCSV,
  getReferralOverview
} = require("../../../controllers/admin/user/adminUserController");

const router = express.Router();

router.post("/users", createUser);
router.get("/users", getAllUsers);
router.get("/users/referrals", getReferralOverview);
router.get("/users/:id/details", getUserDetails);
router.get("/users/:id", getUserById);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.post("/users/:id/wallet/add", addMoneyToWallet);
router.get("/users/download/csv", downloadUsersByStatusCSV);

module.exports = router;