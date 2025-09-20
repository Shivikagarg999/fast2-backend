require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Routes
const authRoutes = require('./routes/user/authRoutes');
const productRoutes = require('./routes/product/productRoutes');
const categoryRoutes = require('./routes/category/categoryRoutes');
const cartRoutes = require('./routes/cart/cartRoutes');
const userProfileRoutes = require('./routes/user/profileRoutes');
const orderRoutes= require('./routes/order/orderRoutes');

// Admin routes
const adminRoutes = require('./routes/admin/adminRoutes');
const adminUserRoutes = require('./routes/admin/user/adminUserRoutes');
const adminPromotorRoutes = require('./routes/admin/promotor/promotor');
const adminWarehouseRoutes = require('./routes/admin/warehouse/warehouseRoutes');

const app = express();

// ✅ Allowed origins
const allowedOrigins = [
  "https://fast2.in",
  "https://www.fast2.in",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://fast2-admin.vercel.app",
  "https://admin.fast2.in"
];

// ✅ CORS Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// User Routes
app.use('/api/user', authRoutes);
app.use('/api/user/profile', userProfileRoutes);
app.use('/api/product', productRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/order', orderRoutes);

// Admin Routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminUserRoutes);
app.use('/api/admin/promotor', adminPromotorRoutes);
app.use('/api/admin/warehouse', adminWarehouseRoutes);

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// Test route
app.get('/', (req, res) => {
  res.send('🚀 Backend is running...');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
