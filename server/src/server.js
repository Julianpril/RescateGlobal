const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const env = require("./config/env");
const authRoutes = require("./routes/authRoutes");
const { getSessionByToken } = require("./services/authService");

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const onlineUserConnections = new Map();

const store = {
  incidents: [],
  notifications: [],
  messages: [],
};

const emergencySignals = [];

const emergencyKeywords = new Set([
  "accidente",
  "accident",
  "allanamiento",
  "auxilio",
  "colapso",
  "derrumb",
  "deslizamiento",
  "emergencia",
  "explosion",
  "fuga",
  "herid",
  "incend",
  "inund",
  "robo",
  "sismo",
  "temblor",
  "urgente",
]);

const stopWords = new Set([
  "a",
  "al",
  "algo",
  "alta",
  "ahi",
  "ahora",
  "barrio",
  "calle",
  "con",
  "de",
  "del",
  "donde",
  "el",
  "en",
  "esta",
  "estan",
  "hay",
  "la",
  "las",
  "lo",
  "los",
  "muy",
  "para",
  "por",
  "que",
  "sector",
  "se",
  "si",
  "un",
  "una",
  "ya",
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(token) {
  if (!token) return "";
  if (token.startsWith("incend")) return "incend";
  if (token.startsWith("inund")) return "inund";
  if (token.startsWith("accident")) return "accident";
  if (token.startsWith("derrumb") || token.startsWith("desliz")) return "desliz";
  if (token.startsWith("explosion") || token.startsWith("explos")) return "explosion";
  if (token.startsWith("herid") || token.startsWith("lesion")) return "herid";
  if (token.startsWith("tembl") || token.startsWith("sism")) return "sismo";
  if (token.startsWith("auxili")) return "auxilio";
  if (token.startsWith("urgent")) return "urgente";
  return token;
}

function extractMeaningfulTokens(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  return normalized
    .split(" ")
    .map(normalizeToken)
    .filter((token) => token && token.length > 2 && !stopWords.has(token));
}

function hasEmergencySignal(tokens) {
  return tokens.some((token) => {
    for (const keyword of emergencyKeywords) {
      if (token.startsWith(keyword)) return true;
    }
    return false;
  });
}

function scoreTokenOverlap(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let shared = 0;

  for (const token of setA) {
    if (setB.has(token)) {
      shared += 1;
      continue;
    }

    for (const other of setB) {
      if (token.startsWith(other) || other.startsWith(token)) {
        shared += 1;
        break;
      }
    }
  }

  return shared / Math.min(setA.size, setB.size);
}

function getSeverityLevel(reportCount) {
  if (reportCount >= 7) return "critical";
  if (reportCount >= 5) return "high";
  if (reportCount >= 3) return "medium";
  return null;
}

function pickIncidentKeyword(tokens) {
  for (const token of tokens) {
    for (const keyword of emergencyKeywords) {
      if (token.startsWith(keyword)) {
        return keyword;
      }
    }
  }
  return tokens[0] || "emergencia";
}

function pickLocationHint(tokens) {
  const knownPlaces = [
    "muiscas",
    "centro",
    "norte",
    "sur",
    "oriente",
    "occidente",
    "bella vista",
    "las quintas",
    "los alpes",
    "el bosque",
    "mesopotamia",
  ];

  const joined = tokens.join(" ");
  for (const place of knownPlaces) {
    if (joined.includes(place)) {
      return place
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
  }

  return "Zona sin definir";
}

function getLocationKey(tokens) {
  const hint = pickLocationHint(tokens);
  return hint === "Zona sin definir" ? "" : normalizeText(hint);
}

function buildAutoIncident(signal) {
  const keyword = pickIncidentKeyword(signal.tokens);
  const location = pickLocationHint(signal.tokens);

  return {
    id: `inc-auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `Emergencia ${keyword}`,
    description: `Reporte ciudadano automatico (${signal.reportCount} testimonios).`,
    severity: signal.severity,
    location,
    locationKey: signal.locationKey || "",
    minutesAgo: 0,
    volunteerCount: signal.reportCount,
    helperIds: [],
    helperCount: 0,
    source: "auto",
    signalId: signal.id,
  };
}

function refreshIncidentFromSignal(signal) {
  const incident = store.incidents.find((item) => item.signalId === signal.id);
  if (!incident) return;

  incident.severity = signal.severity;
  incident.description = `Reporte ciudadano automatico (${signal.reportCount} testimonios).`;
  incident.location = pickLocationHint(signal.tokens);
  incident.locationKey = signal.locationKey || "";
  incident.volunteerCount = signal.reportCount;
}

function getIncidentById(incidentId) {
  return store.incidents.find((incident) => incident.id === incidentId) || null;
}

function applyHelperCount(incident) {
  incident.helperIds = Array.isArray(incident.helperIds) ? incident.helperIds : [];
  incident.helperCount = incident.helperIds.length;
}

function cleanupEmergencySignals(now = Date.now()) {
  for (let index = emergencySignals.length - 1; index >= 0; index -= 1) {
    const signal = emergencySignals[index];
    if (!signal || now - signal.updatedAt > 30 * 60 * 1000) {
      emergencySignals.splice(index, 1);
    }
  }
}

function registerEmergencyReport(message) {
  const tokens = extractMeaningfulTokens(message.text);
  if (!hasEmergencySignal(tokens)) return;

  cleanupEmergencySignals();

  const userId = message.author?.id;
  if (!userId) return;
  const locationKey = getLocationKey(tokens);

  let signal = null;
  let bestScore = 0;

  for (const candidate of emergencySignals) {
    if (locationKey && candidate.locationKey && candidate.locationKey !== locationKey) {
      continue;
    }

    const score = scoreTokenOverlap(tokens, candidate.tokens);
    if (score > bestScore) {
      bestScore = score;
      signal = candidate;
    }
  }

  if (!signal || bestScore < 0.5) {
    signal = {
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tokens,
      userIds: new Set(),
      reportCount: 0,
      severity: null,
      incidentId: null,
      locationKey,
      updatedAt: Date.now(),
    };
    emergencySignals.push(signal);
  }

  if (signal.userIds.has(userId)) return;

  signal.userIds.add(userId);
  signal.reportCount = signal.userIds.size;
  signal.updatedAt = Date.now();
  signal.severity = getSeverityLevel(signal.reportCount);

  if (!signal.severity) return;

  if (!signal.incidentId) {
    const incident = buildAutoIncident(signal);
    signal.incidentId = incident.id;
    store.incidents.unshift(incident);
    if (store.incidents.length > 50) store.incidents.pop();

    io.to("canal-global").emit("incidents:list", { incidents: store.incidents });
    io.to("canal-global").emit("chat:system", {
      id: `sys-${Date.now()}`,
      kind: "system",
      text: `Emergencia automatica detectada: ${incident.title} (${signal.reportCount} reportes)`,
      timestamp: new Date().toISOString(),
    });
    emitChannelStats();
    return;
  }

  refreshIncidentFromSignal(signal);
  io.to("canal-global").emit("incidents:list", { incidents: store.incidents });
  io.to("canal-global").emit("chat:system", {
    id: `sys-${Date.now()}`,
    kind: "system",
    text: `Emergencia actualizada a ${signal.severity === "critical" ? "grave" : signal.severity === "high" ? "moderada" : "leve"} (${signal.reportCount} reportes)`,
    timestamp: new Date().toISOString(),
  });
  emitChannelStats();
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 12);
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "rescate-global-server" });
});

app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes);

app.use(express.static(path.resolve(__dirname, "../../frontend")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

function getChannelStats() {
  let onlineVolunteers = 0;
  for (const [userId, details] of onlineUserConnections.entries()) {
    if (!details || details.connections <= 0) continue;
    if (details.role !== "coordinador") onlineVolunteers += 1;
  }

  const oldestMessage = store.messages[0]?.timestamp;
  const elapsedMinutes = oldestMessage
    ? Math.max(0, Math.round((Date.now() - new Date(oldestMessage).getTime()) / 60000))
    : 0;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  const activeIncidentDuration = elapsedMinutes > 0 ? `${hours}h ${minutes}m` : "--";

  return {
    onlineVolunteers,
    activeIncidentTitle: store.incidents[0]?.title || "Sin emergencia activa",
    volunteersTotal: store.incidents.reduce((acc, incident) => acc + (incident.volunteerCount || 0), 0),
    messagesTotal: store.messages.length,
    activeIncidentDuration,
  };
}

function emitChannelStats() {
  io.to("canal-global").emit("channel:stats", getChannelStats());
}

function emitChatHistory() {
  io.to("canal-global").emit("chat:history", { messages: store.messages });
}

setInterval(() => {
  emitChannelStats();
}, 30000);

io.on("connection", (socket) => {
  socket.on("join:channel", ({ token }) => {
    const session = getSessionByToken(token);

    if (!session) {
      socket.emit("chat:error", { message: "Sesion invalida o expirada." });
      return;
    }

    socket.data.session = session;
    socket.data.userId = session.user.id;
    socket.join("canal-global");

    const current = onlineUserConnections.get(session.user.id) || {
      role: session.user.role,
      connections: 0,
    };
    current.connections += 1;
    onlineUserConnections.set(session.user.id, current);

    // Enviar historial de mensajes
    socket.emit("chat:history", { messages: store.messages });

    socket.emit("chat:ready", {
      user: session.user,
      channel: "canal-global",
    });

    io.to("canal-global").emit("chat:system", {
      id: `sys-${Date.now()}`,
      kind: "system",
      text: `${session.user.displayName} se unio al canal`,
      timestamp: new Date().toISOString(),
    });

    emitChannelStats();
  });

  socket.on("load:incidents", ({ token }) => {
    const session = getSessionByToken(token);
    if (!session) return;
    socket.emit("incidents:list", { incidents: store.incidents });
    socket.emit("channel:stats", getChannelStats());
  });

  socket.on("load:notifications", ({ token }) => {
    const session = getSessionByToken(token);
    if (!session) return;
    socket.emit("notifications:list", { notifications: store.notifications });
  });

  socket.on("incident:open", (payload = {}) => {
    const session = socket.data.session;
    if (!session || session.user.role !== "coordinador") {
      socket.emit("chat:error", { message: "Solo coordinador puede abrir emergencias." });
      return;
    }

    const title = String(payload.title || "").trim();
    if (!title) {
      socket.emit("chat:error", { message: "El titulo de la emergencia es obligatorio." });
      return;
    }

    const incident = {
      id: `inc-${Date.now()}`,
      title,
      description: String(payload.description || "Activada por coordinador").trim() || "Activada por coordinador",
      severity: String(payload.severity || "critical").trim() || "critical",
      location: String(payload.location || session.user.location || "Zona sin definir").trim() || "Zona sin definir",
      minutesAgo: 0,
      volunteerCount: Number(payload.volunteerCount || 0),
      helperIds: [],
      helperCount: 0,
    };

    store.incidents.unshift(incident);
    if (store.incidents.length > 50) store.incidents.pop();

    io.to("canal-global").emit("incidents:list", { incidents: store.incidents });
    io.to("canal-global").emit("chat:system", {
      id: `sys-${Date.now()}`,
      kind: "system",
      text: `Nueva emergencia activa: ${incident.title}`,
      timestamp: new Date().toISOString(),
    });
    emitChannelStats();
  });

  socket.on("incident:join", ({ incidentId }) => {
    const session = socket.data.session;
    if (!session) {
      socket.emit("chat:error", { message: "Debes iniciar sesion para ayudar." });
      return;
    }

    if (session.user.role === "coordinador") {
      socket.emit("chat:error", { message: "El coordinador no se suma como voluntario." });
      return;
    }

    const id = String(incidentId || "").trim();
    if (!id) return;

    const incident = getIncidentById(id);
    if (!incident) {
      socket.emit("chat:error", { message: "La emergencia ya no existe." });
      return;
    }

    incident.helperIds = Array.isArray(incident.helperIds) ? incident.helperIds : [];
    if (incident.helperIds.includes(session.user.id)) return;

    incident.helperIds.push(session.user.id);
    applyHelperCount(incident);

    io.to("canal-global").emit("incidents:list", { incidents: store.incidents });
    io.to("canal-global").emit("chat:system", {
      id: `sys-${Date.now()}`,
      kind: "system",
      text: `${session.user.displayName} se marco en camino para ${incident.title}`,
      timestamp: new Date().toISOString(),
    });
    emitChannelStats();
  });

  socket.on("incident:leave", ({ incidentId }) => {
    const session = socket.data.session;
    if (!session) return;

    const id = String(incidentId || "").trim();
    if (!id) return;

    const incident = getIncidentById(id);
    if (!incident || !Array.isArray(incident.helperIds)) return;

    const nextHelpers = incident.helperIds.filter((helperId) => helperId !== session.user.id);
    if (nextHelpers.length === incident.helperIds.length) return;

    incident.helperIds = nextHelpers;
    applyHelperCount(incident);

    io.to("canal-global").emit("incidents:list", { incidents: store.incidents });
    io.to("canal-global").emit("chat:system", {
      id: `sys-${Date.now()}`,
      kind: "system",
      text: `${session.user.displayName} ya no va en camino para ${incident.title}`,
      timestamp: new Date().toISOString(),
    });
    emitChannelStats();
  });

  socket.on("incident:close", () => {
    const session = socket.data.session;
    if (!session || session.user.role !== "coordinador") {
      socket.emit("chat:error", { message: "Solo coordinador puede cerrar emergencias." });
      return;
    }

    const closedIncident = store.incidents.shift();
    if (!closedIncident) {
      socket.emit("chat:error", { message: "No hay emergencia activa para cerrar." });
      return;
    }

    io.to("canal-global").emit("incidents:list", { incidents: store.incidents });
    io.to("canal-global").emit("chat:system", {
      id: `sys-${Date.now()}`,
      kind: "system",
      text: `Emergencia cerrada: ${closedIncident.title}`,
      timestamp: new Date().toISOString(),
    });
    emitChannelStats();
  });

  socket.on("chat:send", ({ text }) => {
    const session = socket.data.session;
    if (!session) {
      socket.emit("chat:error", { message: "Debes iniciar sesion para enviar mensajes." });
      return;
    }

    const cleanText = String(text || "").trim();
    if (!cleanText) return;

    const message = {
      id: cryptoRandomId(),
      kind: "message",
      text: cleanText,
      author: session.user,
      timestamp: new Date().toISOString(),
    };

    // Guardar en historial
    store.messages.push(message);
    if (store.messages.length > 200) store.messages.shift(); // Limitar a 200 mensajes

    io.to("canal-global").emit("chat:message", message);
    if (session.user.role === "general") {
      registerEmergencyReport(message);
    }
    emitChannelStats();
  });

  socket.on("chat:alert", ({ text }) => {
    const session = socket.data.session;
    if (!session || session.user.role !== "coordinador") {
      socket.emit("chat:error", { message: "Solo coordinador puede enviar alertas." });
      return;
    }

    const cleanText = String(text || "").trim();
    if (!cleanText) return;

    const message = {
      id: cryptoRandomId(),
      kind: "alert",
      text: cleanText,
      author: session.user,
      timestamp: new Date().toISOString(),
    };

    // Guardar en historial
    store.messages.push(message);
    if (store.messages.length > 200) store.messages.shift(); // Limitar a 200 mensajes

    io.to("canal-global").emit("chat:message", message);
    emitChannelStats();
  });

  socket.on("chat:clear", () => {
    const session = socket.data.session;
    if (!session || session.user.role !== "coordinador") {
      socket.emit("chat:error", { message: "Solo coordinador puede limpiar el chat." });
      return;
    }

    store.messages = [];
    emitChatHistory();
    emitChannelStats();
  });

  socket.on("disconnect", () => {
    const { userId } = socket.data;
    if (!userId) return;

    const current = onlineUserConnections.get(userId);
    if (!current) return;

    current.connections -= 1;
    if (current.connections <= 0) {
      onlineUserConnections.delete(userId);
    } else {
      onlineUserConnections.set(userId, current);
    }

    emitChannelStats();
  });
});

server.listen(env.port, () => {
  console.log(`Rescate Global server running on http://localhost:${env.port}`);
});
