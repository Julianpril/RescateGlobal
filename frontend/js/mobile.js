const SERVER_URL = "http://localhost:3000";
const session = JSON.parse(localStorage.getItem("rgSession") || "null");
const chatView = document.querySelector('.mobile-view[data-view="chat"]');
const chatList = document.getElementById("mobile-chat-list") || chatView;
const isCoordinatorPage = document.body.classList.contains("mobile-page--coord");

let cachedMessages = [];
let cachedIncidents = [];

if (!session?.token) {
  window.location.href = "/html/login.html";
}

function formatTime(dateValue) {
  return new Date(dateValue).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function switchMobileView(target) {
  document.querySelectorAll(".mobile-view").forEach((view) => {
    view.classList.toggle("is-active", view.dataset.view === target);
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.target === target);
  });

  document.body.dataset.mobileView = target;
}

function appendChatBubble(message, isOwnMessage) {
  if (!chatList) return;

  const bubble = document.createElement("article");
  bubble.className = isOwnMessage ? "bubble bubble--out" : "bubble bubble--in";

  if (message.kind === "alert") {
    bubble.className = "bubble bubble--alert";
  }

  if (!isOwnMessage && message.kind !== "alert" && message.author?.displayName) {
    const meta = document.createElement("small");
    meta.textContent = `${message.author.displayName} - ${message.author.location || "Canal"}`;
    bubble.appendChild(meta);
  }

  if (message.kind === "alert") {
    const meta = document.createElement("small");
    meta.textContent = `COORDINADOR - ${message.author?.displayName || "Sistema"}`;
    bubble.appendChild(meta);
  }

  const body = document.createElement("p");
  body.textContent = message.text;
  bubble.appendChild(body);

  const time = document.createElement("time");
  time.textContent = `${isOwnMessage ? "Tu" : (message.author?.displayName || "Sistema")} - ${formatTime(message.timestamp || Date.now())}`;
  bubble.appendChild(time);

  const typing = chatView?.querySelector(".typing");
  if (typing) {
    chatView.insertBefore(bubble, typing);
  } else {
    chatList.appendChild(bubble);
  }

  if (chatView) {
    chatView.scrollTop = chatView.scrollHeight;
  }
}

function createIncidentCard(incident) {
  const card = document.createElement("article");
  const severity = incident.severity || "medium";
  card.className = `card card--incident ${severity}`;

  const title = document.createElement("strong");
  title.textContent = incident.title || "Incidencia";
  card.appendChild(title);

  const desc = document.createElement("p");
  desc.textContent = incident.description || "Sin descripcion";
  card.appendChild(desc);

  const meta = document.createElement("small");
  meta.textContent = `${incident.location || "Zona"} - Hace ${incident.minutesAgo || 0} min - ${incident.volunteerCount || 0} reportes`;
  card.appendChild(meta);

  return card;
}

function createNotificationCard(notification) {
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("strong");
  title.textContent = notification.title || "Notificacion";
  card.appendChild(title);

  const desc = document.createElement("p");
  desc.textContent = notification.description || "Sin detalles";
  card.appendChild(desc);

  if (notification.progress !== undefined) {
    const progress = document.createElement("div");
    progress.className = "progress";
    const span = document.createElement("span");
    span.style.width = `${notification.progress}%`;
    progress.appendChild(span);
    card.appendChild(progress);
  }

  if (notification.meta) {
    const meta = document.createElement("small");
    meta.textContent = notification.meta;
    card.appendChild(meta);
  }

  return card;
}

function setIncidents(incidents) {
  cachedIncidents = incidents;

  const list = document.getElementById("mobile-emergencies-list");
  const counter = document.getElementById("mobile-emergencies-counter");
  const navCounter = document.getElementById("mobile-nav-emergencies-count");

  if (list) {
    list.innerHTML = "";
    incidents.forEach((incident) => list.appendChild(createIncidentCard(incident)));
  }

  if (counter) counter.textContent = String(incidents.length);
  if (navCounter) navCounter.textContent = String(incidents.length);

  const locationNode = document.getElementById("coord-mobile-incident-location");
  if (locationNode) locationNode.textContent = incidents[0]?.location || "--";
}

function setNotifications(notifications) {
  const list = document.getElementById("mobile-notifications-list");
  const counter = document.getElementById("mobile-notifications-counter");
  const navCounter = document.getElementById("mobile-nav-notifications-count");

  if (list) {
    list.innerHTML = "";
    notifications.forEach((notification) => list.appendChild(createNotificationCard(notification)));
  }

  if (counter) counter.textContent = String(notifications.length);
  if (navCounter) navCounter.textContent = String(notifications.length);
}

function renderCoordinatorActivity(messages) {
  const list = document.getElementById("coord-mobile-activity-list");
  if (!list) return;

  list.innerHTML = "";
  messages.slice(-5).reverse().forEach((msg) => {
    const item = document.createElement("article");
    item.className = "activity-entry";

    const label = document.createElement("strong");
    label.textContent = msg.kind === "alert" ? "COORDINADOR" : (msg.author?.displayName || "SISTEMA");
    item.appendChild(label);

    const text = document.createElement("p");
    text.textContent = msg.text;
    item.appendChild(text);

    const time = document.createElement("time");
    time.textContent = formatTime(msg.timestamp || Date.now());
    item.appendChild(time);

    list.appendChild(item);
  });
}

function applyChannelStats(stats) {
  const onlineCount = Number(stats?.onlineVolunteers || 0);
  const incidentTitle = stats?.activeIncidentTitle || "Sin emergencia activa";
  const volunteersTotal = Number(stats?.volunteersTotal || 0);
  const duration = stats?.activeIncidentDuration || "--";

  const onlineNode = document.getElementById("mobile-online-count");
  if (onlineNode) onlineNode.textContent = String(onlineCount);

  const dividerNode = document.getElementById("mobile-chat-divider");
  if (dividerNode) {
    dividerNode.textContent = incidentTitle === "Sin emergencia activa" ? "Hoy" : `Hoy - ${incidentTitle}`;
  }

  const titleNode = document.getElementById("coord-mobile-incident-title");
  if (titleNode) titleNode.textContent = incidentTitle;

  const durationNode = document.getElementById("coord-mobile-incident-duration");
  if (durationNode) durationNode.textContent = duration;

  const volunteersNode = document.getElementById("coord-mobile-volunteers-total");
  if (volunteersNode) volunteersNode.textContent = String(volunteersTotal);

  const coordOnlineNode = document.getElementById("coord-mobile-online-count");
  if (coordOnlineNode) coordOnlineNode.textContent = String(onlineCount);

  const coordDurationNode = document.getElementById("coord-mobile-duration");
  if (coordDurationNode) coordDurationNode.textContent = duration;
}

async function requestOpenEmergencyMobile(activeSocket) {
  if (!activeSocket || session?.user?.role !== "coordinador") return;
  const data = await RGModal.openEmergencyForm(session?.user?.location || "");
  if (!data) return;
  activeSocket.emit("incident:open", {
    title: data.title,
    location: data.location || session?.user?.location || "Zona sin definir",
    description: data.description,
    severity: "critical",
  });
}

async function requestCloseEmergencyMobile(activeSocket) {
  if (!activeSocket || session?.user?.role !== "coordinador") return;
  const approved = await RGModal.confirm("¿Confirmar cierre de la emergencia activa?");
  if (!approved) return;
  activeSocket.emit("incident:close");
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchMobileView(button.dataset.target));
});

let socket = null;
if (session?.token && typeof io !== "undefined") {
  socket = io(SERVER_URL, { transports: ["websocket"] });

  socket.on("connect", () => {
    socket.emit("join:channel", { token: session.token });
    socket.emit("load:incidents", { token: session.token });
    socket.emit("load:notifications", { token: session.token });
  });

  socket.on("chat:history", (data) => {
    if (!Array.isArray(data.messages)) return;
    cachedMessages = data.messages;

    if (chatList) {
      chatList.innerHTML = "";
      data.messages.forEach((message) => {
        const isOwnMessage = session?.user?.id && message.author?.id === session.user.id;
        appendChatBubble(message, isOwnMessage);
      });
    }

    renderCoordinatorActivity(cachedMessages);
  });

  socket.on("chat:message", (message) => {
    cachedMessages.push(message);
    if (cachedMessages.length > 200) cachedMessages.shift();

    const isOwnMessage = session?.user?.id && message.author?.id === session.user.id;
    appendChatBubble(message, isOwnMessage);
    renderCoordinatorActivity(cachedMessages);
  });

  socket.on("chat:system", (message) => {
    const systemMessage = {
      kind: "alert",
      text: message.text,
      author: { displayName: "Sistema" },
      timestamp: message.timestamp || Date.now(),
    };
    cachedMessages.push(systemMessage);
    appendChatBubble(systemMessage, false);
    renderCoordinatorActivity(cachedMessages);
  });

  socket.on("chat:error", (payload) => {
    const errorMessage = {
      kind: "alert",
      text: payload?.message || "Error de chat.",
      author: { displayName: "Sistema" },
      timestamp: Date.now(),
    };
    cachedMessages.push(errorMessage);
    appendChatBubble(errorMessage, false);
    renderCoordinatorActivity(cachedMessages);
  });

  socket.on("incidents:list", (data) => {
    setIncidents(data.incidents || []);
  });

  socket.on("notifications:list", (data) => {
    setNotifications(data.notifications || []);
  });

  socket.on("channel:stats", (stats) => {
    applyChannelStats(stats || {});
  });
}

document.getElementById("coord-mobile-open-emergency-btn")?.addEventListener("click", () => {
  requestOpenEmergencyMobile(socket);
});

document.getElementById("coord-mobile-close-emergency-btn")?.addEventListener("click", () => {
  requestCloseEmergencyMobile(socket);
});

document.getElementById("coord-mobile-logout-btn")?.addEventListener("click", () => {
  localStorage.removeItem("rgSession");
  window.location.href = "/html/login.html";
});

document.querySelectorAll(".mobile-composer").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const input = form.querySelector('input[name="mensaje"]');
    const text = input.value.trim();
    if (!text) return;

    if (socket) {
      const role = session?.user?.role;
      if (role === "coordinador" && text.toUpperCase().startsWith("ALERTA:")) {
        socket.emit("chat:alert", { text });
      } else {
        socket.emit("chat:send", { text });
      }
    } else if (!isCoordinatorPage) {
      appendChatBubble({ text, timestamp: Date.now() }, true);
    }

    input.value = "";
  });
});
