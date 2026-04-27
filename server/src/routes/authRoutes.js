const express = require("express");
const { loginByRole } = require("../services/authService");

const router = express.Router();

router.post("/login", (req, res) => {
  try {
    const session = loginByRole(req.body);
    return res.json({
      ok: true,
      token: session.token,
      user: session.user,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message,
    });
  }
});

module.exports = router;
