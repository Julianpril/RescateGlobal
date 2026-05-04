const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

module.exports = {
  port: Number(process.env.PORT || 3000),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback",
};
