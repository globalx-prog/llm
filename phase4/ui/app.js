const API_BASE = window.LLM_API_BASE || `${window.location.protocol}//${window.location.hostname}:4100`;

const el = (id) => document.getElementById(id);
const state = {
  session: null,
  audit: [],
};

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

function addMessage(role, text) {
  const box = el('messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
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

el('sendBtn').addEventListener('click', async () => {
  const query = el('promptInput').value.trim();
  if (!query) return;
  const model = el('modelInput').value;
  const project = el('projectInput').value.trim() || null;
  const top_k = Number(el('topKInput').value || 5);

  addMessage('user', query);
  setStatus('Sende Anfrage...');

  try {
    const res = await fetch(`${API_BASE}/v1/rag/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ query, model, project, top_k }),
    });
    const data = await res.json();

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
    const res = await fetch(`${API_BASE}/v1/rag/ingest`, {
      method: 'POST',
      headers: {
        'X-Reason': reason,
        'X-Task-Id': taskId,
        ...authHeaders(),
      },
    });
    const data = await res.json();
    setStatus(`Re-Index fertig: files=${data.files_ingested}, chunks=${data.chunks_ingested}`);
    addAudit('write_action', `allowed role=${state.session.role}, reason=${reason}, task=${taskId}`);
  } catch (err) {
    setStatus(`Re-Index Fehler: ${String(err)}`, true);
    addAudit('error', String(err));
  }
});

(async function boot() {
  setStatus('Pruefe API...');
  try {
    const h = await fetch(`${API_BASE}/healthz`);
    const data = await h.json();
    setStatus(`API bereit: ${data.service}`);
    addAudit('boot', 'ui initialisiert');
  } catch (err) {
    setStatus(`API nicht erreichbar: ${String(err)}`, true);
    addAudit('boot_error', String(err));
  }
})();
