const API_BASE = window.LLM_API_BASE || `${window.location.protocol}//${window.location.hostname}:4100`;

const el = (id) => document.getElementById(id);
const state = {
  session: null,
  audit: [],
  history: [],
  chats: {},
  activeChatId: null,
  selectedFsPath: null,
};

const HISTORY_KEY = 'llm-controldeck-history-v1';
const CHAT_STORE_KEY = 'llm-controldeck-chat-store-v2';

const PROJECT_STRUCTURE = {
  name: 'LLM/',
  children: [
    '00_Vorbereitung.md',
    'Phase_0_Systemkonfiguration_und_Kompatibilitaet.md',
    'Phase_1_Grundlagen_und_Sicherheit.md',
    'Phase_2_Multi_LLM_Inferenz.md',
    'Phase_3_RAG_auf_NAS.md',
    'Phase_4_Weboberflaeche_und_Projektkontexte.md',
    'Phase_5_Agenten_und_Dateibearbeitung.md',
    'Phase_6_Betrieb_Backup_Governance.md',
    {
      name: 'phase2/',
      children: ['phase2-router-config.yaml', 'router_service.py'],
    },
    {
      name: 'phase3/',
      children: ['rag_api.py'],
    },
    {
      name: 'phase4/',
      children: [
        {
          name: 'ui/',
          children: ['index.html', 'app.js', 'styles.css', 'modelle.html', 'beispielprompts.html', 'hw-monitor.html'],
        },
      ],
    },
    {
      name: 'phase6/',
      children: ['install_autostart_stack.sh', 'incident_runbook.md'],
    },
  ],
};

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
  'llama3.3-70b': {
    css: 'llama33',
    label: 'Llama 3.3 70B',
    description:
      'Llama 3.3 70B (Modelltyp llama3.3, 70B Parameter): starkes General-Purpose-Modell fuer anspruchsvolle Wissens- und Planungsaufgaben.',
  },
  'deepseek-r1-32b': {
    css: 'deepseekr1',
    label: 'DeepSeek R1 32B',
    description:
      'DeepSeek R1 32B (Modelltyp deepseek-r1, 32B Parameter): auf Reasoning fokussiert, gut fuer mehrstufige Analyse und strukturierte Herleitungen.',
  },
  'deepseek-coder-16b': {
    css: 'deepseekcoder',
    label: 'DeepSeek Coder 16B',
    description:
      'DeepSeek Coder 16B (Modelltyp deepseek-coder, 16B Parameter): spezialisiert auf Code-Erstellung, Refactoring und technische Erklaerungen.',
  },
  'mistral-7b': {
    css: 'mistral7b',
    label: 'Mistral 7B',
    description:
      'Mistral 7B (Modelltyp mistral, 7B Parameter): leichtes universelles Modell fuer schnelle Iterationen und kompakte Antworten.',
  },
};

const AGENT_MODES = {
  off: '',
  planner: 'Agent mode planner: Liefere eine strukturierte Antwort mit klaren Schritten, Prioritaeten und Abhaengigkeiten.',
  coder: 'Agent mode coder: Antworte codeorientiert mit konkreten Aenderungen, Risiken und Testhinweisen.',
  reviewer: 'Agent mode reviewer: Bewerte Risiken, Regressionen, Luecken und nenne verifizierbare Checks.',
};

function nowTs() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function chatId() {
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function updateModelInfo() {
  const current = el('modelInput').value;
  const profile = MODEL_PROFILES[current] || MODEL_PROFILES['gemma2-2b'];
  const box = el('modelInfo');
  box.classList.remove('gemma2', 'gemma3', 'llama33', 'deepseekr1', 'deepseekcoder', 'mistral7b');
  box.classList.add(profile.css);
  el('modelDesc').textContent = `${profile.description} Rollenlimits: viewer=800 Tokens, admin=4000 Tokens.`;
  el('modelExplainLink').href = `modelle.html#${current}`;
  el('modelExplainLink').textContent = `Was bedeutet ${profile.label}?`;
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

function setStatus(text, warn = false) {
  const box = el('statusBox');
  box.textContent = text;
  box.style.borderColor = warn ? '#8b1e3f66' : '#00000022';
}

function authHeaders() {
  if (!state.session) return {};
  return {
    'X-User': state.session.user,
    'X-Role': state.session.role,
  };
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
    const detail = data?.error?.message || data?.detail || `HTTP ${res.status} ${res.statusText || 'request failed'}`;
    throw new Error(detail);
  }
  return data || {};
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, 30)));
  } catch {
    // Ignore storage errors.
  }
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    state.history = Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    state.history = [];
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

function addHistory(query, model, project) {
  state.history.unshift({ ts: nowTs(), query, model, project });
  state.history = state.history.slice(0, 30);
  saveHistory();
  renderHistory();
}

function defaultChat(title = null) {
  const id = chatId();
  const now = new Date().toISOString();
  return {
    id,
    title: title || `Chat ${Object.keys(state.chats).length + 1}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
    stash: {
      selectedModel: el('modelInput')?.value || 'gemma2-2b',
      project: el('projectInput')?.value || 'mim-llm',
      topK: Number(el('topKInput')?.value || 5),
      agentMode: el('agentModeInput')?.value || 'off',
      selectedFsPath: null,
      lastSources: [],
      lastAnswer: '',
    },
  };
}

function activeChat() {
  return state.chats[state.activeChatId] || null;
}

function saveChats() {
  try {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        activeChatId: state.activeChatId,
        chats: Object.values(state.chats).slice(0, 20),
      }),
    );
  } catch {
    // Ignore storage errors.
  }
}

function loadChats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) || '{}');
    const list = Array.isArray(parsed.chats) ? parsed.chats : [];
    list.forEach((chat) => {
      if (chat?.id) {
        state.chats[chat.id] = {
          ...chat,
          messages: Array.isArray(chat.messages) ? chat.messages.slice(-400) : [],
          stash: {
            selectedModel: chat?.stash?.selectedModel || 'gemma2-2b',
            project: chat?.stash?.project || 'mim-llm',
            topK: Number(chat?.stash?.topK || 5),
            agentMode: chat?.stash?.agentMode || 'off',
            selectedFsPath: chat?.stash?.selectedFsPath || null,
            lastSources: Array.isArray(chat?.stash?.lastSources) ? chat.stash.lastSources.slice(0, 25) : [],
            lastAnswer: chat?.stash?.lastAnswer || '',
          },
        };
      }
    });
    state.activeChatId = parsed.activeChatId;
  } catch {
    state.chats = {};
    state.activeChatId = null;
  }

  if (!state.activeChatId || !state.chats[state.activeChatId]) {
    const chat = defaultChat('Chat 1');
    state.chats[chat.id] = chat;
    state.activeChatId = chat.id;
    saveChats();
  }
}

function renderChatSessions() {
  const ul = el('chatSessionsList');
  ul.innerHTML = '';
  Object.values(state.chats)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .forEach((chat) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chatSessionBtn${chat.id === state.activeChatId ? ' active' : ''}`;
      btn.textContent = `${chat.title} (${chat.messages.length})`;
      btn.addEventListener('click', () => switchChat(chat.id));
      li.appendChild(btn);
      ul.appendChild(li);
    });
}

function renderSources(sources) {
  const ul = el('sourcesList');
  ul.innerHTML = '';
  (sources || []).forEach((s) => {
    const li = document.createElement('li');
    li.textContent = `${s.project || '-'} | ${s.title || '-'} | ${s.path || '-'}`;
    ul.appendChild(li);
  });
}

function renderActiveChatHistory() {
  const ul = el('chatHistoryList');
  ul.innerHTML = '';
  const chat = activeChat();

  if (!chat || !chat.messages.length) {
    const li = document.createElement('li');
    li.textContent = 'Noch kein Chatverlauf.';
    ul.appendChild(li);
    return;
  }

  chat.messages.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.ts} | ${item.role} | ${item.text}`;
    ul.appendChild(li);
  });
}

function renderMessages() {
  const box = el('messages');
  box.innerHTML = '';
  const chat = activeChat();
  if (!chat) return;

  chat.messages.forEach((entry) => {
    const div = document.createElement('div');
    div.className = `msg ${entry.role}`;
    div.textContent = entry.text;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;

  renderActiveChatHistory();
  renderSources(chat.stash.lastSources || []);
}

function updateChatStashFromInputs() {
  const chat = activeChat();
  if (!chat) return;

  chat.stash.selectedModel = el('modelInput').value;
  chat.stash.project = el('projectInput').value.trim() || 'mim-llm';
  chat.stash.topK = Number(el('topKInput').value || 5);
  chat.stash.agentMode = el('agentModeInput').value;
  chat.stash.selectedFsPath = state.selectedFsPath;
  chat.updatedAt = new Date().toISOString();
  saveChats();
}

function switchChat(chatId) {
  if (!state.chats[chatId]) return;
  state.activeChatId = chatId;

  const chat = activeChat();
  el('modelInput').value = chat.stash.selectedModel || 'gemma2-2b';
  el('projectInput').value = chat.stash.project || 'mim-llm';
  el('topKInput').value = String(chat.stash.topK || 5);
  el('agentModeInput').value = chat.stash.agentMode || 'off';
  state.selectedFsPath = chat.stash.selectedFsPath || null;

  updateModelInfo();
  renderChatSessions();
  renderProjectStructure();
  renderMessages();
  saveChats();
  addAudit('chat_switch', chatId);
}

function appendMessage(role, text) {
  const chat = activeChat();
  if (!chat) return;

  chat.messages.push({ ts: nowTs(), role, text });
  chat.messages = chat.messages.slice(-400);
  if (chat.messages.length === 1 && role === 'user') {
    chat.title = text.slice(0, 28) || chat.title;
  }
  chat.updatedAt = new Date().toISOString();

  const box = el('messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  renderActiveChatHistory();
  renderChatSessions();
  saveChats();
}

function clearActiveChat() {
  const chat = activeChat();
  if (!chat) return;
  chat.messages = [];
  chat.stash.lastSources = [];
  chat.stash.lastAnswer = '';
  chat.updatedAt = new Date().toISOString();
  renderMessages();
  renderChatSessions();
  saveChats();
}

function pathForNode(basePath, name) {
  return `${basePath}${name}`;
}

function createTreeNode(node, basePath = '') {
  const li = document.createElement('li');
  const label = document.createElement('span');

  const name = typeof node === 'string' ? node : String(node.name || 'node');
  const isFolder = name.endsWith('/');
  const fullPath = pathForNode(basePath, name);

  label.className = `fsNode ${isFolder ? 'folder' : 'file'}`;
  label.textContent = name;
  label.dataset.path = fullPath;
  if (state.selectedFsPath === fullPath) {
    label.classList.add('selected');
  }

  label.addEventListener('click', () => {
    document.querySelectorAll('.fsNode.selected').forEach((n) => n.classList.remove('selected'));
    label.classList.add('selected');
    state.selectedFsPath = fullPath;

    const selectedLabel = el('fsSelectedPath');
    selectedLabel.textContent = `Ausgewaehlt: ${fullPath}`;

    const chat = activeChat();
    if (chat) {
      chat.stash.selectedFsPath = fullPath;
      saveChats();
    }

    if (isFolder) {
      li.classList.toggle('collapsed');
    } else {
      addAudit('fs_select', fullPath);
      if (!el('promptInput').value.trim()) {
        el('promptInput').value = `Analysiere die Datei ${fullPath} im Projektkontext.`;
      }
    }
  });

  li.appendChild(label);

  const children = typeof node === 'string' ? null : node.children;
  if (Array.isArray(children) && children.length) {
    const ul = document.createElement('ul');
    children.forEach((child) => ul.appendChild(createTreeNode(child, fullPath)));
    li.appendChild(ul);
  }

  return li;
}

function renderProjectStructure() {
  const tree = el('fsTree');
  const projectName = (el('projectInput').value || '').trim() || 'projekt';
  el('fsProjectLabel').textContent = `Kontext: ${projectName}`;
  el('fsSelectedPath').textContent = `Ausgewaehlt: ${state.selectedFsPath || '-'}`;

  tree.innerHTML = '';
  tree.appendChild(createTreeNode(PROJECT_STRUCTURE));
}

el('loginBtn').addEventListener('click', () => {
  const user = el('userInput').value.trim() || 'user';
  const role = el('roleInput').value;
  state.session = { user, role };
  el('sessionBadge').textContent = `${user} (${role})`;
  addAudit('login', `user=${user}, role=${role}`);
  setStatus('Eingeloggt. Rollensteuerung aktiv.');
});

el('modelInput').addEventListener('change', () => {
  updateModelInfo();
  updateChatStashFromInputs();
});

el('projectInput').addEventListener('input', () => {
  renderProjectStructure();
  updateChatStashFromInputs();
});

el('topKInput').addEventListener('input', updateChatStashFromInputs);
el('agentModeInput').addEventListener('change', () => {
  updateChatStashFromInputs();
  addAudit('agent_mode', el('agentModeInput').value);
});

el('newChatBtn').addEventListener('click', () => {
  const chat = defaultChat();
  state.chats[chat.id] = chat;
  switchChat(chat.id);
  setStatus(`Neuer Chat erstellt: ${chat.title}`);
  addAudit('chat_new', chat.id);
});

el('clearActiveChatBtn').addEventListener('click', () => {
  clearActiveChat();
  setStatus('Aktiver Chat wurde geleert.');
  addAudit('chat_clear', state.activeChatId || 'none');
});

el('clearHistoryBtn').addEventListener('click', () => {
  state.history = [];
  saveHistory();
  renderHistory();
  addAudit('history', 'suchverlauf geloescht');
});

el('clearChatHistoryBtn').addEventListener('click', () => {
  clearActiveChat();
  addAudit('history', `chatverlauf geloescht (${state.activeChatId || 'none'})`);
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
  const agentMode = el('agentModeInput').value;

  const modeHint = AGENT_MODES[agentMode] || '';
  const finalQuery = modeHint ? `${modeHint}\n\nUser Prompt:\n${query}` : query;

  appendMessage('user', query);
  addHistory(query, model, project);
  setStatus('Sende Anfrage...');

  updateChatStashFromInputs();

  try {
    const data = await requestJson(`${API_BASE}/v1/rag/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ query: finalQuery, model, project, top_k, agent_mode: agentMode }),
    });

    const answer = data.answer || 'Keine Antwort';
    appendMessage('bot', answer);

    const chat = activeChat();
    if (chat) {
      chat.stash.lastSources = Array.isArray(data.sources) ? data.sources.slice(0, 25) : [];
      chat.stash.lastAnswer = answer;
      chat.updatedAt = new Date().toISOString();
      saveChats();
    }

    renderSources(data.sources || []);

    if (data.low_confidence) {
      setStatus('Niedrige Konfidenz: keine passenden Quellen.');
      addAudit('low_confidence', query);
    } else {
      setStatus('Antwort erhalten. Quellen aktualisiert.');
      addAudit('answer', `model=${model}, mode=${agentMode}, sources=${(data.sources || []).length}`);
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
  loadChats();
  renderHistory();
  renderChatSessions();
  switchChat(state.activeChatId);
  renderProjectStructure();
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
