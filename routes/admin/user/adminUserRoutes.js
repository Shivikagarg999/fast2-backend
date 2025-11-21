const express = require("express");
const {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  addMoneyToWallet
} = require("../../../controllers/admin/user/adminUserController");

const router = express.Router();

router.post("/users", createUser);
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.post("/users/:id/wallet/add", addMoneyToWallet);

module.exports = router;