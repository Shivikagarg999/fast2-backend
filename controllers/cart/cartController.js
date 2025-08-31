const Cart = require("../../models/cart");
const Product = require("../../models/product");

// Get user's cart
const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");
    
    if (!cart) {
      return res.status(200).json({ items: [], total: 0 });
    }
    
    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    
    // Validate input
    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ message: "Invalid input" });
    }
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    // Check if product is in stock
    if (product.quantity < quantity) {
      return res.status(400).json({ 
        message: `Only ${product.quantity} items available in stock` 
      });
    }
    
    // Find user's cart
    let cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      // Create new cart if it doesn't exist
      cart = new Cart({
        user: req.user._id,
        items: [{
          product: productId,
          quantity,
          price: product.price
        }]
      });
    } else {
      // Check if product already exists in cart
      const existingItemIndex = cart.items.findIndex(
        item => item.product.toString() === productId
      );
      
      if (existingItemIndex > -1) {
        // Update quantity if product exists
        const newQuantity = cart.items[existingItemIndex].quantity + quantity;
        
        // Check stock again with updated quantity
        if (product.quantity < newQuantity) {
          return res.status(400).json({ 
            message: `Only ${product.quantity} items available in stock` 
          });
        }
        
        cart.items[existingItemIndex].quantity = newQuantity;
      } else {
        // Add new item to cart
        cart.items.push({
          product: productId,
          quantity,
          price: product.price
        });
      }
    }
    
    await cart.save();
    await cart.populate("items.product");
    
    res.status(200).json(cart);
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
    await cart.populate("items.product");
    
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
    await cart.populate("items.product");
    
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
  updateCartItem,
  removeFromCart,
  clearCart
};