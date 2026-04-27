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

// In-memory data store (replace with database later)
const store = {
  incidents: [
    {
      id: "inc-1",
      title: "Inundacion Bogota Sur",
      description: "Evacuacion inmediata",
      severity: "critical",
      location: "Bogota Sur",
      minutesAgo: 5,
      volunteerCount: 5,
    },
    {
      id: "inc-2",
      title: "Incendio Kennedy",
      description: "Bomberos requeridos",
      severity: "high",
      location: "Suba",
      minutesAgo: 20,
      volunteerCount: 2,
    },
    {
      id: "inc-3",
      title: "Corte vial Suba",
      description: "Desvios activos",
      severity: "medium",
      location: "Suba",
      minutesAgo: 20,
      volunteerCount: 2,
    },
  ],
  notifications: [
    {
      id: "notif-1",
      title: "Reporte zona norte",
      description: "Reportado por 4 usuarios",
      progress: 80,
      meta: "4/5 reportes - Hace 3 min",
    },
    {
      id: "notif-2",
      title: "Reporte zona sur",
      description: "Reportado por 2 usuarios",
      progress: 38,
      meta: "2/5 reportes - Hace 8 min",
    },
    {
      id: "notif-3",
      title: "Nuevo voluntario conectado",
      description: "Carlos R. - Engativa",
      meta: "Hace 10 min",
    },
  ],
  messages: [
    {
      id: "msg-1",
      kind: "message",
      text: "Zona inundada. Necesitamos botes urgente.",
      author: {
        id: "u-gen-1",
        displayName: "Maria L.",
        location: "Kennedy, Bogota",
        role: "general",
      },
      timestamp: new Date(Date.now() - 6 * 60000).toISOString(),
    },
    {
      id: "msg-2",
      kind: "message",
      text: "Voy con el equipo. Llegamos en 20 minutos.",
      author: {
        id: "u-vol-1",
        displayName: "Pedro S.",
        location: "Guarda, Bogota",
        role: "voluntario",
      },
      timestamp: new Date(Date.now() - 4 * 60000).toISOString(),
    },
    {
      id: "msg-3",
      kind: "message",
      text: "Confirmo. Traigo radio y botiquin completo.",
      author: {
        id: "u-gen-1776998636064",
        displayName: "Tu",
        location: "Suba, Bogota",
        role: "general",
      },
      timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
    },
    {
      id: "msg-4",
      kind: "alert",
      text: "ALERTA CRITICA: Evacuar sector B de inmediato. Nivel agua zona roja.",
      author: {
        id: "u-coord-1",
        displayName: "Andres Villamil",
        location: "Suba, Bogota",
        role: "coordinador",
      },
      timestamp: new Date(Date.now() - 1 * 60000).toISOString(),
    },
    {
      id: "msg-5",
      kind: "message",
      text: "Recibido. Evacuando el sector ahora.",
      author: {
        id: "u-vol-2",
        displayName: "Laura C.",
        location: "Chapinero, Bogota",
        role: "voluntario",
      },
      timestamp: new Date(Date.now() - 30000).toISOString(),
    },
  ],
};

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "rescate-global-server" });
});

app.use("/api/auth", authRoutes);

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

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 12);
}

server.listen(env.port, () => {
  console.log(`Rescate Global server running on http://localhost:${env.port}`);
});
