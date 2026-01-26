const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { Client } = require("ssh2");

const connections = new Map();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

const sendToRenderer = (event, channel, payload) => {
  if (event?.sender) {
    event.sender.send(channel, payload);
  }
};

const createShell = (conn, tabId, event) => {
  conn.shell({ term: "xterm-256color" }, (err, stream) => {
    if (err) {
      sendToRenderer(event, "ssh-error", { tabId, error: err.message });
      return;
    }
    const entry = connections.get(tabId);
    if (entry) {
      entry.shell = stream;
    }
    stream.on("data", (data) => {
      sendToRenderer(event, "ssh-data", { tabId, data: data.toString() });
    });
    stream.stderr.on("data", (data) => {
      sendToRenderer(event, "ssh-data", { tabId, data: data.toString() });
    });
    stream.on("close", () => {
      sendToRenderer(event, "ssh-status", {
        tabId,
        status: "Shell closed"
      });
    });
  });
};

ipcMain.handle("ssh-connect", async (event, { tabId, config }) => {
  if (connections.has(tabId)) {
    return { ok: true };
  }

  return await new Promise((resolve) => {
    const conn = new Client();

    conn
      .on("ready", () => {
        connections.set(tabId, { conn, shell: null });
        sendToRenderer(event, "ssh-status", { tabId, status: "Connected" });
        createShell(conn, tabId, event);
        resolve({ ok: true });
      })
      .on("error", (err) => {
        sendToRenderer(event, "ssh-error", { tabId, error: err.message });
        resolve({ ok: false, error: err.message });
      })
      .on("close", () => {
        connections.delete(tabId);
        sendToRenderer(event, "ssh-status", {
          tabId,
          status: "Disconnected"
        });
      })
      .connect({
        host: config.host,
        port: Number(config.port || 22),
        username: config.username,
        password: config.password,
        readyTimeout: 20000
      });
  });
});

ipcMain.handle("ssh-disconnect", async (_event, { tabId }) => {
  const entry = connections.get(tabId);
  if (entry?.conn) {
    entry.conn.end();
    connections.delete(tabId);
  }
  return { ok: true };
});

ipcMain.handle("ssh-write", async (_event, { tabId, data }) => {
  const entry = connections.get(tabId);
  if (entry?.shell) {
    entry.shell.write(data);
  }
  return { ok: true };
});

ipcMain.handle("ssh-exec", async (event, { tabId, command }) => {
  const entry = connections.get(tabId);
  if (!entry?.conn) {
    return { ok: false, error: "Not connected" };
  }

  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    entry.conn.exec(command, (err, stream) => {
      if (err) {
        return resolve({ ok: false, error: err.message });
      }

      stream.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        sendToRenderer(event, "ssh-data", { tabId, data: text });
      });

      stream.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        sendToRenderer(event, "ssh-data", { tabId, data: text });
      });

      stream.on("close", (code) => {
        resolve({
          ok: code === 0,
          code,
          stdout,
          stderr
        });
      });
    });
  });
});

const callOpenAI = async ({ apiKey, model, messages, maxRetries }) => {
  let lastError = null;
  for (let attempt = 0; attempt < Math.max(1, maxRetries); attempt += 1) {
    try {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          input: messages,
          temperature: 0.2
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "OpenAI request failed");
      }

      const json = await res.json();
      const outputText = json.output
        ?.map((o) => o.content?.map((c) => c.text || "").join(""))
        .join("") || "";

      return { ok: true, text: outputText.trim() };
    } catch (err) {
      lastError = err;
    }
  }

  return { ok: false, error: lastError?.message || "OpenAI failed" };
};

ipcMain.handle(
  "ai-get-command",
  async (_event, { prompt, logs, settings }) => {
    if (!settings?.apiKey) {
      return { ok: false, error: "Missing OpenAI API key" };
    }

    const messages = [
      {
        role: "system",
        content:
          "You are an SSH assistant. Respond with only a single command, no explanations."
      },
      {
        role: "user",
        content: `User request: ${prompt}\n\nRecent logs:\n${logs || "None"}`
      }
    ];

    const result = await callOpenAI({
      apiKey: settings.apiKey,
      model: settings.model || "gpt-5.2",
      messages,
      maxRetries: 2
    });

    if (!result.ok) {
      return result;
    }

    return { ok: true, command: result.text };
  }
);

ipcMain.handle(
  "ai-fix-command",
  async (_event, { prompt, logs, settings }) => {
    if (!settings?.apiKey) {
      return { ok: false, error: "Missing OpenAI API key" };
    }

    const messages = [
      {
        role: "system",
        content:
          "You are an SSH assistant. Provide a corrected single command only."
      },
      {
        role: "user",
        content: `Goal: ${prompt}\n\nLogs and error:\n${logs}`
      }
    ];

    const result = await callOpenAI({
      apiKey: settings.apiKey,
      model: settings.model || "gpt-5.2",
      messages,
      maxRetries: 2
    });

    if (!result.ok) {
      return result;
    }

    return { ok: true, command: result.text };
  }
);
