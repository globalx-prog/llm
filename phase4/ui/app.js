const API_BASE = window.LLM_API_BASE || `${window.location.protocol}//${window.location.hostname}:4100`;

const el = (id) => document.getElementById(id);
const state = {
  session: null,
  audit: [],
  history: [],
  chatHistory: [],
};
const HISTORY_KEY = 'llm-controldeck-history-v1';
const CHAT_HISTORY_KEY = 'llm-controldeck-chat-history-v1';

const MODEL_PROFILES = {
  'gemma2-2b': {
    css: 'gemma2',
    label: 'Gemma2 2B',
    description:
      'Gemma2 2B (Modelltyp gemma2, 2.6B Parameter): reales Serving ueber Ollama, gut fuer robuste lokale Inferenz bei moderatem Ressourcenbedarf.',
  },
  'gemma3-27b': {
    css: 'gemma3',
    label: 'Gemma3 27B',
    description:
      'Gemma3 27B (Modelltyp gemma3, 27B Parameter): komplexes Modell fuer tieferes Reasoning und laengere, differenzierte Antworten.',
  },
};

function updateModelInfo() {
  const current = el('modelInput').value;
  const profile = MODEL_PROFILES[current] || MODEL_PROFILES['gemma2-2b'];
  const box = el('modelInfo');
  box.classList.remove('gemma2', 'gemma3');
  box.classList.add(profile.css);
  el('modelDesc').textContent = `${profile.description} Rollenlimits: viewer=800 Tokens, admin=4000 Tokens.`;
  el('modelExplainLink').href = `modelle.html#${current}`;
  el('modelExplainLink').textContent = `Was bedeutet ${profile.label}?`;
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      state.history = parsed.slice(0, 30);
    }
  } catch {
    state.history = [];
  }
}

function loadChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      state.chatHistory = parsed.slice(0, 60);
    }
  } catch {
    state.chatHistory = [];
  }
}

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, 30)));
  } catch {
    // Ignore storage errors (private mode / quota).
  }
}

function persistChatHistory() {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(state.chatHistory.slice(0, 60)));
  } catch {
    // Ignore storage errors (private mode / quota).
  }
}

function renderHistory() {
  const ul = el('historyList');
  ul.innerHTML = '';
  if (!state.history.length) {
    const li = document.createElement('li');
    li.textContent = 'Noch keine Suchanfragen.';
    ul.appendChild(li);
    return;
  }

  state.history.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.ts} | ${item.model} | ${item.project || '-'} | ${item.query}`;
    ul.appendChild(li);
  });
}

function renderChatHistory() {
  const ul = el('chatHistoryList');
  ul.innerHTML = '';
  if (!state.chatHistory.length) {
    const li = document.createElement('li');
    li.textContent = 'Noch kein Chatverlauf.';
    ul.appendChild(li);
    return;
  }

  state.chatHistory.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.ts} | ${item.role} | ${item.text}`;
    ul.appendChild(li);
  });
}

function addHistory(query, model, project) {
  const entry = {
    ts: new Date().toISOString().replace('T', ' ').replace('Z', ''),
    query,
    model,
    project,
  };
  state.history.unshift(entry);
  state.history = state.history.slice(0, 30);
  persistHistory();
  renderHistory();
}

function addChatHistory(role, text) {
  const entry = {
    ts: new Date().toISOString().replace('T', ' ').replace('Z', ''),
    role,
    text,
  };
  state.chatHistory.unshift(entry);
  state.chatHistory = state.chatHistory.slice(0, 60);
  persistChatHistory();
  renderChatHistory();
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail =
      data?.error?.message || data?.detail || `HTTP ${res.status} ${res.statusText || 'request failed'}`;
    throw new Error(detail);
  }

  return data || {};
}

function authHeaders() {
  if (!state.session) return {};
  return {
    'X-User': state.session.user,
    'X-Role': state.session.role,
  };
}

function addAudit(type, detail) {
  const entry = `${new Date().toISOString()} | ${type} | ${detail}`;
  state.audit.unshift(entry);
  state.audit = state.audit.slice(0, 20);
  const ul = el('auditList');
  ul.innerHTML = '';
  state.audit.forEach((a) => {
    const li = document.createElement('li');
    li.textContent = a;
    ul.appendChild(li);
  });
}

function addMessage(role, text, persist = true) {
  const box = el('messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  if (persist) {
    addChatHistory(role, text);
  }
}

function setStatus(text, warn = false) {
  const box = el('statusBox');
  box.textContent = text;
  box.style.borderColor = warn ? '#8b1e3f66' : '#00000022';
}

el('loginBtn').addEventListener('click', () => {
  const user = el('userInput').value.trim() || 'user';
  const role = el('roleInput').value;
  state.session = { user, role };
  el('sessionBadge').textContent = `${user} (${role})`;
  addAudit('login', `user=${user}, role=${role}`);
  setStatus('Eingeloggt. Rollensteuerung aktiv.');
});

el('modelInput').addEventListener('change', updateModelInfo);
el('clearHistoryBtn').addEventListener('click', () => {
  state.history = [];
  persistHistory();
  renderHistory();
  addAudit('history', 'suchverlauf geloescht');
});
el('clearChatHistoryBtn').addEventListener('click', () => {
  state.chatHistory = [];
  persistChatHistory();
  renderChatHistory();
  el('messages').innerHTML = '';
  addAudit('history', 'chatverlauf geloescht');
});

document.querySelectorAll('.promptChip').forEach((btn) => {
  btn.addEventListener('click', () => {
    const prompt = btn.dataset.prompt || '';
    el('promptInput').value = prompt;
    el('promptInput').focus();
    addAudit('prompt_example', prompt.slice(0, 60));
  });
});

el('sendBtn').addEventListener('click', async () => {
  const query = el('promptInput').value.trim();
  if (!query) return;
  const model = el('modelInput').value;
  const project = el('projectInput').value.trim() || null;
  const top_k = Number(el('topKInput').value || 5);

  addMessage('user', query);
  addHistory(query, model, project);
  setStatus('Sende Anfrage...');

  try {
    const data = await requestJson(`${API_BASE}/v1/rag/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ query, model, project, top_k }),
    });

    addMessage('bot', data.answer || 'Keine Antwort');

    const srcUl = el('sourcesList');
    srcUl.innerHTML = '';
    (data.sources || []).forEach((s) => {
      const li = document.createElement('li');
      li.textContent = `${s.project || '-'} | ${s.title || '-'} | ${s.path || '-'}`;
      srcUl.appendChild(li);
    });

    if (data.low_confidence) {
      setStatus('Niedrige Konfidenz: keine passenden Quellen.');
      addAudit('low_confidence', query);
    } else {
      setStatus('Antwort erhalten. Quellen aktualisiert.');
      addAudit('answer', `model=${model}, sources=${(data.sources || []).length}`);
    }
  } catch (err) {
    setStatus(`Fehler: ${String(err)}`, true);
    addAudit('error', String(err));
  }
});

el('reindexBtn').addEventListener('click', async () => {
  const reason = el('reasonInput').value.trim();
  const taskId = el('taskInput').value.trim();

  if (!state.session) {
    setStatus('Login erforderlich.', true);
    addAudit('blocked', 'write action ohne login');
    return;
  }
  if (!['admin', 'service'].includes(state.session.role)) {
    setStatus('Write Action blockiert: Rolle darf nicht schreiben.', true);
    addAudit('blocked', `role=${state.session.role}, reason=${reason}, task=${taskId}`);
    return;
  }
  if (!reason || !taskId) {
    setStatus('Grund und Task-ID sind Pflicht.', true);
    addAudit('blocked', 'fehlende Pflichtmetadaten');
    return;
  }

  setStatus('Re-Index laeuft...');
  try {
    const data = await requestJson(`${API_BASE}/v1/rag/ingest`, {
      method: 'POST',
      headers: {
        'X-Reason': reason,
        'X-Task-Id': taskId,
        ...authHeaders(),
      },
    });
    setStatus(`Re-Index fertig: files=${data.files_ingested}, chunks=${data.chunks_ingested}`);
    addAudit('write_action', `allowed role=${state.session.role}, reason=${reason}, task=${taskId}`);
  } catch (err) {
    setStatus(`Re-Index Fehler: ${String(err)}`, true);
    addAudit('error', String(err));
  }
});

(async function boot() {
  loadHistory();
  loadChatHistory();
  renderHistory();
  renderChatHistory();
  state.chatHistory
    .slice()
    .reverse()
    .forEach((entry) => addMessage(entry.role, entry.text, false));
  updateModelInfo();
  setStatus('Pruefe API...');
  try {
    const data = await requestJson(`${API_BASE}/healthz`);
    setStatus(`API bereit: ${data.service}`);
    addAudit('boot', 'ui initialisiert');
  } catch (err) {
    setStatus(`API nicht erreichbar (${API_BASE}). Fehler: ${String(err)}. Hinweis: llm-rag-api auf 0.0.0.0:4100 starten.`, true);
    addAudit('boot_error', String(err));
  }
})();
