require('dotenv').config();

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const socketManager = require('./socketManager');
const routes = require('./routes');

const app = express();

const allowedOrigins = [
  "https://fast2.in",
  "https://www.fast2.in",
  "https://gmkart.com",
  "https://www.gmkart.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000",
  "https://fast2-admin.vercel.app",
  "http://localhost:5000",
  "https://admin.fast2.in",
  "https://www.admin.fast2.in",
  "https://admin.gmkart.com",
  "https://www.admin.gmkart.com",
  "https://seller.fast2.in",
  "https://www.seller.fast2.in",
  "http://localhost:5174",
  "https://promotor.fast2.in",
  "https://www.promotor.fast2.in"
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

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

app.use(routes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

app.get('/', (req, res) => {
  res.send('New Backend is running...');
});

app.post('/test/trigger-order', async (req, res) => {
  try {
    const { emitNewOrder, serverLog } = require('./socketManager');
    const fakeOrderId    = req.body.orderId    || 'TEST_ID_' + Date.now();
    const fakeCustomId   = req.body.customId   || 'TEST' + Math.floor(Math.random() * 9999);
    serverLog(`[TEST TRIGGER] Manually firing new_order: ${fakeCustomId}`, 'warn');
    await emitNewOrder(fakeOrderId, fakeCustomId);
    res.json({ success: true, orderId: fakeOrderId, customId: fakeCustomId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const path = require('path');
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-socket.html'));
});

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
socketManager.init(httpServer);
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
