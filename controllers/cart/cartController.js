const Cart = require("../../models/cart");
const Product = require("../../models/product");
const { getActiveDiscounts, getEffectivePrice } = require('../../utils/discountHelper');

// Core add-to-cart logic, shared by the HTTP handler below and the chatbot's
// add_to_cart tool. Throws an Error with .statusCode on failure.
const addItemToCart = async (userId, productId, quantity) => {
  const product = await Product.findById(productId).populate('category');
  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  const gstPercent = product.category?.gstPercent || 0;
  const discounts = await getActiveDiscounts();
  const { effectivePrice } = getEffectivePrice(product, discounts);

  if (product.quantity < quantity) {
    const error = new Error(`Only ${product.quantity} items available in stock`);
    error.statusCode = 400;
    throw error;
  }

  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    cart = new Cart({
      user: userId,
      items: [{ product: productId, quantity, price: effectivePrice, gstPercent }]
    });
  } else {
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (existingItemIndex > -1) {
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      if (product.quantity < newQuantity) {
        const error = new Error(`Only ${product.quantity} items available in stock`);
        error.statusCode = 400;
        throw error;
      }
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].price = effectivePrice;
    } else {
      cart.items.push({ product: productId, quantity, price: effectivePrice, gstPercent });
    }
  }

  await cart.save();
  await cart.populate({
    path: "items.product",
    populate: [
      { path: "shop" },
      { path: "seller", populate: { path: "shop" } }
    ]
  });

  return cart;
};

// Get user's cart
const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate({
      path: "items.product",
      populate: [
        { path: "shop" },
        { path: "seller", populate: { path: "shop" } },
        { path: "category" }
      ]
    });

    if (!cart) {
      return res.status(200).json({ items: [], total: 0, totalGst: 0, finalAmount: 0 });
    }

    // Recompute GST from category on every fetch so old items (pre-schema-change) work correctly
    let total = 0;
    let totalGst = 0;
    const cartObj = cart.toObject();

    cartObj.items = cartObj.items.map(item => {
      const gstPercent = item.gstPercent || item.product?.category?.gstPercent || 0;
      const itemSubtotal = item.price * item.quantity;
      const gstAmount = parseFloat(((itemSubtotal * gstPercent) / 100).toFixed(2));
      total += itemSubtotal;
      totalGst += gstAmount;
      return { ...item, gstPercent, gstAmount };
    });

    cartObj.total = parseFloat(total.toFixed(2));
    cartObj.totalGst = parseFloat(totalGst.toFixed(2));
    cartObj.finalAmount = parseFloat((total + totalGst).toFixed(2));

    console.log('--- Cart Fetch for Checkout ---');
    console.log('Cart Items with Population:', cartObj.items.map(item => ({
      product: item.product?._id,
      shopType: item.product?.shop?.shopType,
      sellerShopType: item.product?.seller?.shop?.shopType
    })));

    res.status(200).json(cartObj);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const cart = await addItemToCart(req.user._id, productId, quantity);
    res.status(200).json(cart);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

// Get Cart Count 
const getCartCount = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      return res.status(200).json({ count: 0 });
    }
    
    const count = cart.items.reduce((total, item) => total + item.quantity, 0);
    
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update item quantity in cart
const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const { itemId } = req.params;
    
    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: "Invalid quantity" });
    }
    
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    
    const itemIndex = cart.items.findIndex(
      item => item._id.toString() === itemId
    );
    
    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not found in cart" });
    }
    
    // Check product stock
    const product = await Product.findById(cart.items[itemIndex].product);
    if (product.quantity < quantity) {
      return res.status(400).json({ 
        message: `Only ${product.quantity} items available in stock` 
      });
    }
    
    cart.items[itemIndex].quantity = quantity;
    await cart.save();
    await cart.populate({
      path: "items.product",
      populate: [
        { path: "shop" },
        { path: "seller", populate: { path: "shop" } }
      ]
    });
    
    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    
    cart.items = cart.items.filter(
      item => item._id.toString() !== itemId
    );
    
    await cart.save();
    await cart.populate({
      path: "items.product",
      populate: [
        { path: "shop" },
        { path: "seller", populate: { path: "shop" } }
      ]
    });
    
    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Clear cart
const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    
    cart.items = [];
    await cart.save();
    
    res.status(200).json({ message: "Cart cleared successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCart,
  addToCart,
  addItemToCart,
  getCartCount,
  updateCartItem,
  removeFromCart,
  clearCart
};