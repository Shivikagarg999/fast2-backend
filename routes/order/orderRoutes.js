const express = require("express");
const router = express.Router();
const orderController = require("../../controllers/order/order");
const auth = require("../../middlewares/userauth");

router.post("/create", auth, orderController.createOrder);

router.get("/my-orders", auth, orderController.getMyOrders);

router.put("/:orderId/status", orderController.updateOrderStatus);

router.get('/:orderId/invoice', auth, orderController.downloadInvoice);

module.exports = router;