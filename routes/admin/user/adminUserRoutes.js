const express = require("express");
const { getAllUsers } = require("../../../controllers/admin/user/adminUserController");

const router = express.Router();

router.get("/users", getAllUsers);

module.exports = router;
