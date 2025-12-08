require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/user/authRoutes');
const productRoutes = require('./routes/product/productRoutes');
const categoryRoutes = require('./routes/category/categoryRoutes');
const cartRoutes = require('./routes/cart/cartRoutes');
const userProfileRoutes = require('./routes/user/profileRoutes');
const orderRoutes= require('./routes/order/orderRoutes');
const addressesRoutes= require('./routes/addresses/addressesRoutes');
const sellerRoutes= require('./routes/seller/seller');
const referralRoutes= require('./routes/referral/referralRoutes');
const driverRoutes=require('./routes/driver/driverAuth');
const driverEarningRoutes= require('./routes/driverEarnings/driverEarnings');
const driverOrderRoutes= require('./routes/driver/driverRoutes');
const driverWithdrawRoutes=require('./routes/withdraw/withdraw');
const adminRoutes = require('./routes/admin/adminRoutes');
const adminUserRoutes = require('./routes/admin/user/adminUserRoutes');
const adminRoleRoutes = require('./routes/admin/role/roleRoutes');
const adminPromotorRoutes = require('./routes/admin/promotor/promotor');
const adminWarehouseRoutes = require('./routes/admin/warehouse/warehouseRoutes');
const adminDriverRoutes = require('./routes/admin/driver/driver');
const adminOrderRoutes = require('./routes/admin/order/order');
const adminBannerRoutes= require('./routes/admin/banner/banner');
const adminCouponRoutes= require('./routes/admin/coupon/coupon');
const adminDiscountRoutes= require('./routes/admin/discount/discount');
const adminSellerRoutes= require('./routes/admin/seller/seller');
const adminTermsRoutes= require('./routes/admin/termsAndConditions/terms');
const adminProductRoutes= require('./routes/admin/product/product');
const app = express();

const allowedOrigins = [
  "https://fast2.in",
  "https://www.fast2.in",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://fast2-admin.vercel.app",
  "https://admin.fast2.in",
  "https://www.admin.fast2.in",
  "https://seller.fast2.in",
  "https://www.seller.fast2.in",
  "http://localhost:5174"
];

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

app.use('/api/user', authRoutes);
app.use('/api/user/profile', userProfileRoutes);
app.use('/api/user/addresses', addressesRoutes);
app.use('/api/product', productRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/driver-earnings', driverEarningRoutes);
app.use('/api/driverOrder', driverOrderRoutes);
app.use('/api/driver/withdraw', driverWithdrawRoutes);
app.use('/api/admin/roles', adminRoleRoutes);
app.use('/api/admin/promotor', adminPromotorRoutes);
app.use('/api/admin/warehouse', adminWarehouseRoutes);
app.use('/api/admin/drivers', adminDriverRoutes);
app.use('/api/admin/orders', adminOrderRoutes);
app.use('/api/admin/banners', adminBannerRoutes);
app.use('/api/admin/coupon', adminCouponRoutes);
app.use('/api/admin/discount', adminDiscountRoutes);
app.use('/api/admin/seller', adminSellerRoutes);
app.use('/api/admin/terms', adminTermsRoutes);
app.use('/api/admin/products', adminProductRoutes);
app.use('/api/admin', adminUserRoutes);
app.use('/api/admin', adminRoutes);

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

app.get('/', (req, res) => {
  res.send('Backend is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
