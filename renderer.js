const siteListEl = document.getElementById("site-list");
const addSiteBtn = document.getElementById("add-site");
const newTabBtn = document.getElementById("new-tab");
const tabsEl = document.getElementById("tabs");
const tabContentEl = document.getElementById("tab-content");

const settingsModal = document.getElementById("settings-modal");
const openSettingsBtn = document.getElementById("open-settings");
const closeSettingsBtn = document.getElementById("close-settings");
const saveSettingsBtn = document.getElementById("save-settings");
const openaiKeyInput = document.getElementById("openai-key");
const maxRetriesInput = document.getElementById("max-retries");
const modelInput = document.getElementById("model-name");
const themeSelect = document.getElementById("theme-select");
const modeButtons = document.querySelectorAll(".segmented-btn");

const sshApi = window.api || {
  sshConnect: async () => ({ ok: false, error: "Not available in browser" }),
  sshDisconnect: async () => ({ ok: true }),
  sshWrite: async () => ({ ok: true }),
  sshExec: async () => ({ ok: false, error: "Not available in browser" }),
  aiGetCommand: async () => ({ ok: false, error: "Not available in browser" }),
  aiFixCommand: async () => ({ ok: false, error: "Not available in browser" }),
  onSshData: () => {},
  onSshError: () => {},
  onSshStatus: () => {}
};

const state = {
  sites: [],
  tabs: [],
  activeTabId: null,
  settings: {
    apiKey: "",
    mode: "ask",
    maxRetries: 10,
    model: "gpt-5.2",
    theme: "light"
  }
};

const uid = () => Math.random().toString(36).slice(2, 10);

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

const applyTheme = () => {
  const theme = state.settings.theme || "light";
  if (theme === "light") {
    document.body.classList.add("light-theme");
  } else {
    document.body.classList.remove("light-theme");
  }
};

const renderSites = () => {
  siteListEl.innerHTML = "";
  if (state.sites.length === 0) {
    const empty = document.createElement("div");
    empty.className = "subtitle";
    empty.textContent = "No sites yet.";
    siteListEl.appendChild(empty);
    return;
  }

  state.sites.forEach((site) => {
    const card = document.createElement("div");
    card.className = "site-card";
    card.innerHTML = `
      <div class="meta">
        <strong>${site.name}</strong>
        <span>${site.username}@${site.host}:${site.port}</span>
      </div>
      <div class="row">
        <button class="ghost" data-action="connect">Connect</button>
        <button class="ghost" data-action="delete">Delete</button>
      </div>
    `;

    card.querySelector('[data-action="connect"]').addEventListener("click", () => {
      createTab(site);
    });
    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
      state.sites = state.sites.filter((s) => s.id !== site.id);
      saveSites();
      renderSites();
    });
    siteListEl.appendChild(card);
  });
};

const createTab = async (site) => {
  const tabId = uid();
  const tab = {
    id: tabId,
    title: site ? site.name : `Tab ${state.tabs.length + 1}`,
    site,
    status: "Disconnected",
    terminal: null,
    logs: "",
    chat: []
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
  tab.status = "Connecting...";
  renderTabs();
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
      <span>${tab.title}</span>
      <span class="status">${tab.status}</span>
      <button class="ghost" data-action="close">x</button>
    `;
    tabBtn.addEventListener("click", () => {
      state.activeTabId = tab.id;
      renderTabs();
      renderActiveTab();
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
    tabContentEl.innerHTML = `<div class="subtitle">Create a new tab to start.</div>`;
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "terminal-chat";
  wrapper.innerHTML = `
    <div class="terminal-panel">
      <div class="panel-header">
        <span>Terminal</span>
        <span class="status">${tab.status}</span>
      </div>
      <div class="terminal-body" id="terminal-${tab.id}"></div>
    </div>
    <div class="chat-panel">
      <div class="panel-header">
        <span>Chatbox</span>
        <span class="status">AI assisted</span>
      </div>
      <div class="chat-messages" id="chat-${tab.id}"></div>
      <div class="chat-input">
        <input id="chat-input-${tab.id}" placeholder="Ask to run command..." />
        <button class="primary" id="chat-send-${tab.id}">Send</button>
      </div>
    </div>
  `;
  tabContentEl.appendChild(wrapper);

  const terminalContainer = document.getElementById(`terminal-${tab.id}`);
  if (!tab.terminal) {
    tab.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      theme: {
        background: "#0b1220",
        foreground: "#e7ecf2"
      }
    });
    tab.terminal.open(terminalContainer);
    tab.terminal.onData((data) => {
      sshApi.sshWrite({ tabId: tab.id, data });
    });
  } else {
    tab.terminal.open(terminalContainer);
  }

  renderChat(tab);

  const sendBtn = document.getElementById(`chat-send-${tab.id}`);
  sendBtn.addEventListener("click", () => handleChatSend(tab));
  const input = document.getElementById(`chat-input-${tab.id}`);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleChatSend(tab);
    }
  });
};

const renderChat = (tab) => {
  const chatEl = document.getElementById(`chat-${tab.id}`);
  if (!chatEl) return;
  chatEl.innerHTML = "";
  tab.chat.forEach((msg) => {
    const bubble = document.createElement("div");
    bubble.className = `chat-message ${msg.role}`;
    bubble.textContent = msg.text;
    chatEl.appendChild(bubble);
  });
  chatEl.scrollTop = chatEl.scrollHeight;
};

const addChatMessage = (tab, role, text) => {
  tab.chat.push({ role, text });
  renderChat(tab);
};

const shouldRunCommand = (command) => {
  if (state.settings.mode === "auto") return true;
  return confirm(`Run this command?\n\n${command}`);
};

const handleChatSend = async (tab) => {
  const input = document.getElementById(`chat-input-${tab.id}`);
  const prompt = input.value.trim();
  if (!prompt) return;
  if (!tab.site) {
    addChatMessage(tab, "assistant", "Connect to a site first.");
    return;
  }
  input.value = "";

  addChatMessage(tab, "user", prompt);
  addChatMessage(tab, "assistant", "Thinking...");

  const response = await sshApi.aiGetCommand({
    prompt,
    logs: tab.logs.slice(-4000),
    settings: state.settings
  });

  tab.chat = tab.chat.filter((msg) => msg.text !== "Thinking...");
  if (!response.ok) {
    addChatMessage(tab, "assistant", response.error || "AI failed.");
    return;
  }

  let command = response.command;
  if (!command) {
    addChatMessage(tab, "assistant", "No command returned.");
    return;
  }

  await runCommandWithRetries(tab, prompt, command);
};

const runCommandWithRetries = async (tab, prompt, command) => {
  let retries = 0;
  let current = command;

  while (retries < state.settings.maxRetries) {
    addChatMessage(tab, "assistant", `Command: ${current}`);

    if (!shouldRunCommand(current)) {
      addChatMessage(tab, "assistant", "Execution canceled.");
      return;
    }

    const result = await sshApi.sshExec({
      tabId: tab.id,
      command: current
    });

    const logs = [
      result.stdout || "",
      result.stderr || "",
      result.error || ""
    ]
      .filter(Boolean)
      .join("\n");

    tab.logs += `\n$ ${current}\n${logs}\n`;

    if (result.ok) {
      addChatMessage(tab, "assistant", "Completed.");
      return;
    }

    retries += 1;
    if (retries >= state.settings.maxRetries) {
      addChatMessage(tab, "assistant", "Max retries reached.");
      return;
    }

    addChatMessage(tab, "assistant", "Retrying with fix...");

    const fix = await sshApi.aiFixCommand({
      prompt,
      logs: logs || "Unknown error",
      settings: state.settings
    });

    if (!fix.ok || !fix.command) {
      addChatMessage(tab, "assistant", fix.error || "No fix returned.");
      return;
    }

    current = fix.command;
  }
};

sshApi.onSshData(({ tabId, data }) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (tab?.terminal) {
    tab.terminal.write(data);
  }
  if (tab) {
    tab.logs += data;
    if (tab.logs.length > 12000) {
      tab.logs = tab.logs.slice(-12000);
    }
  }
});

sshApi.onSshStatus(({ tabId, status }) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (tab) {
    tab.status = status;
    renderTabs();
    renderActiveTab();
  }
});

sshApi.onSshError(({ tabId, error }) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (tab) {
    tab.status = "Error";
    addChatMessage(tab, "assistant", error);
    renderTabs();
    renderActiveTab();
  }
});

addSiteBtn.addEventListener("click", () => {
  const name = document.getElementById("site-name").value.trim();
  const host = document.getElementById("site-host").value.trim();
  const port = document.getElementById("site-port").value.trim();
  const username = document.getElementById("site-user").value.trim();
  const password = document.getElementById("site-pass").value.trim();

  if (!name || !host || !username) return;

  state.sites.push({
    id: uid(),
    name,
    host,
    port: port || "22",
    username,
    password
  });

  saveSites();
  renderSites();

  document.getElementById("site-name").value = "";
  document.getElementById("site-host").value = "";
  document.getElementById("site-port").value = "22";
  document.getElementById("site-user").value = "";
  document.getElementById("site-pass").value = "";
});

newTabBtn.addEventListener("click", () => createTab());

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

document.addEventListener("click", (e) => {
  if (e.target?.id === "open-settings") {
    showSettings();
  }
  if (e.target?.id === "close-settings") {
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
  settingsModal.classList.add("hidden");
});

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
