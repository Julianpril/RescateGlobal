const fs = require("fs");
const path = require("path");

const storePath = path.resolve(__dirname, "../../data/auth-store.json");

function createDefaultStore() {
  return {
    sessions: [],
    logins: [],
  };
}

function ensureStoreFile() {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(createDefaultStore(), null, 2), "utf8");
  }
}

function readStore() {
  ensureStoreFile();

  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw || "{}");

    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      logins: Array.isArray(parsed.logins) ? parsed.logins : [],
    };
  } catch (_) {
    return createDefaultStore();
  }
}

function writeStore(store) {
  ensureStoreFile();

  const nextStore = {
    sessions: Array.isArray(store.sessions) ? store.sessions : [],
    logins: Array.isArray(store.logins) ? store.logins : [],
  };

  fs.writeFileSync(storePath, JSON.stringify(nextStore, null, 2), "utf8");
}

function persistSession(session) {
  const store = readStore();
  const safeSession = {
    token: session.token,
    user: session.user,
    provider: session.provider || "local",
    createdAt: session.createdAt,
  };

  store.sessions = store.sessions.filter((item) => item.token !== safeSession.token);
  store.sessions.unshift(safeSession);
  if (store.sessions.length > 100) store.sessions.length = 100;

  store.logins.unshift({
    token: safeSession.token,
    provider: safeSession.provider,
    user: safeSession.user,
    createdAt: safeSession.createdAt,
  });
  if (store.logins.length > 100) store.logins.length = 100;

  writeStore(store);
}

function loadSessions() {
  const store = readStore();
  return store.sessions;
}

module.exports = {
  loadSessions,
  persistSession,
  storePath,
};