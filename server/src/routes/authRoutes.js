const express = require("express");
const {
  createGoogleAuthUrl,
  consumeGoogleState,
  exchangeGoogleCode,
  loginByRole,
  loginGoogle,
  getSessionByToken,
} = require("../services/authService");
const env = require("../config/env");

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

router.post("/google", (req, res) => {
  try {
    const session = loginGoogle(req.body);
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

router.get("/google", (_, res) => {
  try {
    const { url } = createGoogleAuthUrl();
    return res.redirect(url);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

router.get("/google/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();

    consumeGoogleState(state);

    const session = await exchangeGoogleCode(code);
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const protocol = forwardedProto || req.protocol || "http";
    const host = req.get("host");
    const baseUrl = host ? `${protocol}://${host}` : env.frontendUrl;
    const targetUrl = new URL(`${baseUrl}/html/login.html`);
    targetUrl.searchParams.set("sessionToken", session.token);

    return res.redirect(targetUrl.toString());
  } catch (error) {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const protocol = forwardedProto || req.protocol || "http";
    const host = req.get("host");
    const baseUrl = host ? `${protocol}://${host}` : env.frontendUrl;
    return res.redirect(`${baseUrl}/html/login.html?googleError=${encodeURIComponent(error.message)}`);
  }
});

router.get("/session", (req, res) => {
  const token = String(req.query.token || "").trim();
  const session = getSessionByToken(token);

  if (!session) {
    return res.status(404).json({ ok: false, message: "Sesion no encontrada." });
  }

  return res.json({ ok: true, token: session.token, user: session.user, provider: session.provider });
});

module.exports = router;
