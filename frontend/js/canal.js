const SERVER_URL = 'http://localhost:3000';
const session = JSON.parse(localStorage.getItem('rgSession') || 'null');
const messageContainer = document.getElementById('chat-general') || document.getElementById('chat-coord');

const isCoordinatorPage = document.body.dataset.chatRole === 'coordinador';

if (!session?.token) {
  window.location.href = '/html/login.html';
}

function formatTime(dateValue) {
  return new Date(dateValue).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function applyUserData() {
  if (!session?.user) return;

  const chip = document.querySelector('.user-chip');
  if (chip) {
    chip.textContent = `${session.user.displayName} - ${session.user.location}`;
  }

  const coordRole = document.querySelector('.coord-user');
  if (coordRole && session.user.role === 'coordinador') {
    coordRole.innerHTML = '<span class="dot dot-green"></span> COORDINADOR';
  }
}

function createMessageNode(message) {
  const article = document.createElement('article');
  const isOwnMessage = session?.user?.id && message.author?.id === session.user.id;

  let className = 'message message--in';
  if (message.kind === 'alert') className = 'message message--alert';
  if (isOwnMessage) className = 'message message--out compact';

  article.className = className;

  if (message.author && !isOwnMessage && message.kind !== 'alert') {
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `${message.author.displayName} - ${message.author.location}`;
    article.appendChild(meta);
  }

  if (message.kind === 'alert') {
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `COORDINADOR - ${message.author?.displayName || 'Sistema'}`;
    article.appendChild(meta);
  }

  const body = document.createElement('p');
  body.textContent = message.text;
  article.appendChild(body);

  const time = document.createElement('small');
  const authorLabel = isOwnMessage ? 'Tu' : (message.author?.displayName || 'Sistema');
  time.textContent = `${authorLabel} - ${formatTime(message.timestamp || Date.now())}`;
  article.appendChild(time);

  return article;
}

function appendMessage(message) {
  if (!messageContainer) return;
  messageContainer.appendChild(createMessageNode(message));
  messageContainer.scrollTop = messageContainer.scrollHeight;

  const typingHint = document.getElementById('typing-hint');
  if (typingHint) typingHint.style.display = 'none';
}

function createSystemNotice(text) {
  appendMessage({
    kind: 'alert',
    text,
    author: { displayName: 'Sistema' },
    timestamp: Date.now(),
  });
}

function createIncidentNode(incident) {
  const article = document.createElement('article');
  const severityClass = incident.severity || 'incident--critical';
  article.className = `incident incident--${severityClass}`;

  const title = document.createElement('strong');
  title.textContent = incident.title;
  article.appendChild(title);

  const desc = document.createElement('p');
  desc.textContent = incident.description;
  article.appendChild(desc);

  const meta = document.createElement('small');
  const minutesAgo = incident.minutesAgo || 0;
  const volunteerCount = incident.volunteerCount || 0;
  meta.textContent = `${incident.location} - ${minutesAgo} min - [${volunteerCount}]↑`;
  article.appendChild(meta);

  return article;
}

function addIncident(incident) {
  const list = document.getElementById('emergencies-list');
  const counter = document.getElementById('emergencies-counter');
  if (list) {
    list.appendChild(createIncidentNode(incident));
    if (counter) {
      counter.textContent = String(parseInt(counter.textContent || '0') + 1);
    }
  }
}

function setIncidents(incidents) {
  const list = document.getElementById('emergencies-list');
  const counter = document.getElementById('emergencies-counter');
  if (list) {
    list.innerHTML = '';
    incidents.forEach(inc => list.appendChild(createIncidentNode(inc)));
    if (counter) counter.textContent = String(incidents.length);
  }
}

function createNotificationNode(notification) {
  const article = document.createElement('article');
  article.className = 'notice';

  const title = document.createElement('strong');
  title.textContent = notification.title;
  article.appendChild(title);

  const desc = document.createElement('p');
  desc.textContent = notification.description;
  article.appendChild(desc);

  if (notification.progress !== undefined) {
    const progressDiv = document.createElement('div');
    progressDiv.className = 'progress';
    const span = document.createElement('span');
    span.style.width = `${notification.progress}%`;
    progressDiv.appendChild(span);
    article.appendChild(progressDiv);
  }

  const meta = document.createElement('small');
  meta.textContent = notification.meta || 'Ahora mismo';
  article.appendChild(meta);

  return article;
}

function addNotification(notification) {
  const list = document.getElementById('notifications-list');
  const counter = document.getElementById('notifications-counter');
  if (list) {
    list.appendChild(createNotificationNode(notification));
    if (counter) {
      counter.textContent = String(parseInt(counter.textContent || '0') + 1);
    }
  }
}

function setNotifications(notifications) {
  const list = document.getElementById('notifications-list');
  const counter = document.getElementById('notifications-counter');
  if (list) {
    list.innerHTML = '';
    notifications.forEach(notif => list.appendChild(createNotificationNode(notif)));
    if (counter) counter.textContent = String(notifications.length);
  }
}

function applyChannelStats(stats) {
  const onlineCount = Number(stats?.onlineVolunteers || 0);
  const incidentTitle = stats?.activeIncidentTitle || 'Sin emergencia activa';
  const volunteersTotal = Number(stats?.volunteersTotal || 0);
  const messageCount = Number(stats?.messagesTotal || 0);
  const duration = stats?.activeIncidentDuration || '--';

  document.querySelectorAll('#online-volunteers-count').forEach((node) => {
    node.textContent = String(onlineCount);
  });

  document.querySelectorAll('#active-incident-title').forEach((node) => {
    node.textContent = incidentTitle;
  });

  const volunteersTotalNode = document.getElementById('stats-volunteers-total');
  if (volunteersTotalNode) volunteersTotalNode.textContent = String(volunteersTotal);

  const onlineStatsNode = document.getElementById('stats-online-count');
  if (onlineStatsNode) onlineStatsNode.textContent = String(onlineCount);

  const messageCountNode = document.getElementById('stats-messages-total');
  if (messageCountNode) messageCountNode.textContent = String(messageCount);

  const durationNode = document.getElementById('stats-duration');
  if (durationNode) durationNode.textContent = duration;

  const bannerNode = document.getElementById('active-incident-banner');
  if (bannerNode) bannerNode.textContent = incidentTitle === 'Sin emergencia activa'
    ? incidentTitle
    : `EMERGENCIA ACTIVA - ${incidentTitle}`;

  const dividerNode = document.getElementById('chat-divider-title');
  if (dividerNode) {
    dividerNode.textContent = incidentTitle === 'Sin emergencia activa'
      ? 'Hoy'
      : `Hoy - ${incidentTitle}`;
  }

  const activeChannelNode = document.getElementById('active-channel-title');
  if (activeChannelNode) activeChannelNode.textContent = incidentTitle;
}

function setupSocket() {
  if (!session?.token || typeof io === 'undefined') {
    if (!isCoordinatorPage) {
      createSystemNotice('Sesion no valida. Inicia sesion desde login.');
    }
    return null;
  }

  const socket = io(SERVER_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    socket.emit('join:channel', { token: session.token });
    socket.emit('load:incidents', { token: session.token });
    socket.emit('load:notifications', { token: session.token });
  });

  socket.on('chat:history', (data) => {
    if (!Array.isArray(data.messages)) return;
    if (messageContainer) messageContainer.innerHTML = '';
    data.messages.forEach(msg => appendMessage(msg));

    const activityList = document.getElementById('activity-list');
    if (activityList) {
      activityList.innerHTML = '';
      data.messages.slice(-5).reverse().forEach((msg) => {
        const item = document.createElement('li');
        const label = document.createElement('strong');
        label.textContent = msg.kind === 'alert' ? 'COORDINADOR' : (msg.author?.displayName || 'Sistema');
        const text = document.createElement('p');
        text.textContent = msg.text;
        const time = document.createElement('time');
        time.textContent = formatTime(msg.timestamp || Date.now());
        item.appendChild(label);
        item.appendChild(text);
        item.appendChild(time);
        activityList.appendChild(item);
      });
    }
  });

  socket.on('chat:ready', () => {
    createSystemNotice('Conexion en tiempo real activa.');
  });

  socket.on('chat:message', (message) => appendMessage(message));

  socket.on('chat:system', (message) => {
    createSystemNotice(message.text);
  });

  socket.on('chat:error', (payload) => {
    const message = payload?.message || 'Error de chat.';
    createSystemNotice(message);

    if (/sesion invalida|sesion expirada|expirada/i.test(message)) {
      logoutSession();
    }
  });

  // Emergencies
  socket.on('incidents:list', (data) => {
    setIncidents(data.incidents || []);
  });

  socket.on('incident:new', (incident) => {
    addIncident(incident);
  });

  // Notifications
  socket.on('notifications:list', (data) => {
    setNotifications(data.notifications || []);
  });

  socket.on('notification:new', (notification) => {
    addNotification(notification);
  });

  socket.on('channel:stats', (stats) => {
    applyChannelStats(stats || {});
  });

  return socket;
}

function requestOpenEmergency(activeSocket) {
  if (!activeSocket || session?.user?.role !== 'coordinador') return;

  const title = window.prompt('Nombre de la emergencia activa:');
  if (!title || !title.trim()) return;

  const location = window.prompt('Ubicacion (barrio/sector):', session?.user?.location || '') || '';
  const description = window.prompt('Descripcion breve de la emergencia:', 'Activada por coordinador') || 'Activada por coordinador';

  activeSocket.emit('incident:open', {
    title: title.trim(),
    location: location.trim() || (session?.user?.location || 'Zona sin definir'),
    description: description.trim() || 'Activada por coordinador',
    severity: 'critical',
  });
}

function requestCloseEmergency(activeSocket) {
  if (!activeSocket || session?.user?.role !== 'coordinador') return;
  const approved = window.confirm('Confirmar cierre de la emergencia activa?');
  if (!approved) return;
  activeSocket.emit('incident:close');
}

function requestCoordinatorAlert(activeSocket) {
  if (!activeSocket || session?.user?.role !== 'coordinador') return;
  const alertText = window.prompt('Mensaje de alerta critica (se enviara a todos):', 'ALERTA: ');
  if (!alertText || !alertText.trim()) return;
  activeSocket.emit('chat:alert', { text: alertText.trim() });
}

applyUserData();
const socket = setupSocket();

function logoutSession() {
  localStorage.removeItem('rgSession');
  window.location.href = '/html/login.html';
}

document.getElementById('open-emergency-btn')?.addEventListener('click', () => {
  requestOpenEmergency(socket);
});

document.getElementById('close-emergency-btn')?.addEventListener('click', () => {
  requestCloseEmergency(socket);
});

document.getElementById('close-incident-top-btn')?.addEventListener('click', () => {
  requestCloseEmergency(socket);
});

document.getElementById('send-alert-btn')?.addEventListener('click', () => {
  requestCoordinatorAlert(socket);
});

// Logout button
document.getElementById('logout-btn')?.addEventListener('click', logoutSession);
document.getElementById('coord-logout-btn')?.addEventListener('click', logoutSession);
document.getElementById('coord-top-logout-btn')?.addEventListener('click', logoutSession);

document.querySelectorAll('.composer').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const input = form.querySelector('input[name="mensaje"]');
    const text = input.value.trim();
    if (!text) return;

    if (!socket) {
      createSystemNotice('Servidor no disponible.');
      return;
    }

    if (isCoordinatorPage && text.toUpperCase().startsWith('ALERTA:')) {
      socket.emit('chat:alert', { text });
    } else {
      socket.emit('chat:send', { text });
    }

    input.value = '';
  });
});
