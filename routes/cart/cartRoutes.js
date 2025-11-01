const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middlewares/userauth");
const {
  getCart,
  addToCart,
  getCartCount,
  updateCartItem,
  removeFromCart,
  clearCart
} = require("../../controllers/cart/cartController");

router.get("/", authMiddleware, getCart);
router.post("/add", authMiddleware, addToCart);
router.post("/getCount", authMiddleware, getCartCount);
router.put("/update/:itemId", authMiddleware, updateCartItem);
router.delete("/remove/:itemId", authMiddleware, removeFromCart);
router.delete("/clear", authMiddleware, clearCart);

module.exports = router;