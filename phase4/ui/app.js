const API_BASE = window.LLM_API_BASE || (() => {
  if (window.location.protocol === 'https:') {
    return `${window.location.origin}/api`;
  }
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:4100';
  }
  return `${window.location.protocol}//${window.location.hostname}:4100`;
})();

const ROUTER_BASE = window.LLM_ROUTER_BASE || (() => {
  if (window.location.protocol === 'https:') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:4000';
  }
  return `${window.location.protocol}//${window.location.hostname}:4000`;
})();

const ROUTER_KEY = window.LLM_ROUTER_KEY || 'change_me_phase2';

const el = (id) => document.getElementById(id);

const state = {
  session: null,
  users: [],
  workspaces: [],
  activeWorkspaceId: null,
  projects: [],
  activeProject: null,
  modelStatus: {},
  audit: [],
  history: [],
  chats: {},
  activeChatId: null,
  selectedFsPath: null,
};

const HISTORY_KEY = 'llm-controldeck-history-v1';
const CHAT_STORE_PREFIX = 'llm-controldeck-chats-v3';
const USERS_KEY = 'llm-users-v1';
const SESSION_KEY = 'llm-active-session-v1';
const WORKSPACES_KEY = 'llm-workspaces-v1';
const ACTIVE_WORKSPACE_KEY = 'llm-active-workspace-v1';
const PROJECTS_KEY = 'llm-projects-v1';
const ACTIVE_PROJECT_KEY = 'llm-active-project-v1';
const WORKSPACE_TREE_PREFIX = 'llm-workspace-tree-v1';
const WORKSPACE_PICKER_RESULT_KEY = 'llm-workspace-picker-result-v1';

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
    'Phase_7_Smoketests_und_Modellverfuegbarkeit.md',
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
          children: ['index.html', 'app.js', 'styles.css', 'modelle.html', 'beispielprompts.html', 'anleitung.html', 'hw-monitor.html', 'rechte-und-user.html', 'workspaces.html', 'workspace-picker.html', 'hilfe-github-tailscale.html', 'ssh-verbindung.html', 'restart-hilfe.html', 'login-prozess.html'],
        },
      ],
    },
    {
      name: 'phase6/',
      children: ['install_autostart_stack.sh', 'incident_runbook.md'],
    },
  ],
};

let currentProjectStructure = PROJECT_STRUCTURE;

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

const MODEL_BACKEND_TAGS = {
  'gemma2-2b': 'gemma2:2b',
  'gemma3-27b': 'gemma3:27b',
  'llama3.3-70b': 'llama3.3:70b',
  'deepseek-r1-32b': 'deepseek-r1:32b',
  'deepseek-coder-16b': 'deepseek-coder-v2:16b',
  'mistral-7b': 'mistral:7b',
};

const MODEL_ALTERNATIVES = {
  'llama3.3-70b': ['gemma3-27b', 'gemma2-2b'],
  'deepseek-r1-32b': ['gemma3-27b', 'mistral-7b'],
  'deepseek-coder-16b': ['gemma2-2b', 'mistral-7b'],
  'mistral-7b': ['gemma2-2b', 'gemma3-27b'],
  'gemma3-27b': ['gemma2-2b', 'mistral-7b'],
  'gemma2-2b': ['gemma3-27b', 'mistral-7b'],
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

function workspaceId() {
  return `ws-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function defaultWorkspaces() {
  return [
    {
      id: 'ws-default',
      name: 'LLM (Standard)',
      path: '/home/clemi/projekte/LLM',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      projectHint: 'mim-llm',
      executedChats: [],
    },
  ];
}

function defaultUsers() {
  return [
    { user: 'clemi', role: 'admin', projects: ['mim-llm'] },
    { user: 'service-bot', role: 'service', projects: ['mim-llm'] },
    { user: 'reviewer-demo', role: 'reviewer', projects: ['mim-llm'] },
  ];
}

function defaultProjects() {
  return ['mim-llm'];
}

function normalizeProjectName(value) {
  return String(value || '').trim();
}

function saveProjects() {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(state.projects));
  } catch {
    // ignore storage errors
  }
}

function saveActiveProject() {
  try {
    localStorage.setItem(ACTIVE_PROJECT_KEY, String(state.activeProject || ''));
  } catch {
    // ignore storage errors
  }
}

function renderProjectSelect() {
  const select = el('projectSelect');
  if (!select) return;
  select.innerHTML = '';
  state.projects.forEach((projectName) => {
    const option = document.createElement('option');
    option.value = projectName;
    option.textContent = projectName;
    if (projectName === state.activeProject) option.selected = true;
    select.appendChild(option);
  });
}

function addProject(projectName) {
  const cleaned = normalizeProjectName(projectName);
  if (!cleaned) return '';
  if (!state.projects.includes(cleaned)) {
    state.projects.push(cleaned);
    state.projects.sort((a, b) => a.localeCompare(b));
    saveProjects();
  }
  return cleaned;
}

function normalizeAndStoreProjectContext(value) {
  const cleaned = addProject(value);
  if (!cleaned) return '';
  if (el('projectInput')) el('projectInput').value = cleaned;
  state.activeProject = cleaned;
  saveActiveProject();
  return cleaned;
}

function activateProject(projectName, options = {}) {
  const cleaned = addProject(projectName);
  if (!cleaned) return false;

  const { updateWorkspace = true, auditType = 'project_switch' } = options;
  state.activeProject = cleaned;
  saveActiveProject();

  if (el('projectInput')) el('projectInput').value = cleaned;
  renderProjectSelect();

  const ws = activeWorkspace();
  if (updateWorkspace && ws) {
    ws.projectHint = cleaned;
    ws.lastUsedAt = new Date().toISOString();
    saveWorkspaces();
  }

  renderProjectStructure();
  updateChatStashFromInputs();
  addAudit(auditType, cleaned);
  return true;
}

function loadProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    if (Array.isArray(parsed)) {
      state.projects = parsed.map((p) => normalizeProjectName(p)).filter(Boolean);
    }
  } catch {
    state.projects = [];
  }

  if (!state.projects.length) {
    state.projects = defaultProjects();
  }

  state.workspaces.forEach((ws) => {
    const hint = normalizeProjectName(ws?.projectHint || '');
    if (hint && !state.projects.includes(hint)) state.projects.push(hint);
  });

  (state.users || []).forEach((u) => {
    (u?.projects || []).forEach((projectName) => {
      const cleaned = normalizeProjectName(projectName);
      if (cleaned && !state.projects.includes(cleaned)) state.projects.push(cleaned);
    });
  });

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${CHAT_STORE_PREFIX}:`)) continue;
      const raw = localStorage.getItem(key) || '{}';
      const parsed = JSON.parse(raw);
      const chats = Array.isArray(parsed?.chats) ? parsed.chats : [];
      chats.forEach((chat) => {
        const project = normalizeProjectName(chat?.stash?.project || '');
        if (project && !state.projects.includes(project)) state.projects.push(project);
      });
    }
  } catch {
    // ignore storage read/parse errors
  }

  state.projects = [...new Set(state.projects)].sort((a, b) => a.localeCompare(b));

  try {
    state.activeProject = normalizeProjectName(localStorage.getItem(ACTIVE_PROJECT_KEY) || '');
  } catch {
    state.activeProject = '';
  }

  const wsHint = normalizeProjectName(activeWorkspace()?.projectHint || '');
  if (!state.activeProject) {
    state.activeProject = wsHint || state.projects[0] || 'mim-llm';
  }
  if (!state.projects.includes(state.activeProject)) {
    state.projects.unshift(state.activeProject);
  }

  state.projects = [...new Set(state.projects)].sort((a, b) => a.localeCompare(b));
  if (el('projectInput')) el('projectInput').value = state.activeProject;
  saveProjects();
  saveActiveProject();
  renderProjectSelect();
}

function openProjectFromPrompt() {
  const preset = normalizeProjectName(el('projectInput')?.value || state.activeProject || 'mim-llm');
  const picked = window.prompt('Projektname oeffnen', preset);
  if (picked === null) return;
  if (!activateProject(picked, { updateWorkspace: true, auditType: 'project_open_prompt' })) {
    setStatus('Ungueltiger Projektname.', true);
  } else {
    setStatus(`Projekt geoeffnet: ${normalizeProjectName(picked)}`);
  }
}

function createProjectFromPrompt() {
  const picked = window.prompt('Neues Projekt anlegen', 'neues-projekt');
  if (picked === null) return;
  if (!activateProject(picked, { updateWorkspace: true, auditType: 'project_new' })) {
    setStatus('Projekt konnte nicht angelegt werden.', true);
  } else {
    setStatus(`Projekt angelegt: ${normalizeProjectName(picked)}`);
  }
}

function normalizeUser(name) {
  return String(name || '').trim();
}

function roleLabel(role) {
  if (role === 'admin') return 'admin-owner';
  if (role === 'service') return 'service-context';
  return 'review-only';
}

function findUser(username) {
  return state.users.find((u) => u.user === normalizeUser(username)) || null;
}

function sessionChatStoreKey() {
  const user = normalizeUser(state.session?.user || 'guest').toLowerCase();
  const workspace = String(state.activeWorkspaceId || 'ws-default');
  return `${CHAT_STORE_PREFIX}:${user}:${workspace}`;
}

function saveActiveWorkspace() {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, String(state.activeWorkspaceId || ''));
  } catch {
    // ignore storage errors
  }
}

function workspaceTreeKey(workspaceId) {
  return `${WORKSPACE_TREE_PREFIX}:${workspaceId}`;
}

function cloneTree(tree) {
  try {
    return JSON.parse(JSON.stringify(tree));
  } catch {
    return PROJECT_STRUCTURE;
  }
}

function workspaceBasename(pathValue) {
  const cleaned = String(pathValue || '').trim().replace(/\/+$/, '');
  return cleaned.split('/').filter(Boolean).slice(-1)[0] || 'workspace';
}

function defaultTreeForWorkspace(ws) {
  const wsPath = String(ws?.path || '').trim();
  const wsName = String(ws?.name || '').trim() || workspaceBasename(wsPath);

  if (wsPath === '/home/clemi/projekte/LLM') {
    return cloneTree(PROJECT_STRUCTURE);
  }

  return {
    name: `${wsName}/`,
    children: [
      'README.md',
      'src/',
      'docs/',
      'tests/',
      {
        name: 'hinweise/',
        children: [
          'Dateibaum_platzhalter.txt',
          `Workspace_Pfad_${workspaceBasename(wsPath)}.txt`,
        ],
      },
    ],
  };
}

function hasWorkspaceTree(workspaceId) {
  try {
    const raw = localStorage.getItem(workspaceTreeKey(workspaceId));
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!(parsed && parsed.name && Array.isArray(parsed.children));
  } catch {
    return false;
  }
}

function saveWorkspaceTree(workspaceId, tree) {
  if (!workspaceId || !tree) return;
  try {
    localStorage.setItem(workspaceTreeKey(workspaceId), JSON.stringify(tree));
  } catch {
    // ignore storage errors
  }
}

function loadWorkspaceTree(workspaceId, ws = null) {
  if (!workspaceId) return cloneTree(PROJECT_STRUCTURE);
  try {
    const parsed = JSON.parse(localStorage.getItem(workspaceTreeKey(workspaceId)) || 'null');
    if (parsed && parsed.name && Array.isArray(parsed.children)) {
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return defaultTreeForWorkspace(ws);
}

function buildStructureFromFileList(rootName, relativePaths) {
  const mkNode = () => ({ folders: new Map(), files: new Set() });
  const root = mkNode();
  const normalizedRoot = String(rootName || '').trim().replace(/\/+$/, '');

  relativePaths.forEach((rawPath) => {
    const rel = String(rawPath || '').trim();
    if (!rel) return;
    const parts = rel.split('/').filter(Boolean);
    if (normalizedRoot && parts[0] === normalizedRoot) {
      parts.shift();
    }
    if (!parts.length) return;
    let node = root;
    if (parts.length <= 1) {
      node.files.add(parts[0]);
      return;
    }
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        node.files.add(part);
      } else {
        if (!node.folders.has(part)) {
          node.folders.set(part, mkNode());
        }
        node = node.folders.get(part);
      }
    }
  });

  const toChildren = (node) => {
    const folders = [...node.folders.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, child]) => ({ name: `${name}/`, children: toChildren(child) }));
    const files = [...node.files].sort((a, b) => a.localeCompare(b));
    return [...folders, ...files];
  };

  return {
    name: `${rootName || 'workspace'}/`,
    children: toChildren(root),
  };
}

function activeWorkspace() {
  return state.workspaces.find((ws) => ws.id === state.activeWorkspaceId) || null;
}

function saveWorkspaces() {
  try {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(state.workspaces));
  } catch {
    // ignore storage errors
  }
}

function renderWorkspaceSelect() {
  const select = el('workspaceSelect');
  if (!select) return;
  select.innerHTML = '';

  state.workspaces.forEach((ws) => {
    const option = document.createElement('option');
    option.value = ws.id;
    option.textContent = `${ws.name} (${ws.path || '-'})`;
    if (ws.id === state.activeWorkspaceId) option.selected = true;
    select.appendChild(option);
  });
}

function loadWorkspaces() {
  try {
    const savedActive = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (savedActive) {
      state.activeWorkspaceId = savedActive;
    }
  } catch {
    // ignore storage errors
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACES_KEY) || '[]');
    if (Array.isArray(parsed) && parsed.length) {
      state.workspaces = parsed
        .filter((ws) => ws && ws.id && ws.name)
        .map((ws) => ({
          id: String(ws.id),
          name: String(ws.name),
          path: String(ws.path || '').trim(),
          createdAt: String(ws.createdAt || new Date().toISOString()),
          lastUsedAt: String(ws.lastUsedAt || new Date().toISOString()),
          projectHint: String(ws.projectHint || 'mim-llm'),
          executedChats: Array.isArray(ws.executedChats) ? ws.executedChats.slice(0, 80) : [],
        }));
    }
  } catch {
    state.workspaces = [];
  }

  if (!state.workspaces.length) {
    state.workspaces = defaultWorkspaces();
    saveWorkspaces();
  }

  if (!state.activeWorkspaceId || !activeWorkspace()) {
    state.activeWorkspaceId = state.workspaces[0].id;
  }

  saveActiveWorkspace();
  renderWorkspaceSelect();
}

function trackWorkspaceExecution(chat) {
  const ws = activeWorkspace();
  if (!ws || !chat) return;
  const now = new Date().toISOString();
  const user = normalizeUser(state.session?.user || 'guest');
  const idx = ws.executedChats.findIndex((entry) => entry.chatId === chat.id && entry.user === user);
  const record = {
    chatId: chat.id,
    title: chat.title,
    user,
    updatedAt: now,
  };
  if (idx >= 0) {
    ws.executedChats[idx] = record;
  } else {
    ws.executedChats.unshift(record);
  }
  ws.executedChats = ws.executedChats.slice(0, 120);
  ws.lastUsedAt = now;
  saveWorkspaces();
}

async function browseWorkspaceFromFileSystem() {
  if (!window.showDirectoryPicker) {
    return (el('workspacePathInput')?.value || '').trim();
  }

  try {
    const dir = await window.showDirectoryPicker();
    const pickedName = String(dir?.name || '').trim();
    const fallbackPath = pickedName ? `/home/clemi/projekte/${pickedName}` : '/home/clemi/projekte/LLM';
    return (el('workspacePathInput')?.value || '').trim() || fallbackPath;
  } catch {
    return '';
  }
}

function workspaceDraft(defaultName, defaultPath) {
  const nameInput = (el('workspaceNameInput')?.value || '').trim();
  const pathInput = (el('workspacePathInput')?.value || '').trim();
  return {
    name: nameInput || defaultName,
    path: pathInput || defaultPath,
  };
}

function createWorkspace(name, path) {
  const wsName = String(name || '').trim();
  const wsPath = String(path || '').trim();
  if (!wsName || !wsPath) return null;

  const existing = state.workspaces.find((ws) => ws.path.toLowerCase() === wsPath.toLowerCase());
  if (existing) {
    existing.name = wsName;
    existing.lastUsedAt = new Date().toISOString();
    state.activeWorkspaceId = existing.id;
    saveActiveWorkspace();
    saveWorkspaces();
    if (!hasWorkspaceTree(existing.id)) {
      saveWorkspaceTree(existing.id, defaultTreeForWorkspace(existing));
    }
    renderWorkspaceSelect();
    return existing;
  }

  const created = {
    id: workspaceId(),
    name: wsName,
    path: wsPath,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    projectHint: el('projectInput')?.value?.trim() || 'mim-llm',
    executedChats: [],
  };
  state.workspaces.unshift(created);
  state.activeWorkspaceId = created.id;
  saveActiveWorkspace();
  saveWorkspaces();
  saveWorkspaceTree(created.id, defaultTreeForWorkspace(created));
  renderWorkspaceSelect();
  return created;
}

function activateWorkspaceSession(ws) {
  if (!ws) return;
  state.activeWorkspaceId = ws.id;
  saveActiveWorkspace();
  currentProjectStructure = loadWorkspaceTree(ws.id, ws);
  if (!hasWorkspaceTree(ws.id)) {
    saveWorkspaceTree(ws.id, currentProjectStructure);
  }
  state.selectedFsPath = null;
  if (el('workspaceNameInput')) el('workspaceNameInput').value = ws.name || '';
  if (el('workspacePathInput')) el('workspacePathInput').value = ws.path || '';
  activateProject(ws.projectHint || el('projectInput')?.value || 'mim-llm', { updateWorkspace: false, auditType: 'project_sync_workspace' });
  loadChats();
  renderChatSessions();
  switchChat(state.activeChatId);
  renderProjectStructure();
}

function syncWorkspaceFromStorage() {
  loadWorkspaces();
  let storedId = '';
  try {
    storedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY) || '';
  } catch {
    storedId = '';
  }
  if (!storedId || storedId === state.activeWorkspaceId) return;

  const ws = state.workspaces.find((item) => String(item.id) === String(storedId));
  if (!ws) return;
  activateWorkspaceSession(ws);
  addAudit('workspace_sync', ws.id);
  setStatus(`Workspace synchronisiert: ${ws.name}`);
}

function updateUserSuggestions() {
  const list = el('userSuggestions');
  if (!list) return;
  list.innerHTML = '';
  state.users.forEach((u) => {
    const option = document.createElement('option');
    option.value = u.user;
    list.appendChild(option);
  });
}

function saveUsers() {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(state.users));
  } catch {
    // ignore storage errors
  }
}

function loadUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    if (Array.isArray(parsed) && parsed.length) {
      state.users = parsed
        .filter((u) => normalizeUser(u?.user))
        .map((u) => ({
          user: normalizeUser(u.user),
          role: ['admin', 'service', 'reviewer'].includes(String(u.role)) ? String(u.role) : 'reviewer',
          projects: Array.isArray(u.projects) && u.projects.length ? u.projects.map((p) => String(p).trim()).filter(Boolean) : ['mim-llm'],
        }));
    }
  } catch {
    state.users = [];
  }

  if (!state.users.length) {
    state.users = defaultUsers();
    saveUsers();
  }
  updateUserSuggestions();
}

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session || null));
  } catch {
    // ignore storage errors
  }
}

function loadSession() {
  try {
    let raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        sessionStorage.setItem(SESSION_KEY, raw);
        localStorage.removeItem(SESSION_KEY);
      }
    }
    const parsed = JSON.parse(raw || 'null');
    if (parsed && parsed.user) {
      state.session = { user: normalizeUser(parsed.user), role: String(parsed.role || 'reviewer') };
      el('sessionBadge').textContent = `${state.session.user} (${state.session.role})`;
      el('userInput').value = state.session.user;
      el('roleInput').value = state.session.role;
    }
  } catch {
    state.session = null;
  }
}

function updateModelInfo() {
  const box = el('modelInfo');
  const desc = el('modelDesc');
  const link = el('modelExplainLink');
  if (!box || !desc || !link) return;

  const current = el('modelInput').value;
  const profile = MODEL_PROFILES[current] || MODEL_PROFILES['gemma2-2b'];
  box.classList.remove('gemma2', 'gemma3', 'llama33', 'deepseekr1', 'deepseekcoder', 'mistral7b');
  box.classList.add(profile.css);
  const status = state.modelStatus[current];
  const statusHint = status?.ok
    ? ' Verfuegbarkeit: nutzbar.'
    : (status && status.ok === false)
      ? ` Verfuegbarkeit: aktuell nicht nutzbar (${status.reason || 'kein Modell-Response'}).`
      : ' Verfuegbarkeit: noch nicht geprueft.';
  desc.textContent = `${profile.description} Rollenlimits: viewer=800 Tokens, admin=4000 Tokens.${statusHint}`;
  link.href = `modelle.html#${current}`;
  link.textContent = `Was bedeutet ${profile.label}?`;
  setModelInputHealth(current);
}

function setModelInputHealth(model) {
  const select = el('modelInput');
  if (!select) return;
  select.classList.add('modelSelectable');
  select.classList.remove('modelOk', 'modelWarn');
  const status = state.modelStatus[model];
  if (status?.ok === true) {
    select.classList.add('modelOk');
  } else if (status?.ok === false) {
    select.classList.add('modelWarn');
  }
}

function modelLabel(model) {
  return MODEL_PROFILES[model]?.label || model;
}

function bestAvailableAlternative(model) {
  const candidates = MODEL_ALTERNATIVES[model] || [];
  const available = candidates.find((cand) => state.modelStatus[cand]?.ok === true);
  return available || candidates[0] || null;
}

function renderModelHealth() {
  const ul = el('modelHealthList');
  if (!ul) return;
  ul.innerHTML = '';

  const problematicModels = Object.keys(MODEL_PROFILES)
    .filter((model) => {
      const status = state.modelStatus[model];
      return !status || status.ok === false;
    });

  if (!problematicModels.length) {
    const li = document.createElement('li');
    li.className = 'healthOk';
    li.textContent = 'Alle geprueften Modelle sind aktuell nutzbar.';
    ul.appendChild(li);
    return;
  }

  problematicModels.forEach((model) => {
    const li = document.createElement('li');
    const backend = MODEL_BACKEND_TAGS[model] || '-';
    const status = state.modelStatus[model];
    if (!status) {
      li.className = 'healthInfo';
      li.textContent = `PRUEFUNG AUSSTEHEND | ${modelLabel(model)} | Backend ${backend}`;
      ul.appendChild(li);
      return;
    }

    if (status.ok) {
      li.className = 'healthOk';
      li.textContent = `NUTZBAR | ${modelLabel(model)} | Backend ${backend}`;
      ul.appendChild(li);
      return;
    }

    li.className = 'healthWarn';
    const alt = bestAvailableAlternative(model);
    const altText = alt ? ` | Alternative: ${modelLabel(alt)}` : '';
    li.textContent = `NICHT NUTZBAR | ${modelLabel(model)} | Backend ${backend} | Grund: ${status.reason || 'kein Modell-Response'}${altText}`;
    ul.appendChild(li);
  });
}

async function probeModel(model) {
  try {
    const fallbackUser = normalizeUser(el('userInput')?.value || 'clemi') || 'clemi';
    const headers = { 'Content-Type': 'application/json', ...authHeaders() };
    if (!headers['X-User']) headers['X-User'] = fallbackUser;
    if (!headers['X-Role']) headers['X-Role'] = 'admin';

    const data = await requestJson(`${API_BASE}/v1/rag/model_probe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
      }),
    });
    if (!data?.ok) return { ok: false, reason: 'keine Modellantwort' };
    return { ok: true, reason: '' };
  } catch (err) {
    const reason = String(err);
    if (reason.includes('NetworkError')) {
      return { ok: false, reason: 'Netzwerkfehler zwischen Browser und API (fetch)' };
    }
    return { ok: false, reason };
  }
}

async function checkModelsAvailability() {
  setStatus('Pruefe Modellverfuegbarkeit...');
  const models = Object.keys(MODEL_PROFILES);
  for (const model of models) {
    state.modelStatus[model] = await probeModel(model);
    renderModelHealth();
    if (el('modelInput').value === model) {
      setModelInputHealth(model);
      updateModelInfo();
    }
  }

  const okCount = models.filter((m) => state.modelStatus[m]?.ok).length;
  const badCount = models.length - okCount;
  setStatus(`Modellcheck abgeschlossen: ${okCount} nutzbar, ${badCount} nicht nutzbar.`);
  addAudit('model_check', `ok=${okCount}, failed=${badCount}`);
}

function renderSmokeTestResults(results) {
  const ul = el('smokeTestList');
  if (!ul) return;
  ul.innerHTML = '';

  results.forEach((item) => {
    const li = document.createElement('li');
    li.className = item.ok ? 'healthOk' : 'healthWarn';
    li.textContent = `${item.ok ? 'PASS' : 'FAIL'} | ${item.name}${item.detail ? ` | ${item.detail}` : ''}`;
    ul.appendChild(li);
  });
}

function resetButtonTestHighlights() {
  document.querySelectorAll('button.btnTestOk, button.btnTestFail').forEach((btn) => {
    btn.classList.remove('btnTestOk', 'btnTestFail');
  });
}

function markButtons(buttonIds, ok) {
  (buttonIds || []).forEach((id) => {
    const btn = el(id);
    if (!btn) return;
    btn.classList.remove('btnTestOk', 'btnTestFail');
    btn.classList.add(ok ? 'btnTestOk' : 'btnTestFail');
  });
}

async function runSmokeTests() {
  const results = [];
  const push = (name, ok, detail = '', buttonIds = []) => {
    results.push({ name, ok, detail });
    markButtons(buttonIds, ok);
  };
  const wait = (ms = 20) => new Promise((resolve) => window.setTimeout(resolve, ms));
  resetButtonTestHighlights();

  const ensure = (id) => {
    const node = el(id);
    if (!node) throw new Error(`${id} fehlt`);
    return node;
  };

  try {
    const btnIds = [
      'loginBtn',
      'logoutBtn',
      'browseWorkspaceBtn',
      'browseWorkspaceInteractiveBtn',
      'newWorkspaceBtn',
      'newChatBtn',
      'clearActiveChatBtn',
      'clearHistoryBtn',
      'clearChatHistoryBtn',
      'addSelectedFileBtn',
      'addLocalFilesBtn',
      'clearContextFilesBtn',
      'addManualContextPathBtn',
      'sendBtn',
      'reindexBtn',
      'fsWriteBtn',
      'checkModelsBtn',
      'runSmokeTestsBtn',
    ];
    btnIds.forEach((id) => ensure(id));
    push('Alle erwarteten Buttons vorhanden', true, `${btnIds.length} IDs geprueft`, btnIds);
  } catch (err) {
    push('Alle erwarteten Buttons vorhanden', false, String(err));
  }

  try {
    const oldOpen = window.open;
    window.open = () => {
      window.setTimeout(() => {
        applyWorkspacePickerResult(JSON.stringify({ name: 'smoke-ws', path: '/tmp/smoke-ws', ts: Date.now() }));
      }, 0);
      return { focus() {} };
    };
    ensure('browseWorkspaceBtn').click();
    await wait(40);
    const exists = state.workspaces.some((ws) => ws.path === '/tmp/smoke-ws');
    push('Workspace Browse legt Workspace an', exists, exists ? '' : 'workspace nicht erstellt', ['browseWorkspaceBtn']);
    window.open = oldOpen;
  } catch (err) {
    push('Workspace Browse legt Workspace an', false, String(err));
  }

  try {
    const wsBefore = activeWorkspace()?.id || '';
    const selectedBefore = state.selectedFsPath;
    const alternate = state.workspaces.find((w) => w.id !== wsBefore);
    if (alternate) {
      const select = ensure('workspaceSelect');
      select.value = alternate.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(30);
      const treeWorkspaceText = String(el('fsSelectedPath')?.textContent || '');
      const switched = activeWorkspace()?.id === alternate.id && treeWorkspaceText.includes(alternate.path || '');
      push('Workspace-Wechsel aktualisiert Suchbaum rechts', switched, treeWorkspaceText, ['workspaceSelect']);
      state.selectedFsPath = selectedBefore;
    } else {
      push('Workspace-Wechsel aktualisiert Suchbaum rechts', true, 'nur ein Workspace vorhanden', ['workspaceSelect']);
    }
  } catch (err) {
    push('Workspace-Wechsel aktualisiert Suchbaum rechts', false, String(err), ['workspaceSelect']);
  }

  try {
    const before = Object.keys(state.chats).length;
    ensure('newChatBtn').click();
    await wait();
    const after = Object.keys(state.chats).length;
    push('Neuer Chat Button', after === before + 1, `vorher=${before}, nachher=${after}`, ['newChatBtn']);
  } catch (err) {
    push('Neuer Chat Button', false, String(err));
  }

  try {
    const firstChip = document.querySelector('.promptChip');
    if (!firstChip) throw new Error('kein promptChip gefunden');
    firstChip.click();
    await wait();
    const txt = String(el('promptInput')?.value || '').trim();
    push('Prompt-Chips fuellen Eingabefeld', txt.length > 0, txt.slice(0, 80), []);
  } catch (err) {
    push('Prompt-Chips fuellen Eingabefeld', false, String(err));
  }

  try {
    const topLinks = Array.from(document.querySelectorAll('.topbarActions a.topLink'));
    const allHaveHref = topLinks.length >= 5 && topLinks.every((a) => String(a.getAttribute('href') || '').trim().length > 0);
    push('Topbar-Links vorhanden und gueltig', allHaveHref, `anzahl=${topLinks.length}`);
  } catch (err) {
    push('Topbar-Links vorhanden und gueltig', false, String(err));
  }

  try {
    const chat = activeChat();
    if (!chat) throw new Error('kein aktiver Chat');
    chat.messages.push({ ts: nowTs(), role: 'user', text: 'smoke message' });
    ensure('clearActiveChatBtn').click();
    await wait();
    push('Aktiven Chat leeren', chat.messages.length === 0, `messages=${chat.messages.length}`, ['clearActiveChatBtn']);
  } catch (err) {
    push('Aktiven Chat leeren', false, String(err));
  }

  try {
    state.history = [{ ts: nowTs(), query: 'smoke', model: 'gemma2-2b', project: 'mim-llm' }];
    saveHistory();
    renderHistory();
    ensure('clearHistoryBtn').click();
    await wait();
    push('Suchverlauf leeren', state.history.length === 0, `history=${state.history.length}`, ['clearHistoryBtn']);
  } catch (err) {
    push('Suchverlauf leeren', false, String(err), ['clearHistoryBtn']);
  }

  try {
    const files = [
      { name: 'index.html', webkitRelativePath: 'demo-ws/index.html' },
      { name: 'app.js', webkitRelativePath: 'demo-ws/src/app.js' },
      { name: 'readme.md', webkitRelativePath: 'demo-ws/docs/readme.md' },
    ];
    el('workspaceNameInput').value = '';
    el('workspacePathInput').value = '';
    createWorkspaceFromFileList(files);
    await wait(40);
    const ws = activeWorkspace();
    const ok = !!ws && ws.path.includes('/home/clemi/projekte/demo-ws') && !!currentProjectStructure?.children?.length;
    push('Interaktiver FS-Browse importiert Struktur', ok, ws ? `${ws.name} @ ${ws.path}` : 'kein workspace');
  } catch (err) {
    push('Interaktiver FS-Browse importiert Struktur', false, String(err));
  }

  try {
    el('manualContextPathInput').value = 'phase4/ui/index.html';
    ensure('addManualContextPathBtn').click();
    await wait();
    const hasContext = (activeChat()?.stash?.contextFiles || []).includes('phase4/ui/index.html');
    push('Manueller Kontextpfad', hasContext, hasContext ? '' : 'nicht hinzugefuegt', ['addManualContextPathBtn']);
  } catch (err) {
    push('Manueller Kontextpfad', false, String(err));
  }

  try {
    ensure('clearContextFilesBtn').click();
    await wait();
    const empty = (activeChat()?.stash?.contextFiles || []).length === 0;
    push('Kontextdateien leeren', empty, empty ? '' : 'nicht geleert', ['clearContextFilesBtn']);
  } catch (err) {
    push('Kontextdateien leeren', false, String(err));
  }

  try {
    const chat = activeChat();
    if (!chat) throw new Error('kein aktiver Chat');
    chat.messages.push({ ts: nowTs(), role: 'user', text: 'history reset smoke' });
    renderMessages();
    ensure('clearChatHistoryBtn').click();
    await wait();
    push('Chatverlauf leeren', (activeChat()?.messages || []).length === 0, `messages=${(activeChat()?.messages || []).length}`, ['clearChatHistoryBtn']);
  } catch (err) {
    push('Chatverlauf leeren', false, String(err), ['clearChatHistoryBtn']);
  }

  try {
    ensure('checkModelsBtn').click();
    await wait(50);
    const statusTxt = String(el('statusBox')?.textContent || '');
    const started = statusTxt.includes('Pruefe Modellverfuegbarkeit') || statusTxt.includes('Modellcheck abgeschlossen');
    push('Modelle pruefen Button', started, statusTxt, ['checkModelsBtn']);
  } catch (err) {
    push('Modelle pruefen Button', false, String(err), ['checkModelsBtn']);
  }

  const oldFetch = window.fetch;
  try {
    window.fetch = async (url, options = {}) => {
      const target = String(url || '');
      if (target.includes('/v1/rag/answer')) {
        return new Response(JSON.stringify({ answer: 'OK', sources: [], low_confidence: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (target.includes('/v1/rag/ingest')) {
        return new Response(JSON.stringify({ files_ingested: 1, chunks_ingested: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (target.includes('/v1/rag/fs/write')) {
        return new Response(JSON.stringify({ ok: true, path: '/mnt/nas/knowledge/mim-llm/mock.txt', bytes_written: 12 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (target.includes('/healthz')) {
        return new Response(JSON.stringify({ service: 'mock-api' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return oldFetch(url, options);
    };

    const before = (activeChat()?.messages || []).length;
    el('promptInput').value = 'smoke send';
    ensure('sendBtn').click();
    await wait(80);
    const after = (activeChat()?.messages || []).length;
    push('Senden Button', after >= before + 2, `messages vorher=${before}, nachher=${after}`, ['sendBtn']);

    el('userInput').value = 'smoke-admin';
    el('roleInput').value = 'admin';
    ensure('loginBtn').click();
    await wait();
    const auditBefore = state.audit.slice();
    ensure('reindexBtn').click();
    await wait(60);
    const wroteAction = state.audit.some((entry) => entry.includes('| write_action |') && !auditBefore.includes(entry));
    const detail = wroteAction ? 'write_action Audit erkannt' : (el('statusBox').textContent || 'kein write_action Audit');
    push('Re-Index Button', wroteAction, detail, ['reindexBtn']);

    el('fsWritePathInput').value = 'smoke-write.md';
    el('fsWriteContentInput').value = 'smoke write';
    ensure('fsWriteBtn').click();
    await wait(50);
    const wroteFile = String(el('statusBox')?.textContent || '').includes('Datei geschrieben');
    push('Datei schreiben Button', wroteFile, String(el('statusBox')?.textContent || ''), ['fsWriteBtn']);
  } catch (err) {
    push('Senden/Re-Index', false, String(err), ['sendBtn', 'reindexBtn']);
  } finally {
    window.fetch = oldFetch;
  }

  try {
    ensure('logoutBtn').click();
    await wait();
    const loggedOut = !state.session;
    push('Logout Button', loggedOut, loggedOut ? '' : 'session noch gesetzt', ['logoutBtn']);
  } catch (err) {
    push('Logout Button', false, String(err));
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  renderSmokeTestResults(results);
  addAudit('smoke_test', `pass=${pass}, fail=${fail}`);
  setStatus(`Smoke-Tests fertig: ${pass} bestanden, ${fail} fehlgeschlagen.`, fail > 0);
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

function renderUiHealth() {
  const list = el('uiHealthList');
  if (!list) return;
  const checks = [
    ['workspaceSelect', 'Workspace Auswahl'],
    ['browseWorkspaceBtn', 'Workspace Browse Button'],
    ['browseWorkspaceInteractiveBtn', 'Interaktiv Browse Button'],
    ['newWorkspaceBtn', 'Neuer Workspace Button'],
    ['addSelectedFileBtn', 'Datei aus Baum hinzufuegen'],
    ['addLocalFilesBtn', 'Einzeldateien hinzufuegen'],
    ['sendBtn', 'Senden Button'],
    ['loginBtn', 'Login Button'],
    ['checkModelsBtn', 'Modelle pruefen Button'],
    ['runSmokeTestsBtn', 'Smoke-Tests Button'],
  ];

  list.innerHTML = '';
  checks.forEach(([id, label]) => {
    const li = document.createElement('li');
    const ok = !!el(id);
    li.className = ok ? 'healthOk' : 'healthWarn';
    li.textContent = `${ok ? 'OK' : 'FEHLT'} | ${label}`;
    list.appendChild(li);
  });
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
  const ws = activeWorkspace();
  return {
    id,
    title: title || `Chat ${Object.keys(state.chats).length + 1}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
    stash: {
      selectedModel: el('modelInput')?.value || 'gemma2-2b',
      project: el('projectInput')?.value || 'mim-llm',
      workspaceId: ws?.id || state.activeWorkspaceId || 'ws-default',
      workspacePath: ws?.path || '/home/clemi/projekte/LLM',
      topK: Number(el('topKInput')?.value || 5),
      useWeb: !!el('useWebInput')?.checked,
      webTopK: Number(el('webTopKInput')?.value || 3),
      agentMode: el('agentModeInput')?.value || 'off',
      selectedFsPath: null,
      contextFiles: [],
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
      sessionChatStoreKey(),
      JSON.stringify({
        activeChatId: state.activeChatId,
        chats: Object.values(state.chats).slice(0, 40),
      }),
    );
  } catch {
    // Ignore storage errors.
  }
}

function loadChats() {
  state.chats = {};
  state.activeChatId = null;
  const currentWorkspaceId = state.activeWorkspaceId || 'ws-default';

  try {
    const parsed = JSON.parse(localStorage.getItem(sessionChatStoreKey()) || '{}');
    const list = Array.isArray(parsed.chats) ? parsed.chats : [];
    list.forEach((chat) => {
      if (chat?.id) {
        state.chats[chat.id] = {
          ...chat,
          messages: Array.isArray(chat.messages) ? chat.messages.slice(-500) : [],
          stash: {
            selectedModel: chat?.stash?.selectedModel || 'gemma2-2b',
            project: chat?.stash?.project || 'mim-llm',
            workspaceId: chat?.stash?.workspaceId || currentWorkspaceId,
            workspacePath: chat?.stash?.workspacePath || activeWorkspace()?.path || '/home/clemi/projekte/LLM',
            topK: Number(chat?.stash?.topK || 5),
            useWeb: !!chat?.stash?.useWeb,
            webTopK: Number(chat?.stash?.webTopK || 3),
            agentMode: chat?.stash?.agentMode || 'off',
            selectedFsPath: chat?.stash?.selectedFsPath || null,
            contextFiles: Array.isArray(chat?.stash?.contextFiles) ? chat.stash.contextFiles.slice(0, 30) : [],
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
      btn.title = 'Klick: oeffnen | Doppelklick: umbenennen';
      btn.textContent = `${chat.title} (${chat.messages.length})`;
      btn.addEventListener('click', () => switchChat(chat.id));
      btn.addEventListener('dblclick', () => {
        const next = window.prompt('Neuer Chat-Name', chat.title);
        if (next && next.trim()) {
          chat.title = next.trim();
          chat.updatedAt = new Date().toISOString();
          renderChatSessions();
          saveChats();
          addAudit('chat_rename', `${chat.id} -> ${chat.title}`);
        }
      });
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

function renderContextFiles() {
  const ul = el('contextFilesList');
  if (!ul) return;
  ul.innerHTML = '';
  const chat = activeChat();
  const files = chat?.stash?.contextFiles || [];

  if (!files.length) {
    const li = document.createElement('li');
    li.textContent = 'Keine';
    ul.appendChild(li);
    return;
  }

  files.forEach((path) => {
    const li = document.createElement('li');
    const txt = document.createElement('span');
    txt.textContent = path;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'contextRemove';
    removeBtn.textContent = 'x';
    removeBtn.title = 'Aus Kontext entfernen';
    removeBtn.addEventListener('click', () => {
      const chatCur = activeChat();
      if (!chatCur) return;
      chatCur.stash.contextFiles = chatCur.stash.contextFiles.filter((f) => f !== path);
      renderContextFiles();
      saveChats();
    });

    li.appendChild(txt);
    li.appendChild(removeBtn);
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

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return html;
}

function formatMessageHtml(text) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n');
  const codeBlocks = [];
  const withTokens = normalized.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: String(lang || '').trim(), code: String(code || '') });
    return `@@CODEBLOCK_${idx}@@`;
  });

  const lines = withTokens.split('\n');
  const parts = [];
  let listMode = '';

  const closeList = () => {
    if (listMode === 'ul') parts.push('</ul>');
    if (listMode === 'ol') parts.push('</ol>');
    listMode = '';
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const codeTokenMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (codeTokenMatch) {
      closeList();
      const block = codeBlocks[Number(codeTokenMatch[1])] || { lang: '', code: '' };
      const langClass = block.lang ? ` class="lang-${escapeHtml(block.lang)}"` : '';
      parts.push(`<pre><code${langClass}>${escapeHtml(block.code)}</code></pre>`);
      return;
    }

    if (!trimmed) {
      closeList();
      return;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      if (!listMode) {
        parts.push('<ul>');
        listMode = 'ul';
      } else if (listMode !== 'ul') {
        closeList();
        parts.push('<ul>');
        listMode = 'ul';
      }
      parts.push(`<li>${formatInline(ulMatch[1])}</li>`);
      return;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!listMode) {
        parts.push('<ol>');
        listMode = 'ol';
      } else if (listMode !== 'ol') {
        closeList();
        parts.push('<ol>');
        listMode = 'ol';
      }
      parts.push(`<li>${formatInline(olMatch[1])}</li>`);
      return;
    }

    closeList();
    parts.push(`<p>${formatInline(line)}</p>`);
  });

  closeList();
  return parts.join('');
}

function renderMessageContent(container, role, text) {
  if (role === 'bot') {
    container.innerHTML = formatMessageHtml(text);
  } else {
    container.textContent = text;
  }
}

function renderMessages() {
  const box = el('messages');
  box.innerHTML = '';
  const chat = activeChat();
  if (!chat) return;

  chat.messages.forEach((entry) => {
    const div = document.createElement('div');
    div.className = `msg ${entry.role}`;
    renderMessageContent(div, entry.role, entry.text);
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;

  renderActiveChatHistory();
  renderContextFiles();
  renderSources(chat.stash.lastSources || []);
}

function updateChatStashFromInputs() {
  const chat = activeChat();
  const ws = activeWorkspace();
  if (!chat) return;

  chat.stash.selectedModel = el('modelInput').value;
  chat.stash.project = normalizeAndStoreProjectContext(el('projectInput').value) || 'mim-llm';
  chat.stash.workspaceId = ws?.id || state.activeWorkspaceId || 'ws-default';
  chat.stash.workspacePath = ws?.path || '/home/clemi/projekte/LLM';
  chat.stash.topK = Number(el('topKInput').value || 5);
  chat.stash.useWeb = !!el('useWebInput')?.checked;
  chat.stash.webTopK = Number(el('webTopKInput')?.value || 3);
  chat.stash.agentMode = el('agentModeInput').value;
  chat.stash.selectedFsPath = state.selectedFsPath;
  chat.updatedAt = new Date().toISOString();
  saveChats();
}

function switchChat(nextChatId) {
  if (!state.chats[nextChatId]) return;
  state.activeChatId = nextChatId;

  const chat = activeChat();
  el('modelInput').value = chat.stash.selectedModel || 'gemma2-2b';
  el('projectInput').value = normalizeAndStoreProjectContext(chat.stash.project || 'mim-llm') || 'mim-llm';
  el('topKInput').value = String(chat.stash.topK || 5);
  if (el('useWebInput')) el('useWebInput').checked = !!chat.stash.useWeb;
  if (el('webTopKInput')) el('webTopKInput').value = String(chat.stash.webTopK || 3);
  el('agentModeInput').value = chat.stash.agentMode || 'off';
  chat.stash.workspaceId = state.activeWorkspaceId || chat.stash.workspaceId || 'ws-default';
  chat.stash.workspacePath = activeWorkspace()?.path || chat.stash.workspacePath || '/home/clemi/projekte/LLM';
  state.selectedFsPath = chat.stash.selectedFsPath || null;

  updateModelInfo();
  renderChatSessions();
  renderProjectStructure();
  renderMessages();
  saveChats();
  addAudit('chat_switch', nextChatId);
}

function resetProjectContextToWorkspace() {
  const ws = activeWorkspace();
  const fallback = ws?.projectHint || state.activeProject || 'mim-llm';
  const nextProject = normalizeAndStoreProjectContext(fallback) || 'mim-llm';
  const chat = activeChat();
  if (chat) {
    chat.stash.project = nextProject;
    chat.updatedAt = new Date().toISOString();
  }
  if (ws) {
    ws.projectHint = nextProject;
    ws.lastUsedAt = new Date().toISOString();
    saveWorkspaces();
  }
  renderProjectStructure();
  renderChatSessions();
  saveChats();
  setStatus(`Projektkontext auf Workspace-Wert gesetzt: ${nextProject}`);
  addAudit('project_context_reset_workspace', nextProject);
}

function appendMessage(role, text) {
  const chat = activeChat();
  if (!chat) return;

  chat.messages.push({ ts: nowTs(), role, text });
  chat.messages = chat.messages.slice(-500);
  if (chat.messages.length === 1 && role === 'user') {
    chat.title = text.slice(0, 36) || chat.title;
  }
  chat.updatedAt = new Date().toISOString();

  renderMessages();

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
  chat.stash.contextFiles = [];
  chat.updatedAt = new Date().toISOString();
  renderMessages();
  renderChatSessions();
  saveChats();
}

function createTreeNode(node, basePath = '') {
  const li = document.createElement('li');
  const label = document.createElement('span');

  const name = typeof node === 'string' ? node : String(node.name || 'node');
  const isFolder = name.endsWith('/');
  const fullPath = `${basePath}${name}`;

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
    const wsPath = activeWorkspace()?.path || '/home/clemi/projekte/LLM';
    selectedLabel.textContent = `Ausgewaehlt: ${fullPath} | Workspace: ${wsPath}`;

    const chat = activeChat();
    if (chat) {
      chat.stash.selectedFsPath = fullPath;
      saveChats();
    }

    if (isFolder) {
      li.classList.toggle('collapsed');
    } else {
      addAudit('fs_select', fullPath);
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
  const ws = activeWorkspace();
  const wsPath = ws?.path || '/home/clemi/projekte/LLM';
  el('fsProjectLabel').textContent = `Kontext: ${projectName}`;
  el('fsSelectedPath').textContent = `Ausgewaehlt: ${state.selectedFsPath || '-'} | Workspace: ${wsPath}`;

  tree.innerHTML = '';
  tree.appendChild(createTreeNode(currentProjectStructure));
}

function addSelectedFileToContext() {
  const chat = activeChat();
  const path = state.selectedFsPath;
  if (!chat) {
    setStatus('Kein aktiver Chat verfuegbar.', true);
    return;
  }

  if (!path || path.endsWith('/')) {
    const manual = (el('manualContextPathInput')?.value || '').trim();
    if (manual) {
      addContextFile(chat, manual, 'context_add_manual_fallback');
      el('manualContextPathInput').value = '';
      return;
    }
    setStatus('Bitte Datei im Baum waehlen oder manuellen Dateipfad eintragen.', true);
    return;
  }

  addContextFile(chat, path, 'context_add');
}

function addContextFile(chat, path, auditType = 'context_add') {
  const cleaned = String(path || '').trim();
  if (!chat || !cleaned || cleaned.endsWith('/')) {
    setStatus('Ungueltiger Dateieintrag fuer den Kontext.', true);
    return false;
  }

  if (!chat.stash.contextFiles.includes(cleaned)) {
    chat.stash.contextFiles.push(cleaned);
    chat.stash.contextFiles = chat.stash.contextFiles.slice(-30);
    chat.updatedAt = new Date().toISOString();
    saveChats();
    renderContextFiles();
    addAudit(auditType, cleaned);
    setStatus(`Datei zum Kontext hinzugefuegt: ${cleaned}`);
    return true;
  }
  setStatus('Datei ist bereits im Kontext.');
  return false;
}

function addLocalFilesToContext(fileList) {
  const chat = activeChat();
  if (!chat) {
    setStatus('Kein aktiver Chat verfuegbar.', true);
    return;
  }
  const files = Array.from(fileList || []);
  if (!files.length) {
    setStatus('Keine lokale Datei ausgewaehlt. Alternativ manuellen Dateipfad nutzen.', true);
    return;
  }

  let added = 0;
  files.forEach((file) => {
    const rel = String(file.webkitRelativePath || file.name || '').trim();
    if (!rel) return;
    const marker = `lokal:${rel}`;
    if (addContextFile(chat, marker, 'context_add_local')) {
      added += 1;
    }
  });

  addAudit('context_add_local_batch', `${added} dateien`);
  setStatus(added ? `${added} lokale Datei(en) zum Kontext hinzugefuegt.` : 'Keine neue Datei hinzugefuegt.');
}

function addManualContextPath() {
  const chat = activeChat();
  const value = (el('manualContextPathInput')?.value || '').trim();
  if (!chat || !value) {
    setStatus('Bitte einen Dateipfad eintragen.', true);
    return;
  }
  addContextFile(chat, value, 'context_add_manual');
  el('manualContextPathInput').value = '';
}

function clearContextFiles() {
  const chat = activeChat();
  if (!chat) return;
  chat.stash.contextFiles = [];
  saveChats();
  renderContextFiles();
  addAudit('context_clear', chat.id);
}

function applyUserRoleHint() {
  const user = normalizeUser(el('userInput').value);
  const known = findUser(user);
  if (known) {
    el('roleInput').value = known.role;
  }
}

function loginCurrentUser() {
  const user = normalizeUser(el('userInput').value) || 'user';
  const known = findUser(user);
  const role = known ? known.role : el('roleInput').value;

  state.session = { user, role };
  saveSession();

  el('sessionBadge').textContent = `${user} (${role})`;
  el('roleInput').value = role;

  loadChats();
  renderChatSessions();
  switchChat(state.activeChatId);

  addAudit('login', `user=${user}, role=${role}`);
  setStatus(`Eingeloggt als ${user} (${roleLabel(role)}).`);
}

function logoutCurrentUser() {
  state.session = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore storage errors
  }

  el('sessionBadge').textContent = 'Nicht eingeloggt';
  addAudit('logout', 'session ended');
  setStatus('Logout erfolgreich. Session bleibt nur bis Tab-Schliessen oder Logout aktiv.');
}

async function createWorkspaceFromPicker() {
  const pickedPath = await browseWorkspaceFromFileSystem();
  if (!pickedPath) {
    setStatus('Workspace-Auswahl abgebrochen oder kein Pfad gesetzt.', true);
    return;
  }
  const fallbackName = pickedPath.split('/').filter(Boolean).slice(-1)[0] || 'Workspace';
  const draft = workspaceDraft(fallbackName, pickedPath);
  const ws = createWorkspace(draft.name, draft.path);
  if (!ws) {
    setStatus('Workspace konnte nicht angelegt werden.', true);
    return;
  }

  currentProjectStructure = loadWorkspaceTree(ws.id);
  activateWorkspaceSession(ws);
  addAudit('workspace_open', `${ws.name} (${ws.path})`);
  setStatus(`Workspace aktiv: ${ws.name}`);
}

function applyWorkspacePickerResult(rawValue) {
  let payload = null;
  try {
    payload = JSON.parse(rawValue || localStorage.getItem(WORKSPACE_PICKER_RESULT_KEY) || 'null');
  } catch {
    payload = null;
  }
  if (!payload?.path) return false;

  const pickedPath = String(payload.path || '').trim();
  const pickedName = String(payload.name || '').trim() || pickedPath.split('/').filter(Boolean).slice(-1)[0] || 'Workspace';
  const ws = createWorkspace(pickedName, pickedPath);
  if (!ws) return false;

  currentProjectStructure = loadWorkspaceTree(ws.id);
  activateWorkspaceSession(ws);
  addAudit('workspace_open_popup', `${ws.name} (${ws.path})`);
  setStatus(`Workspace ueber Auswahlfenster aktiv: ${ws.name}`);

  try {
    localStorage.removeItem(WORKSPACE_PICKER_RESULT_KEY);
  } catch {
    // ignore storage errors
  }
  return true;
}

function openWorkspacePickerWindow() {
  const popup = window.open('workspace-picker.html', 'workspacePicker', 'popup=yes,width=760,height=560');
  if (popup) {
    popup.focus();
    setStatus('Workspace-Auswahlfenster geoeffnet.');
    return;
  }

  setStatus('Popup blockiert, nutze lokalen Dateisystem-Dialog als Fallback.', true);
  createWorkspaceFromPicker();
}

function createWorkspaceFromPrompt() {
  const path = (el('workspacePathInput')?.value || '').trim();
  const name = (el('workspaceNameInput')?.value || '').trim();
  if (!path) {
    setStatus('Bitte Workspace-Pfad setzen.', true);
    return;
  }
  const fallbackName = path.split('/').filter(Boolean).slice(-1)[0] || 'Workspace';
  const ws = createWorkspace(name || fallbackName, path);
  if (!ws) return;
  currentProjectStructure = loadWorkspaceTree(ws.id);
  activateWorkspaceSession(ws);
  addAudit('workspace_new', `${ws.name} (${ws.path})`);
  setStatus(`Workspace angelegt: ${ws.name}`);
}

function createWorkspaceFromFileList(fileList) {
  const files = Array.from(fileList || []);
  const relPaths = files.map((f) => String(f.webkitRelativePath || f.name || '').trim()).filter(Boolean);
  if (!relPaths.length) {
    setStatus('Keine Dateien fuer interaktiven Workspace-Browse erhalten.', true);
    return;
  }

  const rootName = relPaths[0].split('/').filter(Boolean)[0] || 'workspace';
  const suggestedPath = (el('workspacePathInput')?.value || '').trim() || `/home/clemi/projekte/${rootName}`;
  const suggestedName = (el('workspaceNameInput')?.value || '').trim() || rootName;

  const ws = createWorkspace(suggestedName, suggestedPath.trim());
  if (!ws) return;

  currentProjectStructure = buildStructureFromFileList(rootName, relPaths);
  saveWorkspaceTree(ws.id, currentProjectStructure);
  activateWorkspaceSession(ws);
  addAudit('workspace_browse_interactive', `${ws.name} (${relPaths.length} files)`);
  setStatus(`Interaktiver FS-Import aktiv: ${ws.name} mit ${relPaths.length} Datei(en).`);
}

el('loginBtn').addEventListener('click', loginCurrentUser);
el('logoutBtn').addEventListener('click', logoutCurrentUser);
el('userInput').addEventListener('change', applyUserRoleHint);
el('workspaceSelect').addEventListener('change', (ev) => {
  const nextId = String(ev.target.value || '');
  const ws = state.workspaces.find((item) => item.id === nextId);
  if (!ws) return;
  activateWorkspaceSession(ws);
  addAudit('workspace_switch', ws.id);
});
el('browseWorkspaceBtn').addEventListener('click', openWorkspacePickerWindow);
el('browseWorkspaceInteractiveBtn').addEventListener('click', () => {
  el('workspaceDirInput').click();
});
el('workspaceDirInput').addEventListener('change', (ev) => {
  createWorkspaceFromFileList(ev.target.files);
  ev.target.value = '';
});
el('newWorkspaceBtn').addEventListener('click', createWorkspaceFromPrompt);
if (el('projectSelect')) {
  el('projectSelect').addEventListener('change', (ev) => {
    const nextProject = normalizeProjectName(ev.target.value || '');
    if (!nextProject) return;
    activateProject(nextProject, { updateWorkspace: true, auditType: 'project_switch_select' });
    setStatus(`Projekt gewechselt: ${nextProject}`);
  });
}
if (el('openProjectBtn')) {
  el('openProjectBtn').addEventListener('click', openProjectFromPrompt);
}
if (el('newProjectBtn')) {
  el('newProjectBtn').addEventListener('click', createProjectFromPrompt);
}

window.addEventListener('storage', (ev) => {
  if (ev.key === WORKSPACES_KEY) {
    loadWorkspaces();
    loadProjects();
    renderProjectStructure();
    return;
  }
  if (ev.key === ACTIVE_WORKSPACE_KEY) {
    syncWorkspaceFromStorage();
    return;
  }
  if (ev.key === WORKSPACE_PICKER_RESULT_KEY) {
    applyWorkspacePickerResult(ev.newValue);
  }
});

window.addEventListener('focus', syncWorkspaceFromStorage);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncWorkspaceFromStorage();
  }
});

el('modelInput').addEventListener('change', () => {
  updateModelInfo();
  updateChatStashFromInputs();
});

el('projectInput').addEventListener('input', () => {
  updateChatStashFromInputs();
  renderProjectStructure();
});
el('projectInput').addEventListener('change', updateChatStashFromInputs);
if (el('resetProjectContextBtn')) {
  el('resetProjectContextBtn').addEventListener('click', resetProjectContextToWorkspace);
}

el('topKInput').addEventListener('input', updateChatStashFromInputs);
if (el('useWebInput')) {
  el('useWebInput').addEventListener('change', updateChatStashFromInputs);
}
if (el('webTopKInput')) {
  el('webTopKInput').addEventListener('input', updateChatStashFromInputs);
}
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

el('addSelectedFileBtn').addEventListener('click', addSelectedFileToContext);
el('addLocalFilesBtn').addEventListener('click', () => {
  el('contextFileInput').click();
});
el('contextFileInput').addEventListener('change', (ev) => {
  addLocalFilesToContext(ev.target.files);
  ev.target.value = '';
});
el('clearContextFilesBtn').addEventListener('click', clearContextFiles);
el('addManualContextPathBtn').addEventListener('click', addManualContextPath);
el('checkModelsBtn').addEventListener('click', checkModelsAvailability);
el('runSmokeTestsBtn').addEventListener('click', runSmokeTests);

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
  const use_web = !!el('useWebInput')?.checked;
  const web_top_k = Number(el('webTopKInput')?.value || 3);
  const agentMode = el('agentModeInput').value;

  const chat = activeChat();
  const contextFiles = Array.isArray(chat?.stash?.contextFiles) ? chat.stash.contextFiles : [];
  const modeHint = AGENT_MODES[agentMode] || '';
  const contextHint = contextFiles.length
    ? `Kontextdateien (bitte inhaltlich beruecksichtigen):\n- ${contextFiles.join('\n- ')}\n\n`
    : '';
  const finalQuery = `${modeHint}${modeHint ? '\n\n' : ''}${contextHint}${query}`;

  appendMessage('user', query);
  addHistory(query, model, project);
  setStatus('Sende Anfrage...');

  updateChatStashFromInputs();

  try {
    const data = await requestJson(`${API_BASE}/v1/rag/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ query: finalQuery, model, project, top_k, use_web, web_top_k, agent_mode: agentMode, context_files: contextFiles }),
    });

    const answer = data.answer || 'Keine Antwort';
    appendMessage('bot', answer);

    if (chat) {
      chat.stash.lastSources = Array.isArray(data.sources) ? data.sources.slice(0, 25) : [];
      chat.stash.lastAnswer = answer;
      chat.updatedAt = new Date().toISOString();
      saveChats();
      trackWorkspaceExecution(chat);
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

el('fsWriteBtn').addEventListener('click', async () => {
  const reason = el('reasonInput').value.trim();
  const taskId = el('taskInput').value.trim();
  const path = (el('fsWritePathInput')?.value || '').trim();
  const content = String(el('fsWriteContentInput')?.value || '');
  const append = !!el('fsWriteAppendInput')?.checked;

  if (!state.session) {
    setStatus('Login erforderlich.', true);
    addAudit('blocked', 'fs_write ohne login');
    return;
  }
  if (!['admin', 'service'].includes(state.session.role)) {
    setStatus('Datei schreiben blockiert: Rolle darf nicht schreiben.', true);
    addAudit('blocked', `fs_write role=${state.session.role}`);
    return;
  }
  if (!reason || !taskId) {
    setStatus('Grund und Task-ID sind Pflicht.', true);
    addAudit('blocked', 'fs_write fehlende Pflichtmetadaten');
    return;
  }
  if (!path) {
    setStatus('Bitte Zielpfad angeben.', true);
    return;
  }

  try {
    const data = await requestJson(`${API_BASE}/v1/rag/fs/write`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Reason': reason,
        'X-Task-Id': taskId,
        ...authHeaders(),
      },
      body: JSON.stringify({
        path,
        content,
        append,
        project: (el('projectInput')?.value || '').trim() || null,
      }),
    });
    setStatus(`Datei geschrieben: ${data.path || path} (${data.bytes_written ?? 0} bytes)`);
    addAudit('fs_write', `${data.path || path} | append=${append}`);
  } catch (err) {
    setStatus(`Datei schreiben Fehler: ${String(err)}`, true);
    addAudit('error', `fs_write ${String(err)}`);
  }
});

(async function boot() {
  loadWorkspaces();
  loadProjects();
  currentProjectStructure = loadWorkspaceTree(state.activeWorkspaceId);
  const ws = activeWorkspace();
  if (ws) {
    if (el('workspaceNameInput')) el('workspaceNameInput').value = ws.name || '';
    if (el('workspacePathInput')) el('workspacePathInput').value = ws.path || '';
  }
  loadUsers();
  loadSession();
  loadHistory();
  loadChats();

  renderHistory();
  renderChatSessions();
  switchChat(state.activeChatId);
  renderProjectStructure();
  renderUiHealth();
  renderModelHealth();
  updateModelInfo();
  applyWorkspacePickerResult();

  if (state.session?.user) {
    el('sessionBadge').textContent = `${state.session.user} (${state.session.role})`;
  }

  setStatus('Pruefe API...');
  try {
    const data = await requestJson(`${API_BASE}/healthz`);
    setStatus(`API bereit: ${data.service}`);
    addAudit('boot', 'ui initialisiert');
    await checkModelsAvailability();
  } catch (err) {
    setStatus(`API nicht erreichbar (${API_BASE}). Fehler: ${String(err)}. Hinweis: bei HTTPS Nginx Proxy /api -> 127.0.0.1:4100 konfigurieren.`, true);
    addAudit('boot_error', String(err));
  }
})();
