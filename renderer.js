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
  // First escape HTML
  let result = escapeHtml(text);
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
  // Convert newlines to <br> (but not inside lists)
  result = result.replace(/\n(?!<)/g, "<br>");
  // Clean up extra <br> after </ul>
  result = result.replace(/<\/ul><br>/g, "</ul>");
  return result;
};

// ========================================
// Toast Notifications
// ========================================
const showToast = (type, title, message, duration = 4000) => {
  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${icons[type]}
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
  // Find the next number for auto-naming
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

// Remember the last active session for each site
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

// Generate a title for a session based on the first user message
const generateSessionTitle = async (tab, prompt) => {
  if (!tab.site?.id || !tab.activeSessionId) return;

  const session = tab.sessions?.find((s) => s.id === tab.activeSessionId);
  if (!session) return;

  // Only generate title if session still has the default "Chat N" name
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
    // Silently fail — title generation is non-critical
  }
};

const switchSession = (tab, sessionId) => {
  // Save current session first
  saveCurrentSession(tab);

  // Switch to new session
  tab.activeSessionId = sessionId;
  const session = tab.sessions.find((s) => s.id === sessionId);
  tab.chat = session ? [...session.messages] : [];

  // Remember this as the last active session for the site
  if (tab.site?.id) {
    saveLastActiveSession(tab.site.id, sessionId);
  }

  renderChat(tab);
  updateSessionBar(tab);
};

const deleteSession = (tab, sessionId) => {
  if (!tab.site?.id || !tab.sessions) return;

  // Don't delete the last session
  if (tab.sessions.length <= 1) {
    showToast("info", "Cannot Delete", "You need at least one chat session");
    return;
  }

  const sessionName = tab.sessions.find((s) => s.id === sessionId)?.name || "";
  tab.sessions = tab.sessions.filter((s) => s.id !== sessionId);
  saveChatSessions(tab.site.id, tab.sessions);

  // If we deleted the active session, switch to the most recent one
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
// Tab Management
// ========================================
// ========================================
// Environment Detection
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
        // Package manager detection - take the last valid line from PKG block
        if (trimmed.startsWith("PKG:") || trimmed.match(/^\/.*\/(apt-get|yum|dnf|pacman|apk)$/)) {
          const pkgName = trimmed.replace(/^PKG:/, "").trim();
          if (pkgName && pkgName !== "unknown") {
            info.packageManager = pkgName.split("/").pop(); // Extract binary name from path
          }
        }
        if (/^(apt-get|yum|dnf|pacman|apk)$/.test(trimmed)) {
          info.packageManager = trimmed;
        }
      }

      // Determine init system
      if (info.initSystem === "systemd" || info.initSystem === "init") {
        info.initSystem = info.initSystem;
      } else {
        info.initSystem = "systemd"; // Default assumption for modern Linux
      }

      tab.envInfo = info;
    }
  } catch (e) {
    // Silently fail - environment detection is optional
    tab.envInfo = null;
  }
};

const createTab = async (site) => {
  const tabId = uid();

  // Load saved chat sessions for this site
  let sessions = site ? loadChatSessions(site.id) : [];
  let activeSessionId = null;

  if (site && sessions.length > 0) {
    // Try to restore last active session for this site
    const lastActiveId = getLastActiveSession(site.id);
    if (lastActiveId && sessions.find((s) => s.id === lastActiveId)) {
      activeSessionId = lastActiveId;
    } else {
      // Fall back to most recent
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      activeSessionId = sessions[0].id;
    }
  } else if (site) {
    // Create default first session
    const firstSession = createNewSession(site.id, sessions);
    activeSessionId = firstSession.id;
  }

  // Save the active session as the last active for this site
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
    envInfo: null, // Populated after connection
    commandHistory: [] // Track commands for retry context
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

  // Save chat session before closing
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
      <button class="close-btn" data-action="close" title="Close tab">×</button>
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
        <input id="chat-input-${tab.id}" placeholder="Ask AI to run a command..." />
        <button class="primary" id="chat-send-${tab.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          Send
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
    
    // Create and load FitAddon
    const fitAddon = new FitAddon.FitAddon();
    tab.terminal.loadAddon(fitAddon);
    tab.fitAddon = fitAddon;
    
    tab.terminal.open(terminalContainer);
    
    // Fit terminal to container
    setTimeout(() => {
      fitAddon.fit();
    }, 50);
    
    tab.terminal.onData((data) => {
      sshApi.sshWrite({ tabId: tab.id, data });
    });
  } else {
    tab.terminal.open(terminalContainer);
    // Re-fit terminal after re-opening
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
  
  sendBtn.addEventListener("click", () => handleChatSend(tab));
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend(tab);
    }
  });

  // Ask toggle event listener
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

    // Save current session
    saveCurrentSession(tab);

    // Create new session
    const newSession = createNewSession(tab.site.id, tab.sessions);
    tab.activeSessionId = newSession.id;
    tab.chat = [];

    // Remember as last active
    saveLastActiveSession(tab.site.id, newSession.id);

    renderChat(tab);
    updateSessionBar(tab);
    closeSessionDropdown();
    showToast("success", "New Chat", `"${newSession.name}" created`);
  });
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

// Close dropdown when clicking elsewhere
document.addEventListener("click", () => {
  closeSessionDropdown();
});

const toggleSessionDropdown = (tab) => {
  // If already open for this tab, close it
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

  // Sort sessions: active first, then by most recent
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
    const msgCount = session.messages?.length || 0;
    const userMsgCount = session.messages?.filter((m) => m.role === "user").length || 0;
    const timeAgo = formatSessionDate(session.updatedAt);
    // Get first user message as preview
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

  // Position dropdown below the session bar
  sessionBar.style.position = "relative";
  sessionBar.appendChild(dropdown);

  // Attach event listeners
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

      // Replace the session name span with an input
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
        <span>Thinking...</span>
      `;
    } else if (msg.role === "answer") {
      // Answer messages with an icon
      bubble.innerHTML = `
        <div class="answer-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <span>Answer</span>
        </div>
        <div class="answer-content">${parseSimpleMarkdown(msg.text)}</div>
      `;
    } else {
      bubble.textContent = msg.text;
    }
    
    chatEl.appendChild(bubble);
  });
  
  chatEl.scrollTop = chatEl.scrollHeight;
};

const addChatMessage = (tab, role, text, isThinking = false) => {
  tab.chat.push({ role, text, isThinking });
  renderChat(tab);
  // Auto-save non-thinking messages to persistent session
  if (!isThinking) {
    saveCurrentSession(tab);
  }
};

const removeThinkingMessage = (tab) => {
  tab.chat = tab.chat.filter((msg) => !msg.isThinking);
  renderChat(tab);
};

const shouldRunCommand = (tab, command) => {
  if (state.settings.mode === "auto") return Promise.resolve(true);
  
  return new Promise((resolve) => {
    const chatEl = document.getElementById(`chat-${tab.id}`);
    if (!chatEl) return resolve(false);

    // Create inline confirmation UI
    const confirmEl = document.createElement("div");
    confirmEl.className = "chat-confirm";
    confirmEl.innerHTML = `
      <div class="confirm-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
        </svg>
        Execute this command?
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

// Build chat history for context - richer and more structured
const buildChatHistory = (tab) => {
  const history = [];
  for (const msg of tab.chat) {
    if (msg.isThinking) continue;
    if (msg.role === "user") {
      history.push(`[USER]: ${msg.text}`);
    } else if (msg.role === "answer") {
      history.push(`[AI INTERPRETATION]: ${msg.text}`);
    } else if (msg.role === "assistant" && msg.text) {
      if (msg.text.startsWith("Command:")) {
        history.push(`[COMMAND EXECUTED]: ${msg.text.replace("Command: ", "").replace(/`/g, "")}`);
      } else if (msg.text.startsWith("✓")) {
        history.push(`[RESULT]: Success`);
      } else if (msg.text.includes("failed") || msg.text.includes("error") || msg.text.includes("Error")) {
        history.push(`[RESULT]: ${msg.text}`);
      } else if (msg.text.startsWith("Execution cancelled")) {
        history.push(`[CANCELLED]: User cancelled execution`);
      }
    }
  }
  // Keep last 20 items for comprehensive context
  return history.slice(-20);
};

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
  
  input.value = "";

  // Check if this is the first user message (for title generation)
  const isFirstMessage = !tab.chat.some((m) => m.role === "user" && !m.isThinking);

  // Build chat history before adding the new message
  const chatHistory = buildChatHistory(tab);
  
  addChatMessage(tab, "user", prompt);
  addChatMessage(tab, "assistant", "", true); // Thinking indicator

  // Generate session title on first message (fire and forget)
  if (isFirstMessage) {
    generateSessionTitle(tab, prompt);
  }

  const response = await sshApi.aiGetCommand({
    prompt,
    logs: tab.logs.slice(-8000), // More context for the AI
    chatHistory,
    envInfo: tab.envInfo || null,
    settings: state.settings
  });

  removeThinkingMessage(tab);
  
  if (!response.ok) {
    addChatMessage(tab, "assistant", response.error || "AI request failed.");
    showToast("error", "AI Error", response.error || "Failed to get command");
    return;
  }

  let command = response.command;
  if (!command) {
    addChatMessage(tab, "assistant", "No command was returned by the AI.");
    return;
  }

  await runCommandWithRetries(tab, prompt, command, chatHistory);
};

const runCommandWithRetries = async (tab, prompt, command, chatHistory = []) => {
  let retries = 0;
  let current = command;
  const failedCommands = []; // Track what we've already tried

  while (retries < state.settings.maxRetries) {
    addChatMessage(tab, "assistant", `Command: \`${current}\``);

    const shouldRun = await shouldRunCommand(tab, current);
    if (!shouldRun) {
      addChatMessage(tab, "assistant", "Execution cancelled by user.");
      return;
    }

    // Track command in history
    if (!tab.commandHistory) tab.commandHistory = [];
    tab.commandHistory.push(current);

    const result = await sshApi.sshExec({
      tabId: tab.id,
      command: current,
      password: tab.site?.password || "" // Pass password for sudo handling
    });

    const logs = [
      result.stdout || "",
      result.stderr || "",
      result.error || ""
    ]
      .filter(Boolean)
      .join("\n");

    tab.logs += `\n$ ${current}\n${logs}\n`;

    // Handle timeout specially
    if (result.timedOut) {
      addChatMessage(tab, "assistant", "Command timed out. It may still be running in the background.");
      showToast("error", "Timeout", "The command took too long to complete");
      return;
    }

    // Use AI to interpret output AND determine success
    addChatMessage(tab, "assistant", "", true); // Thinking indicator

    const interpretation = await sshApi.aiInterpretOutput({
      prompt,
      command: current,
      output: result.cleanStdout || result.stdout || "",
      chatHistory,
      envInfo: tab.envInfo || null,
      settings: state.settings
    });

    removeThinkingMessage(tab);

    // Determine success: combine heuristic detection with AI interpretation
    const heuristicOk = result.ok;
    const aiSaysOk = interpretation.ok ? interpretation.commandSucceeded : true;
    // Trust AI interpretation primarily, but also consider heuristic
    const isSuccess = aiSaysOk !== false && (heuristicOk || aiSaysOk === true);

    if (isSuccess) {
      addChatMessage(tab, "assistant", "✓ Command completed successfully.");
      
      if (interpretation.ok && interpretation.answer) {
        addChatMessage(tab, "answer", interpretation.answer);
      }
      
      showToast("success", "Command Executed", "The command completed successfully");
      return;
    }

    // Command failed
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
    addChatMessage(tab, "assistant", "", true); // Thinking indicator

    const fix = await sshApi.aiFixCommand({
      prompt,
      logs: logs || "Unknown error",
      chatHistory,
      failedCommands,
      envInfo: tab.envInfo || null,
      settings: state.settings
    });

    removeThinkingMessage(tab);

    if (!fix.ok || !fix.command) {
      addChatMessage(tab, "assistant", fix.error || "Could not generate a fix. Please try manually.");
      return;
    }

    // Check if the AI returned the same command we already tried
    if (failedCommands.includes(fix.command)) {
      addChatMessage(tab, "assistant", "AI suggested the same command that already failed. Stopping to prevent infinite loop.");
      return;
    }

    current = fix.command;
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
    // Larger log buffer for better AI context
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

      // Auto-detect environment after connection (with a small delay for shell to be ready)
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

// Close modals when clicking backdrop
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

// Execution mode toggle
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
  
  // Re-render active tab to update terminal theme
  renderActiveTab();
});

// ========================================
// Keyboard Shortcuts
// ========================================
document.addEventListener("keydown", (e) => {
  // Escape to close modals
  if (e.key === "Escape") {
    if (!settingsModal.classList.contains("hidden")) {
      hideSettings();
    } else if (!siteManagerModal.classList.contains("hidden")) {
      hideSiteManager();
    }
  }
  
  // Ctrl/Cmd + , for settings
  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    showSettings();
  }
  
  // Ctrl/Cmd + K for site manager
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    showSiteManager();
  }
  
  // Ctrl/Cmd + T for new tab
  if ((e.ctrlKey || e.metaKey) && e.key === "t") {
    e.preventDefault();
    createTab();
  }
  
  // Ctrl/Cmd + W to close current tab
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
    // Re-fit all terminal addons on resize
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
