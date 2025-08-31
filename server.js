require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const authroutes= require('./routes/user/authRoutes');
const productRoutes = require('./routes/product/productRoutes');
const adminRoutes= require('./routes/admin/adminRoutes');
const adminUserRoutes= require('./routes/admin/user/adminUserRoutes');
const categoryRoutes= require('./routes/category/categoryRoutes');
const cartRoutes= require('./routes/cart/cartRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/user', authroutes);
app.use('/api/product', productRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/cart', cartRoutes);


// Admin Routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminUserRoutes);

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

app.get('/', (req, res) => {
    res.send('Backend is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
