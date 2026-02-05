const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { Client } = require("ssh2");

const connections = new Map();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#f6f7fb",
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
  if (!entry?.shell) {
    return { ok: false, error: "Not connected or shell not ready" };
  }

  return await new Promise((resolve) => {
    let output = "";
    let commandSent = false;
    let resolved = false;
    
    // Prompt patterns for common shells
    const promptPatterns = [
      /\[.*@.*\][#$%>]\s*$/m,     // [user@host]# or [user@host]$
      /\S+@\S+[:~][#$%>]\s*$/m,   // user@host:~$
      /^[^@\n]+@[^:]+:[^$#]*[#$]\s*$/m  // user@host:/path$
    ];
    
    const hasPrompt = (text) => {
      return promptPatterns.some((p) => p.test(text));
    };

    // Error patterns to detect command failure
    const errorPatterns = [
      /command not found/i,
      /no such file or directory/i,
      /permission denied/i,
      /error:/i,
      /failed/i,
      /cannot /i,
      /unable to/i
    ];
    
    const hasError = (text) => {
      return errorPatterns.some((p) => p.test(text));
    };

    const dataHandler = (data) => {
      const text = data.toString();
      output += text;
      
      // After command is sent, wait for prompt to reappear
      if (commandSent && !resolved) {
        // Check if we see a prompt after the command output
        // Split by lines and check if last non-empty line looks like a prompt
        const lines = output.split("\n");
        const lastLine = lines[lines.length - 1] || lines[lines.length - 2] || "";
        
        if (hasPrompt(lastLine)) {
          resolved = true;
          
          // Give a tiny delay to ensure everything is flushed
          setTimeout(() => {
            entry.shell.removeListener("data", dataHandler);
            const isError = hasError(output);
            resolve({
              ok: !isError,
              code: isError ? 1 : 0,
              stdout: output,
              stderr: ""
            });
          }, 100);
        }
      }
    };

    entry.shell.on("data", dataHandler);

    // Write the command to shell
    entry.shell.write(command + "\n");
    commandSent = true;

    // Timeout after 60 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        entry.shell.removeListener("data", dataHandler);
        resolve({
          ok: false,
          error: "Command timed out",
          stdout: output,
          stderr: ""
        });
      }
    }, 60000);
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

ipcMain.handle(
  "ai-interpret-output",
  async (_event, { prompt, command, output, settings }) => {
    if (!settings?.apiKey) {
      return { ok: false, error: "Missing OpenAI API key" };
    }

    const messages = [
      {
        role: "system",
        content:
          "You are a helpful SSH assistant. The user asked a question, a command was run, and you now have the output. Provide a clear, concise, human-friendly answer to the user's original question based on the command output. Be brief but informative. Do not include the command or raw output in your response unless necessary for clarity. You may use **bold** for emphasis on important values."
      },
      {
        role: "user",
        content: `User's question: ${prompt}\n\nCommand executed: ${command}\n\nCommand output:\n${output}`
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

    return { ok: true, answer: result.text };
  }
);
