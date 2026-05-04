const crypto = require("crypto");
const env = require("../config/env");
const { loadSessions, persistSession } = require("./authStore");

const allowedNeighborhoods = new Set([
  "Centro",
  "Maldonado",
  "Santa Ines",
  "Las Quintas",
  "Los Muiscas",
  "El Bosque",
  "San Antonio",
  "Mesopotamia",
  "La Maria",
  "Villa Universitaria",
  "La Granja",
  "Cojines del Zaque",
  "Fuente de Hunza",
  "Suamox",
]);

function loadVolunteerCredentials() {
  const rawJson = process.env.VOLUNTEER_CREDENTIALS_JSON;
  if (!rawJson || !rawJson.trim()) return {};

  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (_) {
    return {};
  }
}

const volunteerCredentials = loadVolunteerCredentials();

const activeSessions = new Map();
const pendingGoogleStates = new Map();

for (const session of loadSessions()) {
  if (session?.token && session?.user) {
    activeSessions.set(session.token, {
      token: session.token,
      user: session.user,
      provider: session.provider || "local",
      createdAt: session.createdAt || Date.now(),
    });
  }
}

function createSession(user, provider = "local") {
  const token = crypto.randomBytes(24).toString("hex");
  const session = {
    token,
    user,
    provider,
    createdAt: Date.now(),
  };
  activeSessions.set(token, session);
  persistSession(session);
  return session;
}

function cleanupExpiredGoogleStates() {
  const now = Date.now();
  for (const [state, details] of pendingGoogleStates.entries()) {
    if (!details || now - details.createdAt > 10 * 60 * 1000) {
      pendingGoogleStates.delete(state);
    }
  }
}

function createGoogleAuthUrl() {
  if (!env.googleClientId || !env.googleCallbackUrl) {
    throw new Error("Google OAuth no esta configurado en el servidor.");
  }

  cleanupExpiredGoogleStates();

  const state = crypto.randomBytes(16).toString("hex");
  pendingGoogleStates.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleCallbackUrl,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return {
    state,
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  };
}

function consumeGoogleState(state) {
  cleanupExpiredGoogleStates();

  if (!state || !pendingGoogleStates.has(state)) {
    throw new Error("Estado OAuth invalido o expirado.");
  }

  pendingGoogleStates.delete(state);
}

async function exchangeGoogleCode(code) {
  if (!code) {
    throw new Error("No se recibio el codigo de Google.");
  }

  if (!env.googleClientId || !env.googleClientSecret || !env.googleCallbackUrl) {
    throw new Error("Google OAuth no esta configurado en el servidor.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleCallbackUrl,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`No fue posible intercambiar el codigo de Google: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error("Google no devolvio access_token.");
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!profileResponse.ok) {
    const errorText = await profileResponse.text();
    throw new Error(`No fue posible leer el perfil de Google: ${errorText}`);
  }

  const profile = await profileResponse.json();
  const displayName = String(profile.name || profile.given_name || profile.email || "").trim();
  const cleanEmail = String(profile.email || "").trim().toLowerCase();

  if (!displayName || !cleanEmail) {
    throw new Error("Google no devolvio datos de perfil validos.");
  }

  const user = {
    id: `g-${cleanEmail}`,
    displayName,
    role: "general",
    location: "Acceso con Google",
    email: cleanEmail,
    photoURL: String(profile.picture || "").trim() || null,
    provider: "google",
  };

  return createSession(user, "google");
}

function loginGeneral({ nombre, ubicacion }) {
  if (!nombre || nombre.trim().length < 3) {
    throw new Error("El nombre completo es obligatorio (minimo 3 caracteres).");
  }

  if (!ubicacion || !allowedNeighborhoods.has(ubicacion)) {
    throw new Error("Debes seleccionar un barrio valido de Tunja, Boyaca.");
  }

  const user = {
    id: `u-gen-${Date.now()}`,
    displayName: nombre.trim(),
    role: "general",
    location: `${ubicacion}, Tunja, Boyaca`,
  };

  return createSession(user, "local");
}

function loginVolunteer({ usuario, contrasena }) {
  if (!usuario || !contrasena) {
    throw new Error("Usuario y contrasena son obligatorios.");
  }

  const key = usuario.trim().toLowerCase();
  const credential = volunteerCredentials[key];

  if (!credential || credential.password !== contrasena) {
    throw new Error("Credenciales de voluntario invalidas.");
  }

  const user = {
    id: credential.id,
    displayName: credential.displayName,
    role: credential.role,
    location: credential.location,
  };

  return createSession(user, "local");
}

function loginGoogle({ nombre, email, foto }) {
  const displayName = String(nombre || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!displayName || displayName.length < 3) {
    throw new Error("El nombre de Google es obligatorio.");
  }

  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("El correo de Google es obligatorio.");
  }

  const user = {
    id: `g-${cleanEmail}`,
    displayName,
    role: "general",
    location: "Acceso con Google",
    email: cleanEmail,
    photoURL: String(foto || "").trim() || null,
    provider: "google",
  };

  return createSession(user, "google");
}

function loginGoogleProfile(profile) {
  const displayName = String(profile?.displayName || profile?.name || profile?.email || "").trim();
  const cleanEmail = String(profile?.email || "").trim().toLowerCase();

  if (!displayName || !cleanEmail) {
    throw new Error("No se pudo leer el perfil de Google.");
  }

  const user = {
    id: `g-${cleanEmail}`,
    displayName,
    role: "general",
    location: "Acceso con Google",
    email: cleanEmail,
    photoURL: String(profile?.photoURL || profile?.picture || "").trim() || null,
    provider: "google",
  };

  return createSession(user, "google");
}

function loginByRole(payload) {
  const role = payload?.role;

  if (role === "general") {
    return loginGeneral(payload);
  }

  if (role === "voluntario") {
    return loginVolunteer(payload);
  }

  throw new Error("Rol no soportado.");
}

function getSessionByToken(token) {
  if (!token) return null;
  return activeSessions.get(token) || null;
}

module.exports = {
  createGoogleAuthUrl,
  consumeGoogleState,
  exchangeGoogleCode,
  loginByRole,
  loginGoogle,
  loginGoogleProfile,
  getSessionByToken,
};
