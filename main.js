const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { Client } = require("ssh2");

const connections = new Map();

// ========================================
// Utility Functions
// ========================================

// Strip ANSI escape codes from terminal output for clean AI processing
const stripAnsi = (text) => {
  return text
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\x1B\].*?(?:\x07|\x1B\\)/g, "") // OSC sequences
    .replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F]/g, ""); // other control chars
};

// Sanitize AI response to extract clean command(s)
const sanitizeCommand = (text) => {
  let cmd = text.trim();

  // Remove markdown code blocks: ```bash\n...\n``` or ```\n...\n```
  const codeBlockMatch = cmd.match(/```(?:\w+)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    cmd = codeBlockMatch[1].trim();
  }

  // Remove inline backticks wrapping the entire command
  if (cmd.startsWith("`") && cmd.endsWith("`") && !cmd.includes("\n")) {
    cmd = cmd.slice(1, -1).trim();
  }

  // Remove common prefixes like "$ ", "# ", "> "
  cmd = cmd.replace(/^[$#>]\s+/, "");

  // Remove leading "Command: " or "Run: " or "Execute: " prefixes
  cmd = cmd.replace(/^(?:command|run|execute|try|use):\s*/i, "");

  // If multi-line, join with && (each line is a separate command)
  // But only if lines look like commands, not explanations
  const lines = cmd.split("\n").filter((l) => l.trim());
  if (lines.length > 1) {
    const commandLines = lines.filter((l) => {
      const trimmed = l.trim();
      // Filter out comment lines and explanatory text
      if (trimmed.startsWith("#") && !trimmed.startsWith("#!")) return false;
      if (trimmed.startsWith("//")) return false;
      if (/^(?:Note|This|The|It|You|Or|And|But|If|Then|Also|First|Next|Finally|Make sure|Remember)/i.test(trimmed)) return false;
      // Must start with a valid command character
      if (/^[a-zA-Z0-9_./~$(-]/.test(trimmed)) return true;
      return false;
    });
    if (commandLines.length > 0) {
      cmd = commandLines.join(" && ");
    }
  }

  // Remove any trailing explanation after the command
  const explSplit = cmd.split(/\n\n/);
  if (explSplit.length > 1) {
    cmd = explSplit[0].trim();
  }

  return cmd.trim();
};

// Determine dynamic timeout based on command type
const getCommandTimeout = (command) => {
  const cmd = command.toLowerCase();

  // Very long operations (up to 10 minutes)
  if (/\b(apt-get\s+(install|upgrade|dist-upgrade|update)|apt\s+(install|upgrade|full-upgrade|update)|yum\s+(install|update)|dnf\s+(install|update)|pacman\s+-S|pip\s+install|npm\s+install|yarn\s+(install|add)|composer\s+(install|update)|docker\s+(pull|build)|git\s+clone|wget\s|curl\s.*-[oO]|make\b|cmake\b|cargo\s+build|go\s+build)\b/.test(cmd)) {
    return 600000; // 10 minutes
  }

  // Medium operations (up to 3 minutes)
  if (/\b(service\s|systemctl\s|tar\s|zip\s|unzip\s|gzip\s|rsync\s|scp\s|cp\s+-r|find\s|du\s|certbot|letsencrypt)\b/.test(cmd)) {
    return 180000; // 3 minutes
  }

  // Default (2 minutes)
  return 120000;
};

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
  // Check if we already have a healthy connection
  const existing = connections.get(tabId);
  if (existing?.conn && existing?.shell) {
    return { ok: true };
  }

  // Clean up stale/dead connection entry before reconnecting
  if (existing) {
    try { existing.conn?.end(); } catch (_) { /* ignore */ }
    connections.delete(tabId);
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
        privateKey: config.privateKey || undefined,
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

// Send Ctrl+C (SIGINT) to interrupt a running command
ipcMain.handle("ssh-interrupt", async (_event, { tabId }) => {
  const entry = connections.get(tabId);
  if (entry?.shell) {
    entry.shell.write("\x03"); // Ctrl+C
  }
  return { ok: true };
});

// ========================================
// Smart Command Execution (Interactive Shell)
// ========================================
ipcMain.handle("ssh-exec", async (event, { tabId, command, password }) => {
  const entry = connections.get(tabId);
  if (!entry?.shell) {
    return { ok: false, error: "Not connected or shell not ready" };
  }

  return await new Promise((resolve) => {
    let output = "";
    let commandSent = false;
    let resolved = false;
    let sudoHandled = false;
    let interactiveResponses = 0;
    const maxInteractiveResponses = 5;

    // Dynamic timeout based on command type
    const timeout = getCommandTimeout(command);

    // Extended prompt patterns for various shells and configurations
    const promptPatterns = [
      /\[.*@.*\][#$%>]\s*$/m,
      /\S+@\S+[:~][^\n]*[#$%>]\s*$/m,
      /^[^@\n]+@[^:]+:[^$#]*[#$]\s*$/m,
      /^root@[^\s]+[:#][^\n]*[#$]\s*$/m,
      /^\w+@\w+[:\s~]*[$#%>]\s*$/m,
      /^(?:bash|sh|zsh)-[\d.]+[#$%>]\s*$/m,
      /^\([\w-]+\)\s*\S+@\S+/m,
      /^➜\s/m,
      /^\S+\s*[❯›▶]\s*$/m,
      /^localhost[:#~][^\n]*[#$]\s*$/m,
    ];

    const hasPrompt = (text) => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      return promptPatterns.some((p) => p.test(trimmed));
    };

    // Interactive prompt detection patterns
    const interactivePatterns = {
      sudo: /\[sudo\] password for \S+:|Password:\s*$/im,
      confirm: /\(y\/n\)|\[y\/N\]|\[Y\/n\]|\(yes\/no(?:\/\[fingerprint\])?\)|Do you want to continue\s*\?|Are you sure.*\?|Proceed\s*\?|Continue\s*\?|is that correct\s*\?|\bconfirm\b.*\?/im,
      pressEnter: /Press (?:ENTER|RETURN|any key)|Hit (?:enter|return)/im,
      overwrite: /(?:overwrite|replace|already exists).*\?/im,
      restart: /(?:restart|reload).*(?:service|daemon).*\?/im,
      dpkg: /What would you like to do about it|keep the local version|install the package maintainer/im,
      passphrase: /Enter passphrase|Enter new password|New password:|Retype new password:/im,
      // Git/HTTP auth prompts, login prompts — these can't be auto-answered
      authPrompt: /Username for ['"]https?:\/\/|Password for ['"]https?:\/\/|Token for ['"]https?:\/\/|Enter your .*(username|credentials|token|API key)/im,
    };

    // Smart error detection
    const detectError = (fullOutput) => {
      const clean = stripAnsi(fullOutput);
      const lines = clean.split("\n");
      let errorScore = 0;
      let successScore = 0;

      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;

        // Strong error indicators
        if (/^(?:bash|sh|zsh|fish): .+: command not found$/i.test(t)) errorScore += 3;
        if (/^(?:bash|sh|zsh|fish): .+: No such file or directory$/i.test(t)) errorScore += 3;
        if (/^-(?:bash|sh|zsh): .+: command not found$/i.test(t)) errorScore += 3;
        if (/^E: (?!0\b)/.test(t)) errorScore += 3;
        if (/^error\[/.test(t)) errorScore += 2;
        if (/^fatal:/i.test(t)) errorScore += 3;
        if (/^FATAL:/i.test(t)) errorScore += 3;
        if (/^ERROR:/i.test(t)) errorScore += 2;
        if (/Permission denied/i.test(t) && !/0 permission denied/i.test(t)) errorScore += 2;
        if (/Operation not permitted/i.test(t)) errorScore += 2;
        if (/(?:Cannot|Could not|Unable to) (?:open|find|read|write|access|connect|create|delete|remove)/i.test(t)) errorScore += 2;
        if (/No such file or directory/i.test(t)) errorScore += 2;
        if (/^dpkg: error/i.test(t)) errorScore += 3;
        if (/Segmentation fault/i.test(t)) errorScore += 3;
        if (/Killed$/i.test(t)) errorScore += 2;
        if (/^Traceback \(most recent call last\)/i.test(t)) errorScore += 3;
        if (/panic:/i.test(t)) errorScore += 3;
        if (/syntax error/i.test(t)) errorScore += 2;

        // Success indicators
        if (/\b(?:success(?:fully)?|done|completed?|ok|started|enabled|active|running|created|installed|updated|configured|restarted|reloaded)\b/i.test(t)
          && !/\b(?:not|no|un|dis|fail|error)\b/i.test(t)) successScore += 1;
        if (/^Setting up /i.test(t)) successScore += 1;
        if (/^Processing triggers/i.test(t)) successScore += 1;
        if (/is already the newest version/i.test(t)) successScore += 1;
        if (/^0 upgraded, 0 newly installed/i.test(t)) successScore += 1;
        if (/^\d+ upgraded, \d+ newly installed/i.test(t)) successScore += 2;

        // Noise - things that look like errors but aren't
        if (/^(?:failed|error)\w*\s*[:=]\s*0\b/i.test(t)) successScore += 1;
      }

      if (successScore > errorScore) return false;
      return errorScore >= 2;
    };

    const dataHandler = (data) => {
      const text = data.toString();
      output += text;

      if (commandSent && !resolved) {
        const recentOutput = output.slice(-500);

        // Handle sudo password prompt
        if (!sudoHandled && interactivePatterns.sudo.test(recentOutput)) {
          if (password && interactiveResponses < maxInteractiveResponses) {
            setTimeout(() => {
              entry.shell.write(password + "\n");
            }, 100);
            sudoHandled = true;
            interactiveResponses++;
            return;
          }
        }

        // Handle confirmation prompts
        if (interactivePatterns.confirm.test(recentOutput) && interactiveResponses < maxInteractiveResponses) {
          const confirmCount = (output.match(/\(y\/n\)|\[y\/N\]|\[Y\/n\]|\(yes\/no\)|Do you want to continue|Are you sure|Proceed\?|Continue\?/gi) || []).length;
          if (confirmCount > interactiveResponses - (sudoHandled ? 1 : 0)) {
            setTimeout(() => {
              entry.shell.write("y\n");
            }, 100);
            interactiveResponses++;
            return;
          }
        }

        // Handle "press enter" prompts
        if (interactivePatterns.pressEnter.test(recentOutput) && interactiveResponses < maxInteractiveResponses) {
          setTimeout(() => {
            entry.shell.write("\n");
          }, 100);
          interactiveResponses++;
          return;
        }

        // Handle dpkg configuration prompts
        if (interactivePatterns.dpkg.test(recentOutput) && interactiveResponses < maxInteractiveResponses) {
          setTimeout(() => {
            entry.shell.write("N\n");
          }, 100);
          interactiveResponses++;
          return;
        }

        // Handle overwrite/replace prompts
        if (interactivePatterns.overwrite.test(recentOutput) && interactiveResponses < maxInteractiveResponses) {
          setTimeout(() => {
            entry.shell.write("y\n");
          }, 100);
          interactiveResponses++;
          return;
        }

        // Handle auth prompts (git username/password, API tokens) — abort and report
        if (interactivePatterns.authPrompt.test(recentOutput) && !resolved) {
          resolved = true;
          // Send Ctrl+C to cancel the hanging command
          entry.shell.write("\x03");
          setTimeout(() => {
            entry.shell.removeListener("data", dataHandler);
            const cleanOutput = stripAnsi(output);
            resolve({
              ok: false,
              code: 1,
              stdout: output,
              cleanStdout: cleanOutput,
              stderr: "",
              error: "Command requires authentication credentials (username/password/token) which cannot be provided automatically. The command was cancelled."
            });
          }, 500);
          return;
        }

        // Check for command completion
        const lines = output.split("\n");
        const lastNonEmpty = [...lines].reverse().find((l) => l.trim()) || "";

        if (hasPrompt(lastNonEmpty)) {
          const afterCommand = output.slice(command.length + 1);
          if (afterCommand.trim().length > 0) {
            resolved = true;

            setTimeout(() => {
              entry.shell.removeListener("data", dataHandler);
              const cleanOutput = stripAnsi(output);
              const isError = detectError(cleanOutput);
              resolve({
                ok: !isError,
                code: isError ? 1 : 0,
                stdout: output,
                cleanStdout: cleanOutput,
                stderr: ""
              });
            }, 200);
          }
        }
      }
    };

    entry.shell.on("data", dataHandler);

    // Write the command to shell
    entry.shell.write(command + "\n");
    commandSent = true;

    // Dynamic timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        entry.shell.removeListener("data", dataHandler);
        resolve({
          ok: false,
          error: "Command timed out after " + Math.round(timeout / 1000) + "s",
          stdout: output,
          cleanStdout: stripAnsi(output),
          stderr: "",
          timedOut: true
        });
      }
    }, timeout);
  });
});

// ========================================
// Silent Command Execution (non-interactive)
// ========================================
ipcMain.handle("ssh-exec-silent", async (_event, { tabId, command }) => {
  const entry = connections.get(tabId);
  if (!entry?.conn) {
    return { ok: false, error: "Not connected" };
  }

  return await new Promise((resolve) => {
    entry.conn.exec(command, (err, stream) => {
      if (err) {
        resolve({ ok: false, error: err.message, stdout: "", stderr: "" });
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (data) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      stream.on("close", (code) => {
        resolve({
          ok: code === 0,
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      setTimeout(() => {
        try { stream.close(); } catch (e) { /* ignore */ }
        resolve({
          ok: false,
          error: "Silent command timed out",
          stdout,
          stderr
        });
      }, 30000);
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

// ========================================
// Parse structured AI JSON response safely
// ========================================
const parseAIJson = (text) => {
  try {
    let jsonText = text.trim();
    // Remove markdown json wrapper if present
    const jsonBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
    }
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
};

// ========================================
// Build environment context string
// ========================================
const buildEnvContext = (envInfo) => {
  if (!envInfo) return "";
  return `
## Target System Environment:
- OS: ${envInfo.os || "Unknown"}
- Distribution: ${envInfo.distro || "Unknown"} (ID: ${envInfo.distroId || "unknown"}, Version: ${envInfo.version || "unknown"})
- Shell: ${envInfo.shell || "Unknown"}
- User: ${envInfo.user || "Unknown"}
- Package Manager: ${envInfo.packageManager || "Unknown"}
- Init System: ${envInfo.initSystem || "Unknown"}
- Architecture: ${envInfo.arch || "Unknown"}
`;
};

// ========================================
// AI: Analyze Request (Super Intelligent)
// Replaces the old ai-get-command with a much smarter system
// ========================================
ipcMain.handle(
  "ai-get-command",
  async (_event, { prompt, logs, chatHistory, envInfo, settings }) => {
    if (!settings?.apiKey) {
      return { ok: false, error: "Missing OpenAI API key" };
    }

    const envSection = buildEnvContext(envInfo);

    const systemPrompt = `You are an expert Linux/Unix system administrator AI embedded in an SSH terminal client. You analyze user requests and respond intelligently.

## YOUR RESPONSE FORMAT
You MUST respond with ONLY a JSON object (no markdown wrapping, no backticks around the JSON). Use one of these response types:

### Type 1: "command" - ONLY for simple, single-purpose operations (ONE short command)
{"type":"command","command":"single short command here","explanation":"brief 1-sentence explanation","risk":"low|medium|high","estimatedTime":"fast|moderate|slow"}
IMPORTANT: "command" type is ONLY for simple operations that need ONE command — e.g. "ls -la", "df -h", "systemctl status nginx", "apt-get update -y". If you need more than one command or the command would be longer than ~150 characters, you MUST use "plan" instead.

### Type 2: "impossible" - When the request CANNOT be fulfilled on this system
{"type":"impossible","reason":"clear explanation of why this is impossible","suggestion":"alternative approach if any exists, or null"}

### Type 3: "plan" - For ANY task requiring multiple commands (THIS IS THE DEFAULT for complex tasks)
{"type":"plan","title":"short title","steps":[{"command":"cmd1","description":"what step 1 does"},{"command":"cmd2","description":"what step 2 does"}],"explanation":"overview"}
Each step.command must be a SINGLE, SHORT, self-contained command. NEVER chain multiple operations with && or ; inside a single step.

### Type 4: "info" - When the user is asking a question that doesn't need a command
{"type":"info","answer":"your informative answer here"}

### Type 5: "clarification" - When you need more information to proceed
{"type":"clarification","question":"what you need to know","options":["option 1","option 2"]}

## ABSOLUTE RULE — COMMAND SIZE LIMIT:
- A single "command" response must be ONE simple command, under ~150 characters.
- NEVER chain multiple operations with && or ; into a single "command" response.
- If the task needs 2+ commands → ALWAYS use "plan" with each command as a separate step.
- If you are tempted to write "cmd1 && cmd2 && cmd3" → STOP and use "plan" instead.
- Software installation, server setup, configuration changes → ALWAYS "plan", NEVER "command".

## PLAN STEP RULES:
- Each step must contain exactly ONE command (no && or ; chaining).
- Each step must be independently executable and verifiable.
- Each step command should be short and focused (one action per step).
- Good step: {"command":"yum -y update","description":"Update system packages"}
- Bad step: {"command":"yum -y update && yum -y install wget curl perl && cd /tmp && wget ...","description":"..."}
- Keep steps granular: install packages in one step, configure in another, restart service in another.

## CRITICAL INTELLIGENCE RULES:

### Feasibility Checks (ALWAYS perform these FIRST):
1. **OS Compatibility**: Before suggesting software installation, verify the software supports the target OS/distro. Examples:
   - CentOS Web Panel (CWP) ONLY works on CentOS/RHEL/AlmaLinux/Rocky Linux — respond "impossible" on Ubuntu/Debian
   - cPanel requires CentOS/AlmaLinux/CloudLinux — respond "impossible" on Ubuntu/Debian
   - apt/dpkg commands on RHEL/CentOS — respond "impossible", suggest yum/dnf
   - yum/dnf commands on Ubuntu/Debian — respond "impossible", suggest apt
2. **Architecture Compatibility**: Check if software supports the target architecture (arm64 vs x86_64)
3. **Permission Level**: Check if the user has sufficient privileges (root vs regular user)
4. **Resource Requirements**: For heavy operations (databases, web servers), consider if the system likely has enough resources
5. **Software Availability**: Don't suggest packages that don't exist in the system's repositories

### When to Use "impossible":
- Software explicitly doesn't support the target OS/distro
- Hardware/architecture mismatch
- Fundamental technical limitation
- The operation would break SSH connectivity with no recovery path

### When to Use "plan" (STRONGLY PREFERRED for any non-trivial task):
- ANY software installation (even a single package: update repos step + install step)
- ANY server setup or configuration
- System hardening / security setup
- Setting up services that require config changes + restarts
- Database migrations or complex backups
- Any task with 2+ distinct operations
- Anything involving download + install + configure

### When to Use "command" (ONLY for truly simple single operations):
- Checking status: df -h, free -m, systemctl status x, ps aux
- Single file operations: cat /etc/hosts, ls -la /var/log
- Simple queries: whoami, uname -a, ip addr
- A single short apt/yum install of one package (still prefer plan)

### When to Use "info":
- User asks "what is...", "how does...", "explain..."
- User asks about system status without needing a command
- User asks for recommendations or comparisons

### When to Use "clarification":
- The request is ambiguous (e.g., "set up a server" — what kind?)
- Multiple valid approaches exist and the choice matters
- Missing critical information (e.g., domain name for SSL setup)

## COMMAND RULES (for both "command" and plan step commands):
1. ALWAYS use non-interactive flags: -y for apt/yum, --noconfirm for pacman, DEBIAN_FRONTEND=noninteractive
2. For config file edits, use sed/awk/tee. NEVER suggest vi/vim/nano/emacs
3. When root privileges are needed, prefix with sudo (WITHOUT the -n flag)
4. **NEVER use "sudo -n"** — the terminal handles sudo password prompts automatically. Using -n causes failures.
5. Prefer modern tools: systemctl over service, ip over ifconfig
${envSection}
## CONTEXT UNDERSTANDING:
- Short follow-up messages (1-5 words) ALWAYS relate to the previous conversation topic
- "again" → repeat the last type of operation
- "undo" or "revert" → reverse the last operation
- "fix" or "solve" → fix the issue from the last output
- "check" or "verify" → verify the result of the last operation
- "yes", "ok", "do it" → execute the previously suggested operation

## SAFETY:
- For operations that could break SSH (iptables, sshd config, network), test before applying
- Prefer atomic operations (mv over cp+rm, sed -i.bak over sed -i)
- risk "high" for: rm -rf, dd, mkfs, fdisk, iptables, sshd restarts, partition changes`;

    const messages = [{ role: "system", content: systemPrompt }];

    if (chatHistory && chatHistory.length > 0) {
      messages.push({
        role: "user",
        content: `CONVERSATION CONTEXT:\n${chatHistory.join("\n")}\n\n---\nRecent terminal state:\n${logs || "(empty)"}\n\n---\nCurrent request: ${prompt}`
      });
    } else {
      messages.push({
        role: "user",
        content: `${logs ? `Recent terminal state:\n${logs}\n\n---\n` : ""}Request: ${prompt}`
      });
    }

    const result = await callOpenAI({
      apiKey: settings.apiKey,
      model: settings.model || "gpt-5.2",
      messages,
      maxRetries: 2
    });

    if (!result.ok) {
      return result;
    }

    // Parse the structured JSON response
    const parsed = parseAIJson(result.text);

    if (parsed && parsed.type) {
      switch (parsed.type) {
        case "command":
          return {
            ok: true,
            responseType: "command",
            command: sanitizeCommand(parsed.command || ""),
            explanation: parsed.explanation || "",
            risk: parsed.risk || "low",
            estimatedTime: parsed.estimatedTime || "fast"
          };

        case "impossible":
          return {
            ok: true,
            responseType: "impossible",
            reason: parsed.reason || "This operation cannot be performed on this system.",
            suggestion: parsed.suggestion || null
          };

        case "plan":
          return {
            ok: true,
            responseType: "plan",
            title: parsed.title || "Execution Plan",
            steps: (parsed.steps || []).map((s) => ({
              command: sanitizeCommand(s.command || ""),
              description: s.description || ""
            })),
            explanation: parsed.explanation || ""
          };

        case "info":
          return {
            ok: true,
            responseType: "info",
            answer: parsed.answer || result.text
          };

        case "clarification":
          return {
            ok: true,
            responseType: "clarification",
            question: parsed.question || "Could you provide more details?",
            options: parsed.options || []
          };

        default:
          // Unknown type, try to use as command
          return {
            ok: true,
            responseType: "command",
            command: sanitizeCommand(result.text),
            explanation: "",
            risk: "low",
            estimatedTime: "fast"
          };
      }
    }

    // Fallback: if JSON parsing failed, treat as a raw command (backward compat)
    const command = sanitizeCommand(result.text);
    if (command) {
      return {
        ok: true,
        responseType: "command",
        command,
        explanation: "",
        risk: "low",
        estimatedTime: "fast"
      };
    }

    return { ok: false, error: "AI returned an unparseable response." };
  }
);

// ========================================
// AI: Smart Fix Command with Root Cause Analysis
// ========================================
ipcMain.handle(
  "ai-fix-command",
  async (_event, { prompt, logs, chatHistory, failedCommands, envInfo, settings }) => {
    if (!settings?.apiKey) {
      return { ok: false, error: "Missing OpenAI API key" };
    }

    const envSection = buildEnvContext(envInfo);

    const failedSection = failedCommands && failedCommands.length > 0
      ? `\nPreviously failed commands (DO NOT repeat these exact commands):\n${failedCommands.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`
      : "";

    const historySection = chatHistory && chatHistory.length > 0
      ? `\nConversation context:\n${chatHistory.slice(-10).join("\n")}`
      : "";

    const systemPrompt = `You are an expert system administrator debugging a failed command on a remote Linux server.

You MUST respond with ONLY a JSON object (no markdown wrapping). Use one of these response types:

### Type 1: "fix" - You have a SINGLE, SHORT corrected command that should work
{"type":"fix","command":"one single short corrected command","explanation":"what was wrong and what this fix does","confidence":"high|medium|low"}
IMPORTANT: The command must be ONE short command (under ~150 chars). Do NOT chain multiple commands with && or ;.

### Type 2: "plan" - The fix requires multiple steps (use this if the original failed because it was too complex)
{"type":"plan","title":"short title","steps":[{"command":"cmd1","description":"what step 1 does"},{"command":"cmd2","description":"what step 2 does"}],"explanation":"overview of what this plan fixes"}
Each step must contain exactly ONE short command. NEVER chain with && or ;.

### Type 3: "abort" - The task is FUNDAMENTALLY IMPOSSIBLE or will never succeed
{"type":"abort","reason":"clear explanation of why this cannot work","rootCause":"category of the problem","suggestion":"alternative approach if any, or null"}

## ROOT CAUSE CATEGORIES for "abort":
- "os_incompatible" — Software doesn't support this OS/distro
- "arch_incompatible" — Software doesn't support this architecture
- "missing_hardware" — Required hardware (GPU, etc.) not available
- "permission_permanent" — Requires access level that can't be granted
- "resource_exhausted" — System lacks resources (disk, memory) that can't be freed
- "network_unreachable" — Required network resource permanently unavailable
- "software_conflict" — Irreconcilable software conflict
- "deprecated" — Software is deprecated/EOL with no replacement path
- "circular_dependency" — The fix creates the same problem it's trying to solve

## CRITICAL RULES:
1. NEVER repeat a command that already failed — try a genuinely DIFFERENT approach
2. If the SAME error keeps occurring across multiple attempts, it's likely a fundamental issue → use "abort"
3. If the error is about OS/distro incompatibility → ALWAYS use "abort" with rootCause "os_incompatible"
4. If you've seen 3+ failures with similar errors → strongly consider "abort"
5. Confidence "low" means you're not sure the fix will work — be honest
6. Always use non-interactive flags (-y, --yes, --noconfirm, DEBIAN_FRONTEND=noninteractive)
7. For config edits, use sed/awk/tee, never interactive editors
8. NEVER use "sudo -n" — the terminal handles sudo password prompts automatically.
9. If the original command was a long chained command (using && or ;), ALWAYS respond with "plan" to break it into individual steps.
10. Each fix command or plan step must be ONE simple, short command. No chaining.

## FIX STRATEGIES (in order of preference):
- Long chained command failed → break into a "plan" with individual steps
- "sudo: a password is required" → remove the -n flag from sudo
- Missing package → install it first
- Permission denied → add sudo, fix permissions
- File not found → create parent dirs, check correct path
- Package not found → update repos, check package name for distro
- Port in use → find and handle the process
- Dpkg lock → wait/kill stuck process
- Syntax error → fix the syntax
- Wrong approach entirely → try a completely different method
${envSection}`;

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Original goal: ${prompt}${historySection}${failedSection}\n\nLatest error output:\n${logs}`
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

    const parsed = parseAIJson(result.text);

    if (parsed) {
      if (parsed.type === "abort") {
        return {
          ok: true,
          responseType: "abort",
          reason: parsed.reason || "This task cannot be completed.",
          rootCause: parsed.rootCause || "unknown",
          suggestion: parsed.suggestion || null
        };
      }

      if (parsed.type === "fix") {
        const command = sanitizeCommand(parsed.command || "");
        return {
          ok: true,
          responseType: "fix",
          command,
          explanation: parsed.explanation || "",
          confidence: parsed.confidence || "medium"
        };
      }

      if (parsed.type === "plan") {
        return {
          ok: true,
          responseType: "plan",
          title: parsed.title || "Fix Plan",
          steps: (parsed.steps || []).map((s) => ({
            command: sanitizeCommand(s.command || ""),
            description: s.description || ""
          })),
          explanation: parsed.explanation || ""
        };
      }
    }

    // Fallback: treat as raw command
    const command = sanitizeCommand(result.text);
    if (command) {
      return {
        ok: true,
        responseType: "fix",
        command,
        explanation: "",
        confidence: "low"
      };
    }

    return { ok: false, error: "AI could not generate a fix." };
  }
);

// ========================================
// AI Output Interpretation - With Success Detection
// ========================================
ipcMain.handle(
  "ai-interpret-output",
  async (_event, { prompt, command, output, chatHistory, envInfo, settings }) => {
    if (!settings?.apiKey) {
      return { ok: false, error: "Missing OpenAI API key" };
    }

    let contextInfo = "";
    if (chatHistory && chatHistory.length > 0) {
      contextInfo = `Previous conversation:\n${chatHistory.slice(-10).join("\n")}\n\n`;
    }

    // Clean and potentially truncate output
    const cleanOutput = stripAnsi(output);
    let processedOutput = cleanOutput;
    if (cleanOutput.length > 8000) {
      const head = cleanOutput.slice(0, 3000);
      const tail = cleanOutput.slice(-3000);
      processedOutput = `${head}\n\n... [${cleanOutput.length - 6000} characters truncated] ...\n\n${tail}`;
    }

    const systemPrompt = `You are an expert system administrator AI assistant. You analyze command outputs and provide clear, actionable interpretations.

You MUST respond in this exact JSON format (no markdown wrapping, just raw JSON):
{
  "success": true or false,
  "answer": "your human-friendly interpretation here",
  "permanentFailure": true or false,
  "failureCategory": "string or null"
}

RULES FOR "success" field:
- true: The command achieved its intended goal
- false: The command failed to achieve its goal

RULES FOR "permanentFailure" field (ONLY when success is false):
- true: This failure is PERMANENT and cannot be fixed by retrying or changing commands
  Examples: wrong OS for software, hardware missing, unsupported architecture, deprecated software
- false: This failure might be fixable with a different command or approach
  Examples: package not found (might just need different name), permission denied (can add sudo), syntax error (can fix)

RULES FOR "failureCategory" (ONLY when permanentFailure is true):
- "os_incompatible" — Software requires a different OS/distro
- "arch_incompatible" — Wrong CPU architecture
- "missing_hardware" — Required hardware not available
- "unsupported" — Operation fundamentally not supported
- null — When not a permanent failure

RULES FOR "answer" field:
- Be concise but thorough. Use **bold** for important values.
- If the output contains data (disk space, memory, processes), summarize key points with numbers.
- If the command modified something, confirm what was changed.
- For errors: explain what went wrong and whether it's fixable.
- Use bullet points (- item) for lists.
- Format code/paths/values with backtick markers.
- Do NOT repeat the raw output unless a small excerpt is essential.
- Keep answers focused: 2-6 sentences for simple operations, more for complex output.`;

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${contextInfo}User's question: ${prompt}\n\nCommand executed: ${command}\n\nCommand output:\n${processedOutput}`
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

    const parsed = parseAIJson(result.text);

    if (parsed) {
      return {
        ok: true,
        answer: parsed.answer || result.text,
        commandSucceeded: parsed.success !== false,
        permanentFailure: parsed.permanentFailure === true,
        failureCategory: parsed.failureCategory || null
      };
    }

    // Fallback
    const isFailure = /^(?:FAILED|ERROR|The command failed)/i.test(result.text);
    return {
      ok: true,
      answer: result.text,
      commandSucceeded: !isFailure,
      permanentFailure: false,
      failureCategory: null
    };
  }
);

// ========================================
// AI Session Title Generation
// ========================================
ipcMain.handle(
  "ai-generate-title",
  async (_event, { prompt, settings }) => {
    if (!settings?.apiKey) {
      return { ok: false, error: "Missing API key" };
    }

    const messages = [
      {
        role: "system",
        content: "Generate a short, descriptive title (3-6 words max) for a chat session based on the user's first message. The chat is about server management via SSH. Respond with ONLY the title text, nothing else. No quotes, no punctuation at the end, no prefixes. Examples: Install Nginx Web Server, Check Disk Usage, Configure SSH Security, Deploy Node App, Database Backup Setup"
      },
      {
        role: "user",
        content: prompt
      }
    ];

    const result = await callOpenAI({
      apiKey: settings.apiKey,
      model: settings.model || "gpt-5.2",
      messages,
      maxRetries: 1
    });

    if (!result.ok) {
      return result;
    }

    let title = result.text.trim().replace(/^["']|["']$/g, "").replace(/\.$/, "");
    if (title.length > 40) {
      title = title.slice(0, 40).trim();
    }

    return { ok: true, title };
  }
);
