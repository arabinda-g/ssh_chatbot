// ========================================
// DOM Elements
// ========================================
const siteListEl = document.getElementById("site-list");
const newTabBtn = document.getElementById("new-tab");
const tabsEl = document.getElementById("tabs");
const tabContentEl = document.getElementById("tab-content");

// Site Manager Modal elements
const siteManagerModal = document.getElementById("site-manager-modal");
const openSiteManagerBtn = document.getElementById("open-site-manager");
const closeSiteManagerBtn = document.getElementById("close-site-manager");
const newSiteBtn = document.getElementById("new-site-btn");
const deleteSiteBtn = document.getElementById("delete-site-btn");
const saveSiteBtn = document.getElementById("save-site-btn");
const connectSiteBtn = document.getElementById("connect-site-btn");
const siteDetailsForm = document.getElementById("site-details-form");
const noSiteSelected = document.getElementById("no-site-selected");

// Settings Modal elements
const settingsModal = document.getElementById("settings-modal");
const openSettingsBtn = document.getElementById("open-settings");
const closeSettingsBtn = document.getElementById("close-settings");
const saveSettingsBtn = document.getElementById("save-settings");
const openaiKeyInput = document.getElementById("openai-key");
const maxRetriesInput = document.getElementById("max-retries");
const modelInput = document.getElementById("model-name");
const themeSelect = document.getElementById("theme-select");
const modeButtons = document.querySelectorAll(".segmented-btn");

// Toast container
const toastContainer = document.getElementById("toast-container");

// ========================================
// API Interface
// ========================================
const sshApi = window.api || {
  sshConnect: async () => ({ ok: false, error: "Not available in browser" }),
  sshDisconnect: async () => ({ ok: true }),
  sshWrite: async () => ({ ok: true }),
  sshExec: async () => ({ ok: false, error: "Not available in browser" }),
  sshExecSilent: async () => ({ ok: false, error: "Not available in browser" }),
  sshInterrupt: async () => ({ ok: true }),
  aiGetCommand: async () => ({ ok: false, error: "Not available in browser" }),
  aiFixCommand: async () => ({ ok: false, error: "Not available in browser" }),
  aiInterpretOutput: async () => ({ ok: false, error: "Not available in browser" }),
  aiGenerateTitle: async () => ({ ok: false, error: "Not available in browser" }),
  onSshData: () => {},
  onSshError: () => {},
  onSshStatus: () => {}
};

// ========================================
// State Management
// ========================================
const state = {
  sites: [],
  tabs: [],
  activeTabId: null,
  selectedSiteId: null,
  isNewSite: false,
  settings: {
    apiKey: "",
    mode: "ask",
    maxRetries: 10,
    model: "gpt-5.2",
    theme: "light"
  }
};

// ========================================
// Utility Functions
// ========================================
const uid = () => Math.random().toString(36).slice(2, 10);

const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

// Enhanced markdown parser for answer messages
const parseSimpleMarkdown = (text) => {
  let result = escapeHtml(text);
  // Convert ```code blocks``` to <pre><code>
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="code-block"><code>${code.trim()}</code></pre>`;
  });
  // Convert **bold** to <strong>bold</strong>
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Convert *italic* to <em>italic</em>
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Convert `code` to <code>code</code>
  result = result.replace(/`(.+?)`/g, "<code>$1</code>");
  // Convert bullet points (- item or * item at start of line)
  result = result.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
  // Wrap consecutive <li> in <ul>
  result = result.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  // Convert numbered lists (1. item)
  result = result.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  // Convert newlines to <br> (but not inside lists or pre)
  result = result.replace(/\n(?!<)/g, "<br>");
  // Clean up extra <br> after </ul> or </pre>
  result = result.replace(/<\/ul><br>/g, "</ul>");
  result = result.replace(/<\/pre><br>/g, "</pre>");
  return result;
};

// Copy text to clipboard with feedback
const copyToClipboard = async (text, feedbackEl) => {
  try {
    await navigator.clipboard.writeText(text);
    if (feedbackEl) {
      feedbackEl.classList.add("copied");
      setTimeout(() => feedbackEl.classList.remove("copied"), 1500);
    }
  } catch {
    // Fallback for older environments
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    if (feedbackEl) {
      feedbackEl.classList.add("copied");
      setTimeout(() => feedbackEl.classList.remove("copied"), 1500);
    }
  }
};

// ========================================
// Toast Notifications
// ========================================
const showToast = (type, title, message, duration = 4000) => {
  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${icons[type] || icons.info}
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ""}
    </div>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toastSlide 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// ========================================
// Storage Functions
// ========================================
const loadSites = () => {
  const raw = localStorage.getItem("sites");
  state.sites = raw ? JSON.parse(raw) : [];
};

const saveSites = () => {
  localStorage.setItem("sites", JSON.stringify(state.sites));
};

const loadSettings = () => {
  const raw = localStorage.getItem("settings");
  if (raw) {
    state.settings = { ...state.settings, ...JSON.parse(raw) };
  }
};

const saveSettings = () => {
  localStorage.setItem("settings", JSON.stringify(state.settings));
};

// ========================================
// Chat Session Storage (per-site persistence)
// ========================================
const loadChatSessions = (siteId) => {
  if (!siteId) return [];
  const raw = localStorage.getItem(`chat_sessions_${siteId}`);
  return raw ? JSON.parse(raw) : [];
};

const saveChatSessions = (siteId, sessions) => {
  if (!siteId) return;
  localStorage.setItem(`chat_sessions_${siteId}`, JSON.stringify(sessions));
};

const createNewSession = (siteId, sessions) => {
  const existingNums = sessions
    .map((s) => {
      const match = s.name.match(/^Chat (\d+)$/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(Boolean);
  const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;

  const session = {
    id: uid(),
    name: `Chat ${nextNum}`,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  sessions.push(session);
  saveChatSessions(siteId, sessions);
  return session;
};

const saveCurrentSession = (tab) => {
  if (!tab.site?.id || !tab.activeSessionId || !tab.sessions) return;
  const session = tab.sessions.find((s) => s.id === tab.activeSessionId);
  if (session) {
    session.messages = tab.chat.filter((m) => !m.isThinking);
    session.updatedAt = Date.now();
    saveChatSessions(tab.site.id, tab.sessions);
  }
};

const saveLastActiveSession = (siteId, sessionId) => {
  if (!siteId || !sessionId) return;
  const data = JSON.parse(localStorage.getItem("last_active_sessions") || "{}");
  data[siteId] = sessionId;
  localStorage.setItem("last_active_sessions", JSON.stringify(data));
};

const getLastActiveSession = (siteId) => {
  if (!siteId) return null;
  const data = JSON.parse(localStorage.getItem("last_active_sessions") || "{}");
  return data[siteId] || null;
};

const generateSessionTitle = async (tab, prompt) => {
  if (!tab.site?.id || !tab.activeSessionId) return;

  const session = tab.sessions?.find((s) => s.id === tab.activeSessionId);
  if (!session) return;

  if (!/^Chat \d+$/.test(session.name)) return;

  try {
    const result = await sshApi.aiGenerateTitle({
      prompt,
      settings: state.settings
    });

    if (result.ok && result.title) {
      session.name = result.title;
      saveChatSessions(tab.site.id, tab.sessions);
      updateSessionBar(tab);
    }
  } catch {
    // Silently fail
  }
};

const switchSession = (tab, sessionId) => {
  saveCurrentSession(tab);

  tab.activeSessionId = sessionId;
  const session = tab.sessions.find((s) => s.id === sessionId);
  tab.chat = session ? [...session.messages] : [];

  if (tab.site?.id) {
    saveLastActiveSession(tab.site.id, sessionId);
  }

  renderChat(tab);
  updateSessionBar(tab);
};

const deleteSession = (tab, sessionId) => {
  if (!tab.site?.id || !tab.sessions) return;

  if (tab.sessions.length <= 1) {
    showToast("info", "Cannot Delete", "You need at least one chat session");
    return;
  }

  const sessionName = tab.sessions.find((s) => s.id === sessionId)?.name || "";
  tab.sessions = tab.sessions.filter((s) => s.id !== sessionId);
  saveChatSessions(tab.site.id, tab.sessions);

  if (tab.activeSessionId === sessionId) {
    const latest = tab.sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    tab.activeSessionId = latest.id;
    tab.chat = [...latest.messages];
    renderChat(tab);
  }

  updateSessionBar(tab);
  showToast("success", "Session Deleted", `"${sessionName}" removed`);
};

const renameSession = (tab, sessionId, newName) => {
  if (!tab.site?.id || !tab.sessions) return;
  const session = tab.sessions.find((s) => s.id === sessionId);
  if (session && newName.trim()) {
    session.name = newName.trim();
    saveChatSessions(tab.site.id, tab.sessions);
    updateSessionBar(tab);
  }
};

const updateSessionBar = (tab) => {
  const sessionBar = document.getElementById(`session-bar-${tab.id}`);
  if (!sessionBar) return;

  const activeSession = tab.sessions?.find((s) => s.id === tab.activeSessionId);
  const nameEl = sessionBar.querySelector(".session-current-name");
  const countEl = sessionBar.querySelector(".session-count");

  if (nameEl && activeSession) {
    nameEl.textContent = activeSession.name;
  }
  if (countEl && tab.sessions) {
    countEl.textContent = tab.sessions.length;
  }
};

const formatSessionDate = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// ========================================
// Theme Management
// ========================================
const applyTheme = () => {
  const theme = state.settings.theme || "light";
  if (theme === "light") {
    document.body.classList.add("light-theme");
  } else {
    document.body.classList.remove("light-theme");
  }
};

// ========================================
// Site Manager Functions
// ========================================
const renderSites = () => {
  siteListEl.innerHTML = "";
  
  if (state.sites.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.padding = "24px 12px";
    empty.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m9 10 3 3-3 3"/>
      </svg>
      <p style="font-size: 12px; margin-top: 8px;">No saved sites yet</p>
    `;
    siteListEl.appendChild(empty);
    return;
  }

  state.sites.forEach((site) => {
    const card = document.createElement("div");
    card.className = `site-card ${site.id === state.selectedSiteId ? "selected" : ""}`;
    card.innerHTML = `
      <div class="site-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="m9 10 3 3-3 3"/>
        </svg>
      </div>
      <div class="meta">
        <strong>${escapeHtml(site.name)}</strong>
        <span>${escapeHtml(site.username)}@${escapeHtml(site.host)}:${site.port}</span>
      </div>
    `;

    card.addEventListener("click", () => selectSite(site.id));
    card.addEventListener("dblclick", () => {
      selectSite(site.id);
      connectSelectedSite();
    });

    siteListEl.appendChild(card);
  });
};

const selectSite = (siteId) => {
  state.selectedSiteId = siteId;
  state.isNewSite = false;
  renderSites();
  updateSiteDetailsForm();
};

const updateSiteDetailsForm = () => {
  const site = state.sites.find((s) => s.id === state.selectedSiteId);

  if (site || state.isNewSite) {
    siteDetailsForm.classList.remove("hidden");
    noSiteSelected.classList.add("hidden");

    document.getElementById("site-name").value = site?.name || "";
    document.getElementById("site-host").value = site?.host || "";
    document.getElementById("site-port").value = site?.port || "22";
    document.getElementById("site-user").value = site?.username || "";
    document.getElementById("site-pass").value = site?.password || "";
  } else {
    siteDetailsForm.classList.add("hidden");
    noSiteSelected.classList.remove("hidden");
  }
};

const clearSiteForm = () => {
  document.getElementById("site-name").value = "";
  document.getElementById("site-host").value = "";
  document.getElementById("site-port").value = "22";
  document.getElementById("site-user").value = "";
  document.getElementById("site-pass").value = "";
};

const connectSelectedSite = () => {
  const site = state.sites.find((s) => s.id === state.selectedSiteId);
  if (site) {
    hideSiteManager();
    createTab(site);
  }
};

// ========================================
// Tab Management & Environment Detection
// ========================================
const detectEnvironment = async (tab) => {
  if (!tab.site) return;

  try {
    const result = await sshApi.sshExecSilent({
      tabId: tab.id,
      command: 'echo "OS:$(uname -srm)" && (cat /etc/os-release 2>/dev/null | grep -E "^(PRETTY_NAME|ID|VERSION_ID)=" | head -3 || echo "DISTRO:Unknown") && echo "SHELL:$SHELL" && echo "USER:$(whoami)" && echo "PKG:$(which apt-get 2>/dev/null && echo apt-get || which yum 2>/dev/null && echo yum || which dnf 2>/dev/null && echo dnf || which pacman 2>/dev/null && echo pacman || which apk 2>/dev/null && echo apk || echo unknown)" && echo "INIT:$(ps -p 1 -o comm= 2>/dev/null || echo unknown)" && echo "ARCH:$(uname -m)"'
    });

    if (result.ok && result.stdout) {
      const info = {};
      const lines = result.stdout.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("OS:")) info.os = trimmed.slice(3).trim();
        if (trimmed.startsWith("PRETTY_NAME=")) info.distro = trimmed.split("=")[1]?.replace(/"/g, "").trim();
        if (trimmed.startsWith("ID=")) info.distroId = trimmed.split("=")[1]?.replace(/"/g, "").trim();
        if (trimmed.startsWith("VERSION_ID=")) info.version = trimmed.split("=")[1]?.replace(/"/g, "").trim();
        if (trimmed.startsWith("DISTRO:")) info.distro = trimmed.slice(7).trim();
        if (trimmed.startsWith("SHELL:")) info.shell = trimmed.slice(6).trim();
        if (trimmed.startsWith("USER:")) info.user = trimmed.slice(5).trim();
        if (trimmed.startsWith("INIT:")) info.initSystem = trimmed.slice(5).trim();
        if (trimmed.startsWith("ARCH:")) info.arch = trimmed.slice(5).trim();
        if (trimmed.startsWith("PKG:") || trimmed.match(/^\/.*\/(apt-get|yum|dnf|pacman|apk)$/)) {
          const pkgName = trimmed.replace(/^PKG:/, "").trim();
          if (pkgName && pkgName !== "unknown") {
            info.packageManager = pkgName.split("/").pop();
          }
        }
        if (/^(apt-get|yum|dnf|pacman|apk)$/.test(trimmed)) {
          info.packageManager = trimmed;
        }
      }

      if (info.initSystem === "systemd" || info.initSystem === "init") {
        info.initSystem = info.initSystem;
      } else {
        info.initSystem = "systemd";
      }

      tab.envInfo = info;
    }
  } catch (e) {
    tab.envInfo = null;
  }
};

const createTab = async (site) => {
  const tabId = uid();

  let sessions = site ? loadChatSessions(site.id) : [];
  let activeSessionId = null;

  if (site && sessions.length > 0) {
    const lastActiveId = getLastActiveSession(site.id);
    if (lastActiveId && sessions.find((s) => s.id === lastActiveId)) {
      activeSessionId = lastActiveId;
    } else {
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      activeSessionId = sessions[0].id;
    }
  } else if (site) {
    const firstSession = createNewSession(site.id, sessions);
    activeSessionId = firstSession.id;
  }

  if (site && activeSessionId) {
    saveLastActiveSession(site.id, activeSessionId);
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const tab = {
    id: tabId,
    title: site ? site.name : `Tab ${state.tabs.length + 1}`,
    site,
    status: "disconnected",
    statusText: "Disconnected",
    terminal: null,
    logs: "",
    chat: activeSession ? [...activeSession.messages] : [],
    sessions,
    activeSessionId,
    envInfo: null,
    commandHistory: [],
    abortController: null, // For stopping retry loops
    isExecuting: false // Track if currently executing
  };

  state.tabs.push(tab);
  state.activeTabId = tabId;
  renderTabs();
  renderActiveTab();

  if (site) {
    await connectTab(tab);
  }
};

const closeTab = async (tabId) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  // Abort any running execution
  if (tab.abortController) {
    tab.abortController.abort();
  }

  saveCurrentSession(tab);

  await sshApi.sshDisconnect({ tabId });
  if (tab.terminal) {
    tab.terminal.dispose();
  }
  
  state.tabs = state.tabs.filter((t) => t.id !== tabId);
  state.activeTabId = state.tabs[0]?.id || null;
  renderTabs();
  renderActiveTab();
};

const connectTab = async (tab) => {
  if (!tab.site) return;
  
  tab.status = "connecting";
  tab.statusText = "Connecting...";
  renderTabs();
  renderActiveTab();
  
  await sshApi.sshConnect({
    tabId: tab.id,
    config: tab.site
  });
};

const renderTabs = () => {
  tabsEl.innerHTML = "";
  
  state.tabs.forEach((tab) => {
    const tabBtn = document.createElement("div");
    tabBtn.className = `tab ${tab.id === state.activeTabId ? "active" : ""}`;
    tabBtn.innerHTML = `
      <span class="tab-title">${escapeHtml(tab.title)}</span>
      <span class="status">
        <span class="status-dot ${tab.status}"></span>
        ${escapeHtml(tab.statusText)}
      </span>
      <button class="close-btn" data-action="close" title="Close tab">&times;</button>
    `;
    
    tabBtn.addEventListener("click", (e) => {
      if (!e.target.closest('[data-action="close"]')) {
        state.activeTabId = tab.id;
        renderTabs();
        renderActiveTab();
      }
    });
    
    tabBtn.querySelector('[data-action="close"]').addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    
    tabsEl.appendChild(tabBtn);
  });
};

const renderActiveTab = () => {
  tabContentEl.innerHTML = "";
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  
  if (!tab) {
    tabContentEl.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="m9 10 3 3-3 3"/>
          <path d="M14 16h2"/>
        </svg>
        <h3>No Active Session</h3>
        <p>Open the Site Manager to connect to a server, or create a new tab to get started.</p>
        <button class="primary" onclick="document.getElementById('open-site-manager').click()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14"/><path d="M5 12h14"/>
          </svg>
          Open Site Manager
        </button>
      </div>
    `;
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "terminal-chat";
  wrapper.innerHTML = `
    <div class="terminal-panel">
      <div class="panel-header">
        <span class="panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          Terminal
        </span>
        <span class="status ${tab.status}">
          <span class="status-dot ${tab.status}"></span>
          ${escapeHtml(tab.statusText)}
        </span>
      </div>
      <div class="terminal-body" id="terminal-${tab.id}"></div>
    </div>
    <div class="chat-panel">
      <div class="panel-header">
        <span class="panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8V4H8"/>
            <rect x="8" y="8" width="8" height="8" rx="1"/>
            <path d="M16 12h4v4"/>
            <path d="M4 12v4h4"/>
          </svg>
          AI Assistant
        </span>
        <label class="ask-toggle" title="Ask before executing commands">
          <input type="checkbox" id="ask-toggle-${tab.id}" ${state.settings.mode === "ask" ? "checked" : ""} />
          <span class="toggle-slider"></span>
          <span class="toggle-label">Ask</span>
        </label>
      </div>
      <div class="session-bar" id="session-bar-${tab.id}">
        <button class="session-selector" id="session-selector-${tab.id}" title="Switch chat session">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="session-current-name">${escapeHtml(tab.sessions?.find((s) => s.id === tab.activeSessionId)?.name || "Chat 1")}</span>
          <span class="session-count">${tab.sessions?.length || 1}</span>
          <svg class="session-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <button class="session-new-btn" id="session-new-${tab.id}" title="New chat session">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14"/><path d="M5 12h14"/>
          </svg>
        </button>
      </div>
      <div class="chat-messages" id="chat-${tab.id}"></div>
      <div class="chat-input">
        <input id="chat-input-${tab.id}" placeholder="Ask AI to run a command..." ${tab.isExecuting ? "disabled" : ""} />
        <button class="${tab.isExecuting ? "stop-btn" : "primary"}" id="chat-send-${tab.id}">
          ${tab.isExecuting ? `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
            Stop
          ` : `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send
          `}
        </button>
      </div>
    </div>
  `;
  tabContentEl.appendChild(wrapper);

  // Initialize terminal
  const terminalContainer = document.getElementById(`terminal-${tab.id}`);
  const isDark = !document.body.classList.contains("light-theme");
  
  if (!tab.terminal) {
    tab.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      lineHeight: 1.4,
      theme: {
        background: isDark ? "#0a0e14" : "#f8fafc",
        foreground: isDark ? "#e7ecf2" : "#0f172a",
        cursor: isDark ? "#3b82f6" : "#3b82f6",
        cursorAccent: isDark ? "#0a0e14" : "#f8fafc",
        selectionBackground: "rgba(59, 130, 246, 0.3)"
      }
    });
    
    const fitAddon = new FitAddon.FitAddon();
    tab.terminal.loadAddon(fitAddon);
    tab.fitAddon = fitAddon;
    
    tab.terminal.open(terminalContainer);
    
    setTimeout(() => {
      fitAddon.fit();
    }, 50);
    
    tab.terminal.onData((data) => {
      sshApi.sshWrite({ tabId: tab.id, data });
    });
  } else {
    tab.terminal.open(terminalContainer);
    if (tab.fitAddon) {
      setTimeout(() => {
        tab.fitAddon.fit();
      }, 50);
    }
  }

  renderChat(tab);

  // Event listeners for chat
  const sendBtn = document.getElementById(`chat-send-${tab.id}`);
  const chatInput = document.getElementById(`chat-input-${tab.id}`);
  const askToggle = document.getElementById(`ask-toggle-${tab.id}`);
  
  sendBtn.addEventListener("click", () => {
    if (tab.isExecuting) {
      // Stop button clicked
      stopExecution(tab);
    } else {
      handleChatSend(tab);
    }
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!tab.isExecuting) {
        handleChatSend(tab);
      }
    }
  });

  askToggle?.addEventListener("change", (e) => {
    state.settings.mode = e.target.checked ? "ask" : "auto";
    saveSettings();
  });

  // Session selector event listeners
  const sessionSelector = document.getElementById(`session-selector-${tab.id}`);
  const sessionNewBtn = document.getElementById(`session-new-${tab.id}`);

  sessionSelector?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSessionDropdown(tab);
  });

  sessionNewBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!tab.site?.id) return;

    saveCurrentSession(tab);
    const newSession = createNewSession(tab.site.id, tab.sessions);
    tab.activeSessionId = newSession.id;
    tab.chat = [];
    saveLastActiveSession(tab.site.id, newSession.id);

    renderChat(tab);
    updateSessionBar(tab);
    closeSessionDropdown();
    showToast("success", "New Chat", `"${newSession.name}" created`);
  });
};

// ========================================
// Stop Execution
// ========================================
const stopExecution = async (tab) => {
  // Send Ctrl+C to interrupt any running command in the shell
  if (tab.id) {
    await sshApi.sshInterrupt({ tabId: tab.id });
  }

  if (tab.abortController) {
    tab.abortController.abort();
    tab.abortController = null;
  }
  tab.isExecuting = false;
  removeThinkingMessage(tab);
  addChatMessage(tab, "assistant", "Execution stopped by user.");
  showToast("info", "Stopped", "Command execution was stopped");
  updateSendButton(tab);
};

const updateSendButton = (tab) => {
  const sendBtn = document.getElementById(`chat-send-${tab.id}`);
  const chatInput = document.getElementById(`chat-input-${tab.id}`);
  if (!sendBtn) return;

  if (tab.isExecuting) {
    sendBtn.className = "stop-btn";
    sendBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>
      Stop
    `;
    if (chatInput) chatInput.disabled = true;
  } else {
    sendBtn.className = "primary";
    sendBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
      Send
    `;
    if (chatInput) chatInput.disabled = false;
  }
};

// ========================================
// Session Dropdown
// ========================================
let activeDropdownTabId = null;

const closeSessionDropdown = () => {
  const existing = document.querySelector(".session-dropdown");
  if (existing) existing.remove();
  activeDropdownTabId = null;
};

document.addEventListener("click", () => {
  closeSessionDropdown();
});

const toggleSessionDropdown = (tab) => {
  if (activeDropdownTabId === tab.id) {
    closeSessionDropdown();
    return;
  }
  closeSessionDropdown();
  activeDropdownTabId = tab.id;

  const selectorBtn = document.getElementById(`session-selector-${tab.id}`);
  const sessionBar = document.getElementById(`session-bar-${tab.id}`);
  if (!selectorBtn || !sessionBar) return;

  const dropdown = document.createElement("div");
  dropdown.className = "session-dropdown";
  dropdown.addEventListener("click", (e) => e.stopPropagation());

  const sortedSessions = [...(tab.sessions || [])].sort((a, b) => {
    if (a.id === tab.activeSessionId) return -1;
    if (b.id === tab.activeSessionId) return 1;
    return b.updatedAt - a.updatedAt;
  });

  let html = `<div class="session-dropdown-header">
    <span class="session-dropdown-title">Chat Sessions</span>
    <span class="session-dropdown-count">${sortedSessions.length} session${sortedSessions.length !== 1 ? "s" : ""}</span>
  </div>
  <div class="session-dropdown-list">`;

  for (const session of sortedSessions) {
    const isActive = session.id === tab.activeSessionId;
    const userMsgCount = session.messages?.filter((m) => m.role === "user").length || 0;
    const timeAgo = formatSessionDate(session.updatedAt);
    const firstUserMsg = session.messages?.find((m) => m.role === "user");
    const preview = firstUserMsg
      ? firstUserMsg.text.slice(0, 50) + (firstUserMsg.text.length > 50 ? "..." : "")
      : "Empty session";

    html += `
      <div class="session-item ${isActive ? "active" : ""}" data-session-id="${session.id}">
        <div class="session-item-main" data-action="switch" data-session-id="${session.id}">
          <div class="session-item-top">
            <span class="session-item-name" data-session-id="${session.id}">${escapeHtml(session.name)}</span>
            <span class="session-item-time">${timeAgo}</span>
          </div>
          <div class="session-item-preview">${escapeHtml(preview)}</div>
          <div class="session-item-meta">
            <span>${userMsgCount} message${userMsgCount !== 1 ? "s" : ""}</span>
            ${isActive ? '<span class="session-active-badge">Active</span>' : ""}
          </div>
        </div>
        <div class="session-item-actions">
          <button class="session-rename-btn" data-action="rename" data-session-id="${session.id}" title="Rename">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="session-delete-btn" data-action="delete" data-session-id="${session.id}" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  html += `</div>`;
  dropdown.innerHTML = html;

  sessionBar.style.position = "relative";
  sessionBar.appendChild(dropdown);

  dropdown.querySelectorAll('[data-action="switch"]').forEach((el) => {
    el.addEventListener("click", () => {
      const sessionId = el.dataset.sessionId;
      if (sessionId !== tab.activeSessionId) {
        switchSession(tab, sessionId);
      }
      closeSessionDropdown();
    });
  });

  dropdown.querySelectorAll('[data-action="rename"]').forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const sessionId = el.dataset.sessionId;
      const session = tab.sessions.find((s) => s.id === sessionId);
      if (!session) return;

      const nameSpan = dropdown.querySelector(`.session-item-name[data-session-id="${sessionId}"]`);
      if (!nameSpan) return;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "session-rename-input";
      input.value = session.name;
      input.addEventListener("click", (ev) => ev.stopPropagation());
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          renameSession(tab, sessionId, input.value);
          closeSessionDropdown();
        }
        if (ev.key === "Escape") {
          closeSessionDropdown();
        }
      });
      input.addEventListener("blur", () => {
        renameSession(tab, sessionId, input.value);
        closeSessionDropdown();
      });

      nameSpan.replaceWith(input);
      input.focus();
      input.select();
    });
  });

  dropdown.querySelectorAll('[data-action="delete"]').forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const sessionId = el.dataset.sessionId;
      deleteSession(tab, sessionId);
      closeSessionDropdown();
    });
  });
};

// ========================================
// Chat Functions
// ========================================
const renderChat = (tab) => {
  const chatEl = document.getElementById(`chat-${tab.id}`);
  if (!chatEl) return;
  
  chatEl.innerHTML = "";
  
  if (tab.chat.length === 0) {
    chatEl.innerHTML = `
      <div class="empty-state" style="padding: 32px 16px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p style="font-size: 12px; margin-top: 12px;">Ask AI to help you run commands</p>
      </div>
    `;
    return;
  }
  
  tab.chat.forEach((msg) => {
    const bubble = document.createElement("div");
    bubble.className = `chat-message ${msg.role}`;
    
    if (msg.isThinking) {
      bubble.classList.add("thinking");
      bubble.innerHTML = `
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
        <span>${msg.text || "Thinking..."}</span>
      `;
    } else if (msg.role === "answer") {
      bubble.innerHTML = `
        <div class="answer-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <span>Answer</span>
          <button class="copy-btn" title="Copy answer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
        <div class="answer-content">${parseSimpleMarkdown(msg.text)}</div>
      `;
      // Copy button handler
      const copyBtn = bubble.querySelector(".copy-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => copyToClipboard(msg.text, copyBtn));
      }
    } else if (msg.role === "impossible") {
      // Impossible/blocked message type
      bubble.innerHTML = `
        <div class="impossible-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          <span>Cannot Proceed</span>
        </div>
        <div class="impossible-content">${parseSimpleMarkdown(msg.text)}</div>
        ${msg.suggestion ? `<div class="impossible-suggestion"><strong>Alternative:</strong> ${escapeHtml(msg.suggestion)}</div>` : ""}
      `;
    } else if (msg.role === "info") {
      // Informational response (no command needed)
      bubble.innerHTML = `
        <div class="info-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>Info</span>
          <button class="copy-btn" title="Copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
        <div class="info-content">${parseSimpleMarkdown(msg.text)}</div>
      `;
      const copyBtn = bubble.querySelector(".copy-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => copyToClipboard(msg.text, copyBtn));
      }
    } else if (msg.role === "clarification") {
      // Clarification request from AI
      bubble.innerHTML = `
        <div class="clarification-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <path d="M12 17h.01"/>
          </svg>
          <span>Clarification Needed</span>
        </div>
        <div class="clarification-content">${parseSimpleMarkdown(msg.text)}</div>
        ${msg.options && msg.options.length > 0 ? `
          <div class="clarification-options">
            ${msg.options.map((opt) => `<button class="clarification-option" data-option="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join("")}
          </div>
        ` : ""}
      `;
      // Option click handlers
      bubble.querySelectorAll(".clarification-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          const optionText = btn.dataset.option;
          const input = document.getElementById(`chat-input-${tab.id}`);
          if (input) {
            input.value = optionText;
            handleChatSend(tab);
          }
        });
      });
    } else if (msg.role === "plan") {
      // Multi-step plan display
      bubble.innerHTML = `
        <div class="plan-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span>${escapeHtml(msg.title || "Execution Plan")}</span>
        </div>
        <div class="plan-content">
          ${msg.explanation ? `<p class="plan-explanation">${escapeHtml(msg.explanation)}</p>` : ""}
          <div class="plan-steps">
            ${(msg.steps || []).map((step, i) => `
              <div class="plan-step ${step.status || ""}" data-step-index="${i}">
                <div class="plan-step-number">${i + 1}</div>
                <div class="plan-step-info">
                  <div class="plan-step-desc">${escapeHtml(step.description)}</div>
                  <div class="plan-step-cmd"><code>${escapeHtml(step.command)}</code></div>
                </div>
                <div class="plan-step-status">
                  ${step.status === "done" ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ""}
                  ${step.status === "running" ? '<div class="spinner"></div>' : ""}
                  ${step.status === "failed" ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' : ""}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    } else if (msg.role === "assistant") {
      // Regular assistant messages - check for command messages to add copy button
      const commandMatch = msg.text.match(/^Command: `(.+)`$/);
      if (commandMatch) {
        bubble.innerHTML = `
          <span>Command: <code>${escapeHtml(commandMatch[1])}</code></span>
          <button class="copy-btn inline" title="Copy command">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        `;
        const copyBtn = bubble.querySelector(".copy-btn");
        if (copyBtn) {
          copyBtn.addEventListener("click", () => copyToClipboard(commandMatch[1], copyBtn));
        }
      } else {
        bubble.textContent = msg.text;
      }
    } else {
      bubble.textContent = msg.text;
    }
    
    chatEl.appendChild(bubble);
  });
  
  chatEl.scrollTop = chatEl.scrollHeight;
};

const addChatMessage = (tab, role, text, extra = {}) => {
  const msg = { role, text, ...extra };
  tab.chat.push(msg);
  renderChat(tab);
  if (!extra.isThinking) {
    saveCurrentSession(tab);
  }
};

const removeThinkingMessage = (tab) => {
  tab.chat = tab.chat.filter((msg) => !msg.isThinking);
  renderChat(tab);
};

const shouldRunCommand = (tab, command, risk) => {
  // Always ask for high risk commands regardless of mode
  if (state.settings.mode === "auto" && risk !== "high") return Promise.resolve(true);
  
  return new Promise((resolve) => {
    const chatEl = document.getElementById(`chat-${tab.id}`);
    if (!chatEl) return resolve(false);

    const confirmEl = document.createElement("div");
    confirmEl.className = `chat-confirm ${risk === "high" ? "high-risk" : ""}`;
    confirmEl.innerHTML = `
      <div class="confirm-header">
        ${risk === "high" ? `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          High Risk Command — Review Carefully
        ` : `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
          </svg>
          Execute this command?
        `}
      </div>
      <div class="confirm-command"><code>${escapeHtml(command)}</code></div>
      <div class="confirm-actions">
        <button class="confirm-cancel ghost">Cancel</button>
        <button class="confirm-execute primary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Execute
        </button>
      </div>
    `;

    chatEl.appendChild(confirmEl);
    chatEl.scrollTop = chatEl.scrollHeight;

    const cleanup = () => {
      confirmEl.remove();
    };

    confirmEl.querySelector(".confirm-cancel").addEventListener("click", () => {
      cleanup();
      resolve(false);
    });

    confirmEl.querySelector(".confirm-execute").addEventListener("click", () => {
      cleanup();
      resolve(true);
    });
  });
};

// Build chat history for context
const buildChatHistory = (tab) => {
  const history = [];
  for (const msg of tab.chat) {
    if (msg.isThinking) continue;
    if (msg.role === "user") {
      history.push(`[USER]: ${msg.text}`);
    } else if (msg.role === "answer") {
      history.push(`[AI ANALYSIS]: ${msg.text}`);
    } else if (msg.role === "impossible") {
      history.push(`[BLOCKED]: ${msg.text}`);
    } else if (msg.role === "info") {
      history.push(`[INFO]: ${msg.text}`);
    } else if (msg.role === "clarification") {
      history.push(`[CLARIFICATION ASKED]: ${msg.text}`);
    } else if (msg.role === "plan") {
      history.push(`[PLAN]: ${msg.title} - ${(msg.steps || []).map((s) => s.description).join(", ")}`);
    } else if (msg.role === "assistant" && msg.text) {
      if (msg.text.startsWith("Command:")) {
        history.push(`[COMMAND EXECUTED]: ${msg.text.replace("Command: ", "").replace(/`/g, "")}`);
      } else if (msg.text.includes("completed successfully")) {
        history.push(`[RESULT]: Success`);
      } else if (msg.text.includes("failed") || msg.text.includes("error") || msg.text.includes("Error")) {
        history.push(`[RESULT]: ${msg.text}`);
      } else if (msg.text.includes("stopped by user") || msg.text.includes("cancelled")) {
        history.push(`[STOPPED]: User stopped execution`);
      } else if (msg.text.includes("Aborted")) {
        history.push(`[ABORTED]: ${msg.text}`);
      }
    }
  }
  return history.slice(-20);
};

// ========================================
// Main Chat Send Handler (Super Intelligent)
// ========================================
const handleChatSend = async (tab) => {
  const input = document.getElementById(`chat-input-${tab.id}`);
  const prompt = input.value.trim();
  if (!prompt) return;
  
  if (!tab.site) {
    addChatMessage(tab, "assistant", "Please connect to a server first.");
    return;
  }

  if (tab.status !== "connected") {
    addChatMessage(tab, "assistant", "Not connected to server. Please reconnect first.");
    return;
  }

  if (tab.isExecuting) return;
  
  input.value = "";

  const isFirstMessage = !tab.chat.some((m) => m.role === "user" && !m.isThinking);
  const chatHistory = buildChatHistory(tab);
  
  addChatMessage(tab, "user", prompt);
  addChatMessage(tab, "assistant", "Analyzing request...", { isThinking: true });

  if (isFirstMessage) {
    generateSessionTitle(tab, prompt);
  }

  // Set up abort controller for this execution
  tab.abortController = new AbortController();
  tab.isExecuting = true;
  updateSendButton(tab);

  try {
    const response = await sshApi.aiGetCommand({
      prompt,
      logs: tab.logs.slice(-8000),
      chatHistory,
      envInfo: tab.envInfo || null,
      settings: state.settings
    });

    // Check if aborted
    if (tab.abortController?.signal?.aborted) {
      removeThinkingMessage(tab);
      return;
    }

    removeThinkingMessage(tab);
    
    if (!response.ok) {
      addChatMessage(tab, "assistant", response.error || "AI request failed.");
      showToast("error", "AI Error", response.error || "Failed to get response");
      return;
    }

    // Handle different response types
    const responseType = response.responseType || "command";

    switch (responseType) {
      case "impossible":
        addChatMessage(tab, "impossible", response.reason, { suggestion: response.suggestion });
        showToast("warning", "Cannot Proceed", "This task isn't feasible on this system");
        break;

      case "info":
        addChatMessage(tab, "info", response.answer);
        break;

      case "clarification":
        addChatMessage(tab, "clarification", response.question, { options: response.options || [] });
        break;

      case "plan":
        await executePlan(tab, prompt, response, chatHistory);
        break;

      case "command":
      default:
        if (!response.command) {
          addChatMessage(tab, "assistant", "No command was returned by the AI.");
          break;
        }

        // Show explanation if available
        if (response.explanation) {
          addChatMessage(tab, "assistant", response.explanation);
        }

        await runCommandWithRetries(tab, prompt, response.command, chatHistory, response.risk || "low");
        break;
    }
  } finally {
    tab.isExecuting = false;
    tab.abortController = null;
    updateSendButton(tab);
  }
};

// ========================================
// Plan Step Failure Options (Skip / Retry / Stop)
// ========================================
const showPlanFailureOptions = (tab, stepNum, totalSteps) => {
  return new Promise((resolve) => {
    const chatEl = document.getElementById(`chat-${tab.id}`);
    if (!chatEl) return resolve("stop");

    const optionsEl = document.createElement("div");
    optionsEl.className = "plan-failure-options";
    optionsEl.innerHTML = `
      <div class="plan-failure-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Step ${stepNum} of ${totalSteps} failed. What would you like to do?
      </div>
      <div class="plan-failure-actions">
        <button class="plan-action-btn retry" data-action="retry">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Retry Step
        </button>
        <button class="plan-action-btn skip" data-action="skip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
          </svg>
          Skip & Continue
        </button>
        <button class="plan-action-btn stop" data-action="stop">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
          Stop Plan
        </button>
      </div>
    `;

    chatEl.appendChild(optionsEl);
    chatEl.scrollTop = chatEl.scrollHeight;

    optionsEl.querySelectorAll(".plan-action-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        optionsEl.remove();
        resolve(btn.dataset.action);
      });
    });
  });
};

// ========================================
// Execute Multi-Step Plan
// ========================================
const executePlan = async (tab, prompt, plan, chatHistory) => {
  const steps = plan.steps || [];
  if (steps.length === 0) {
    addChatMessage(tab, "assistant", "The plan has no steps to execute.");
    return;
  }

  // Add plan message with step statuses
  const stepsWithStatus = steps.map((s) => ({ ...s, status: "pending" }));
  const planMsg = {
    role: "plan",
    text: plan.explanation || "",
    title: plan.title || "Execution Plan",
    steps: stepsWithStatus,
    explanation: plan.explanation || ""
  };
  tab.chat.push(planMsg);
  renderChat(tab);
  saveCurrentSession(tab);

  // Execute each step
  for (let i = 0; i < stepsWithStatus.length; i++) {
    // Check if aborted
    if (tab.abortController?.signal?.aborted) {
      stepsWithStatus[i].status = "failed";
      renderChat(tab);
      return;
    }

    stepsWithStatus[i].status = "running";
    renderChat(tab);

    const step = stepsWithStatus[i];

    // Ask for confirmation if in ask mode
    const shouldRun = await shouldRunCommand(tab, step.command, "low");
    if (!shouldRun) {
      stepsWithStatus[i].status = "failed";
      addChatMessage(tab, "assistant", `Step ${i + 1} cancelled by user. Stopping plan execution.`);
      renderChat(tab);
      return;
    }

    // Execute the step
    const result = await sshApi.sshExec({
      tabId: tab.id,
      command: step.command,
      password: tab.site?.password || ""
    });

    if (tab.abortController?.signal?.aborted) {
      stepsWithStatus[i].status = "failed";
      renderChat(tab);
      return;
    }

    const logs = [result.stdout || "", result.stderr || "", result.error || ""].filter(Boolean).join("\n");
    tab.logs += `\n$ ${step.command}\n${logs}\n`;

    if (result.timedOut) {
      stepsWithStatus[i].status = "failed";
      addChatMessage(tab, "assistant", `Step ${i + 1} timed out. Stopping plan.`);
      renderChat(tab);
      return;
    }

    // Interpret the result
    const interpretation = await sshApi.aiInterpretOutput({
      prompt: `Step ${i + 1} of plan "${plan.title}": ${step.description}`,
      command: step.command,
      output: result.cleanStdout || result.stdout || "",
      chatHistory,
      envInfo: tab.envInfo || null,
      settings: state.settings
    });

    const heuristicOk = result.ok;
    const aiSaysOk = interpretation.ok ? interpretation.commandSucceeded : true;
    const isSuccess = aiSaysOk !== false && (heuristicOk || aiSaysOk === true);

    if (isSuccess) {
      stepsWithStatus[i].status = "done";
      renderChat(tab);

      if (interpretation.ok && interpretation.answer) {
        addChatMessage(tab, "answer", `**Step ${i + 1}:** ${interpretation.answer}`);
      }
    } else {
      stepsWithStatus[i].status = "failed";
      renderChat(tab);

      // Check for permanent failure
      if (interpretation.permanentFailure) {
        addChatMessage(tab, "impossible", interpretation.answer || "This step failed permanently.", {
          suggestion: interpretation.failureCategory === "os_incompatible"
            ? "This software requires a different operating system."
            : null
        });
        return;
      }

      if (interpretation.ok && interpretation.answer) {
        addChatMessage(tab, "answer", `**Step ${i + 1} failed:** ${interpretation.answer}`);
      }

      // Offer to skip or retry
      const remainingSteps = stepsWithStatus.length - i - 1;
      if (remainingSteps > 0) {
        const action = await showPlanFailureOptions(tab, i + 1, stepsWithStatus.length);
        if (action === "skip") {
          stepsWithStatus[i].status = "failed";
          renderChat(tab);
          continue; // Skip to next step
        } else if (action === "retry") {
          stepsWithStatus[i].status = "pending";
          i--; // Will be incremented by the loop, effectively retrying
          renderChat(tab);
          continue;
        } else {
          // "stop" — user chose to stop
          addChatMessage(tab, "assistant", `Plan execution stopped at step ${i + 1}.`);
          return;
        }
      } else {
        addChatMessage(tab, "assistant", `Plan failed on the last step (${i + 1}/${stepsWithStatus.length}).`);
        return;
      }
    }
  }

  // All steps completed (some may have been skipped)
  const doneCount = stepsWithStatus.filter((s) => s.status === "done").length;
  const failedCount = stepsWithStatus.filter((s) => s.status === "failed").length;
  if (failedCount > 0) {
    addChatMessage(tab, "assistant", `Plan finished: ${doneCount}/${stepsWithStatus.length} steps succeeded, ${failedCount} skipped/failed.`);
    showToast("info", "Plan Finished", `${doneCount} steps succeeded, ${failedCount} had issues`);
  } else {
    addChatMessage(tab, "assistant", "All plan steps completed successfully!");
    showToast("success", "Plan Complete", `All ${stepsWithStatus.length} steps finished`);
  }
};

// ========================================
// Command Execution with Smart Retries
// ========================================
const runCommandWithRetries = async (tab, prompt, command, chatHistory = [], risk = "low") => {
  let retries = 0;
  let current = command;
  const failedCommands = [];

  while (retries < state.settings.maxRetries) {
    // Check if aborted
    if (tab.abortController?.signal?.aborted) return;

    addChatMessage(tab, "assistant", `Command: \`${current}\``);

    const shouldRun = await shouldRunCommand(tab, current, risk);
    if (!shouldRun) {
      addChatMessage(tab, "assistant", "Execution cancelled by user.");
      return;
    }

    if (tab.abortController?.signal?.aborted) return;

    if (!tab.commandHistory) tab.commandHistory = [];
    tab.commandHistory.push(current);

    const result = await sshApi.sshExec({
      tabId: tab.id,
      command: current,
      password: tab.site?.password || ""
    });

    if (tab.abortController?.signal?.aborted) return;

    const logs = [result.stdout || "", result.stderr || "", result.error || ""].filter(Boolean).join("\n");
    tab.logs += `\n$ ${current}\n${logs}\n`;

    if (result.timedOut) {
      addChatMessage(tab, "assistant", "Command timed out. It may still be running in the background.");
      showToast("error", "Timeout", "The command took too long to complete");
      return;
    }

    // Interpret output
    addChatMessage(tab, "assistant", "Analyzing output...", { isThinking: true });

    const interpretation = await sshApi.aiInterpretOutput({
      prompt,
      command: current,
      output: result.cleanStdout || result.stdout || "",
      chatHistory,
      envInfo: tab.envInfo || null,
      settings: state.settings
    });

    if (tab.abortController?.signal?.aborted) {
      removeThinkingMessage(tab);
      return;
    }

    removeThinkingMessage(tab);

    // Check for permanent failure FIRST — stop immediately
    if (interpretation.ok && interpretation.permanentFailure) {
      addChatMessage(tab, "impossible", interpretation.answer || "This task cannot be completed on this system.", {
        suggestion: interpretation.failureCategory === "os_incompatible"
          ? "This software requires a different operating system/distribution."
          : interpretation.failureCategory === "arch_incompatible"
          ? "This software doesn't support this CPU architecture."
          : null
      });
      showToast("warning", "Permanent Failure", "This task cannot succeed on this system");
      return;
    }

    const heuristicOk = result.ok;
    const aiSaysOk = interpretation.ok ? interpretation.commandSucceeded : true;
    const isSuccess = aiSaysOk !== false && (heuristicOk || aiSaysOk === true);

    if (isSuccess) {
      addChatMessage(tab, "assistant", "Command completed successfully.");
      
      if (interpretation.ok && interpretation.answer) {
        addChatMessage(tab, "answer", interpretation.answer);
      }
      
      showToast("success", "Command Executed", "The command completed successfully");
      return;
    }

    // Command failed — try to fix
    failedCommands.push(current);
    retries += 1;

    if (interpretation.ok && interpretation.answer) {
      addChatMessage(tab, "answer", interpretation.answer);
    }

    if (retries >= state.settings.maxRetries) {
      addChatMessage(tab, "assistant", "Maximum retries reached. Please try manually or rephrase your request.");
      showToast("error", "Max Retries", "The command failed after multiple attempts");
      return;
    }

    addChatMessage(tab, "assistant", `Attempt ${retries}/${state.settings.maxRetries} failed. Generating a fix...`);
    addChatMessage(tab, "assistant", "Analyzing failure...", { isThinking: true });

    const fix = await sshApi.aiFixCommand({
      prompt,
      logs: logs || "Unknown error",
      chatHistory,
      failedCommands,
      envInfo: tab.envInfo || null,
      settings: state.settings
    });

    if (tab.abortController?.signal?.aborted) {
      removeThinkingMessage(tab);
      return;
    }

    removeThinkingMessage(tab);

    if (!fix.ok) {
      addChatMessage(tab, "assistant", fix.error || "Could not generate a fix. Please try manually.");
      return;
    }

    // Check if the fix response says "abort" — permanent failure detected
    if (fix.responseType === "abort") {
      addChatMessage(tab, "impossible", fix.reason, { suggestion: fix.suggestion });
      showToast("warning", "Cannot Fix", fix.rootCause === "os_incompatible" 
        ? "Incompatible operating system" 
        : "This issue cannot be resolved automatically");
      return;
    }

    // If the fix suggests a plan instead of a single command, switch to plan execution
    if (fix.responseType === "plan") {
      if (fix.explanation) {
        addChatMessage(tab, "assistant", fix.explanation);
      }
      await executePlan(tab, prompt, fix, chatHistory);
      return; // Plan execution handles everything from here
    }

    // Get the fixed command
    const fixedCommand = fix.command;
    if (!fixedCommand) {
      addChatMessage(tab, "assistant", "AI could not generate a fix. Please try manually.");
      return;
    }

    // Check duplicate
    if (failedCommands.includes(fixedCommand)) {
      addChatMessage(tab, "assistant", "AI suggested the same command that already failed. Stopping to prevent an infinite loop.");
      return;
    }

    // Show fix explanation if available
    if (fix.explanation) {
      addChatMessage(tab, "assistant", fix.explanation);
    }

    // Show confidence warning for low confidence fixes
    if (fix.confidence === "low") {
      addChatMessage(tab, "assistant", "Note: AI confidence is low for this fix. It may not resolve the issue.");
    }

    current = fixedCommand;
    // After first retry, always set risk to low for subsequent attempts
    risk = "low";
  }
};

// ========================================
// SSH Event Handlers
// ========================================
sshApi.onSshData(({ tabId, data }) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (tab?.terminal) {
    tab.terminal.write(data);
  }
  if (tab) {
    tab.logs += data;
    if (tab.logs.length > 24000) {
      tab.logs = tab.logs.slice(-24000);
    }
  }
});

sshApi.onSshStatus(({ tabId, status }) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (tab) {
    const statusLower = status.toLowerCase();
    if (statusLower.includes("connected") && !statusLower.includes("dis")) {
      tab.status = "connected";
      showToast("success", "Connected", `Connected to ${tab.title}`);

      if (!tab.envInfo) {
        setTimeout(() => detectEnvironment(tab), 1500);
      }
    } else if (statusLower.includes("connecting")) {
      tab.status = "connecting";
    } else {
      tab.status = "disconnected";
    }
    tab.statusText = status;
    renderTabs();
    renderActiveTab();
  }
});

sshApi.onSshError(({ tabId, error }) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (tab) {
    tab.status = "error";
    tab.statusText = "Error";
    addChatMessage(tab, "assistant", `Connection error: ${error}`);
    showToast("error", "Connection Error", error);
    renderTabs();
    renderActiveTab();
  }
});

// ========================================
// Site Manager Modal
// ========================================
const showSiteManager = () => {
  if (!siteManagerModal) return;
  siteManagerModal.classList.remove("hidden");
  state.selectedSiteId = null;
  state.isNewSite = false;
  renderSites();
  updateSiteDetailsForm();
};

const hideSiteManager = () => {
  if (!siteManagerModal) return;
  siteManagerModal.classList.add("hidden");
  state.selectedSiteId = null;
  state.isNewSite = false;
};

openSiteManagerBtn?.addEventListener("click", showSiteManager);
closeSiteManagerBtn?.addEventListener("click", hideSiteManager);

newSiteBtn?.addEventListener("click", () => {
  state.selectedSiteId = null;
  state.isNewSite = true;
  clearSiteForm();
  siteDetailsForm.classList.remove("hidden");
  noSiteSelected.classList.add("hidden");
  renderSites();
  document.getElementById("site-name").focus();
});

deleteSiteBtn?.addEventListener("click", () => {
  if (!state.selectedSiteId) {
    showToast("info", "No Selection", "Please select a site to delete");
    return;
  }
  
  const site = state.sites.find((s) => s.id === state.selectedSiteId);
  if (confirm(`Delete "${site?.name}"? This action cannot be undone.`)) {
    state.sites = state.sites.filter((s) => s.id !== state.selectedSiteId);
    saveSites();
    state.selectedSiteId = null;
    state.isNewSite = false;
    renderSites();
    updateSiteDetailsForm();
    showToast("success", "Site Deleted", `"${site?.name}" has been removed`);
  }
});

saveSiteBtn?.addEventListener("click", () => {
  const name = document.getElementById("site-name").value.trim();
  const host = document.getElementById("site-host").value.trim();
  const port = document.getElementById("site-port").value.trim();
  const username = document.getElementById("site-user").value.trim();
  const password = document.getElementById("site-pass").value.trim();

  if (!name || !host || !username) {
    showToast("error", "Missing Fields", "Label, host, and username are required");
    return;
  }

  if (state.isNewSite) {
    const newId = uid();
    state.sites.push({
      id: newId,
      name,
      host,
      port: port || "22",
      username,
      password
    });
    state.selectedSiteId = newId;
    state.isNewSite = false;
    showToast("success", "Site Created", `"${name}" has been saved`);
  } else if (state.selectedSiteId) {
    const site = state.sites.find((s) => s.id === state.selectedSiteId);
    if (site) {
      site.name = name;
      site.host = host;
      site.port = port || "22";
      site.username = username;
      site.password = password;
      showToast("success", "Site Updated", `"${name}" has been saved`);
    }
  }

  saveSites();
  renderSites();
});

connectSiteBtn?.addEventListener("click", () => {
  if (state.isNewSite) {
    const name = document.getElementById("site-name").value.trim();
    const host = document.getElementById("site-host").value.trim();
    const username = document.getElementById("site-user").value.trim();

    if (name && host && username) {
      saveSiteBtn.click();
    }
  }

  if (state.selectedSiteId) {
    connectSelectedSite();
  } else {
    showToast("info", "No Selection", "Please select or create a site first");
  }
});

newTabBtn.addEventListener("click", () => createTab());

// ========================================
// Settings Modal
// ========================================
const showSettings = () => {
  if (!settingsModal) return;
  settingsModal.classList.remove("hidden");
  openaiKeyInput.value = state.settings.apiKey || "";
  maxRetriesInput.value = state.settings.maxRetries || 10;
  modelInput.value = state.settings.model || "gpt-5.2";
  themeSelect.value = state.settings.theme || "light";
  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.settings.mode);
  });
};

const hideSettings = () => {
  if (!settingsModal) return;
  settingsModal.classList.add("hidden");
};

window.__openSettings = showSettings;
window.__closeSettings = hideSettings;

openSettingsBtn?.addEventListener("click", showSettings);
closeSettingsBtn?.addEventListener("click", hideSettings);

siteManagerModal?.addEventListener("click", (e) => {
  if (e.target === siteManagerModal) {
    hideSiteManager();
  }
});

settingsModal?.addEventListener("click", (e) => {
  if (e.target === settingsModal) {
    hideSettings();
  }
});

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    modeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.settings.mode = btn.dataset.mode;
  });
});

saveSettingsBtn.addEventListener("click", () => {
  state.settings.apiKey = openaiKeyInput.value.trim();
  state.settings.maxRetries = Number(maxRetriesInput.value) || 10;
  state.settings.model = modelInput.value.trim() || "gpt-5.2";
  state.settings.theme = themeSelect.value || "light";
  saveSettings();
  applyTheme();
  hideSettings();
  showToast("success", "Settings Saved", "Your preferences have been updated");
  
  renderActiveTab();
});

// ========================================
// Keyboard Shortcuts
// ========================================
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!settingsModal.classList.contains("hidden")) {
      hideSettings();
    } else if (!siteManagerModal.classList.contains("hidden")) {
      hideSiteManager();
    }
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    showSettings();
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    showSiteManager();
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === "t") {
    e.preventDefault();
    createTab();
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === "w" && state.activeTabId) {
    e.preventDefault();
    closeTab(state.activeTabId);
  }
});

// ========================================
// Window Resize Handler
// ========================================
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    state.tabs.forEach((tab) => {
      if (tab.fitAddon && tab.terminal) {
        try {
          tab.fitAddon.fit();
        } catch (e) {
          // Ignore fit errors
        }
      }
    });
  }, 100);
});

// ========================================
// Initialization
// ========================================
const init = () => {
  loadSites();
  loadSettings();
  applyTheme();
  renderSites();
  renderTabs();
  renderActiveTab();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
