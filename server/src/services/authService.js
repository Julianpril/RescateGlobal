const crypto = require("crypto");

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

const volunteerCredentials = {
  andresv: {
    password: "coord123",
    id: "u-coord-1",
    displayName: "Andres Villamil",
    role: "coordinador",
    location: "Suba, Bogota",
  },
  laurac: {
    password: "vol123",
    id: "u-vol-1",
    displayName: "Laura Casas",
    role: "voluntario",
    location: "Chapinero, Bogota",
  },
};

const activeSessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  const session = {
    token,
    user,
    createdAt: Date.now(),
  };
  activeSessions.set(token, session);
  return session;
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

  return createSession(user);
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

  return createSession(user);
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
  loginByRole,
  getSessionByToken,
};
