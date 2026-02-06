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

  // Remove any trailing explanation after the command (look for sentence-like patterns after the command)
  // Only if there's a clear separator
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
    const maxInteractiveResponses = 5; // Prevent infinite loops

    // Dynamic timeout based on command type
    const timeout = getCommandTimeout(command);

    // Extended prompt patterns for various shells and configurations
    const promptPatterns = [
      /\[.*@.*\][#$%>]\s*$/m,                    // [user@host]# or [user@host]$
      /\S+@\S+[:~][^\n]*[#$%>]\s*$/m,            // user@host:~$ (flexible path)
      /^[^@\n]+@[^:]+:[^$#]*[#$]\s*$/m,          // user@host:/path$
      /^root@[^\s]+[:#][^\n]*[#$]\s*$/m,          // root@hostname:#
      /^\w+@\w+[:\s~]*[$#%>]\s*$/m,              // simple user@host$
      /^(?:bash|sh|zsh)-[\d.]+[#$%>]\s*$/m,      // bash-5.1$
      /^\([\w-]+\)\s*\S+@\S+/m,                  // (venv) user@host
      /^➜\s/m,                                    // oh-my-zsh arrow prompt
      /^\S+\s*[❯›▶]\s*$/m,                       // fancy prompts
      /^localhost[:#~][^\n]*[#$]\s*$/m,           // localhost:#
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
    };

    // Smart error detection - context-aware, not naive substring matching
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
        if (/^E: (?!0\b)/.test(t)) errorScore += 3; // apt errors (not E: 0)
        if (/^error\[/.test(t)) errorScore += 2; // rust/compiler style errors
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
        if (/^Setting up /i.test(t)) successScore += 1; // apt install progress
        if (/^Processing triggers/i.test(t)) successScore += 1;
        if (/is already the newest version/i.test(t)) successScore += 1;
        if (/^0 upgraded, 0 newly installed/i.test(t)) successScore += 1;
        if (/^\d+ upgraded, \d+ newly installed/i.test(t)) successScore += 2;

        // Noise - things that look like errors but aren't
        if (/^(?:failed|error)\w*\s*[:=]\s*0\b/i.test(t)) successScore += 1;
        if (/warning:/i.test(t)) { /* warnings are not errors */ }
      }

      // If success signals dominate, it's not an error
      if (successScore > errorScore) return false;
      return errorScore >= 2; // Require strong evidence of error
    };

    const dataHandler = (data) => {
      const text = data.toString();
      output += text;

      if (commandSent && !resolved) {
        const recentOutput = output.slice(-500); // Check recent output for interactive prompts

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

        // Handle confirmation prompts (y/n, yes/no, etc.)
        if (interactivePatterns.confirm.test(recentOutput) && interactiveResponses < maxInteractiveResponses) {
          // Check if this is a new prompt (not one we already responded to)
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

        // Handle dpkg configuration prompts (keep existing config)
        if (interactivePatterns.dpkg.test(recentOutput) && interactiveResponses < maxInteractiveResponses) {
          setTimeout(() => {
            entry.shell.write("N\n"); // Keep local version by default
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

        // Check for command completion (prompt reappeared)
        const lines = output.split("\n");
        const lastNonEmpty = [...lines].reverse().find((l) => l.trim()) || "";

        if (hasPrompt(lastNonEmpty)) {
          // Make sure we're not detecting the initial prompt before command output
          // Wait for at least some output after the command was sent
          const afterCommand = output.slice(command.length + 1);
          if (afterCommand.trim().length > 0) {
            resolved = true;

            // Give a delay to ensure everything is flushed
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
// Silent Command Execution (non-interactive, for background tasks)
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

      // Timeout for silent exec
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
// AI Command Generation - Super Intelligent Prompt
// ========================================
ipcMain.handle(
  "ai-get-command",
  async (_event, { prompt, logs, chatHistory, envInfo, settings }) => {
    if (!settings?.apiKey) {
      return { ok: false, error: "Missing OpenAI API key" };
    }

    const envSection = envInfo
      ? `\n## Target System:\n- OS: ${envInfo.os || "Unknown"}\n- Distro: ${envInfo.distro || "Unknown"}\n- Shell: ${envInfo.shell || "Unknown"}\n- User: ${envInfo.user || "Unknown"}\n- Package Manager: ${envInfo.packageManager || "Unknown"}\n- Init System: ${envInfo.initSystem || "Unknown"}\n- Architecture: ${envInfo.arch || "Unknown"}\n`
      : "";

    const systemPrompt = `You are an expert Linux/Unix system administrator AI embedded in an SSH terminal client. You generate precise, production-ready shell commands to accomplish the user's request on their remote server.

## ABSOLUTE RULES (never break these):
1. Respond with ONLY the raw shell command(s). NOTHING else. No explanations, no markdown, no code blocks, no backtick wrapping, no comments, no "here's the command" preamble.
2. If multiple sequential commands are needed, chain them with && (stop on failure) or ; (continue regardless).
3. ALWAYS use non-interactive flags to prevent the command from hanging:
   - apt/apt-get: use -y (e.g., apt-get install -y nginx)
   - yum/dnf: use -y
   - pacman: use --noconfirm
   - pip: use --yes or skip confirmation
   - npm: use --yes
   - rm: use -f when appropriate
   - cp/mv: use -f when appropriate  
   - For dpkg: use DEBIAN_FRONTEND=noninteractive
   - General: always prefer non-interactive mode
4. For config file modifications, use sed, awk, or tee. NEVER use interactive editors (vi, vim, nano, emacs, joe).
5. After modifying service configs, ALWAYS include the service reload/restart command (e.g., systemctl restart nginx).
6. When root privileges are needed, prefix with sudo.
7. Prefer modern tools: systemctl over service, ip over ifconfig, ss over netstat, journalctl over /var/log.
8. For file viewing, prefer cat, head, tail, less, or specific tools. For searching, use grep, find, or locate.
9. Commands should produce clean, parseable output when possible.
10. When installing software, always update package lists first if needed (apt-get update && apt-get install -y ...).

## INTELLIGENT BEHAVIORS:
- For service management: check status, start/stop/restart, enable/disable on boot
- For user management: useradd, usermod, passwd, groups, sudoers
- For firewall: use ufw (Ubuntu/Debian) or firewalld (RHEL/CentOS) based on distro
- For SSL/TLS: use certbot when available, openssl for manual operations
- For Docker: use docker compose (v2) over docker-compose, handle common operations
- For databases: MySQL/MariaDB/PostgreSQL CLI operations, backups, restores
- For web servers: nginx/apache config testing, virtual hosts, SSL setup
- For monitoring: disk space, memory, CPU, processes, logs, network connections
- For networking: DNS, IP config, routing, port checking, firewall rules
- For file permissions: chmod, chown, ACLs
- For cron jobs: crontab management, systemd timers
- For logs: journalctl, log rotation, log searching
- For backups: tar, rsync, pg_dump, mysqldump
- For security: SSH hardening, fail2ban, password policies, audit logs

## CONTEXT UNDERSTANDING:
- Short follow-up messages (1-5 words) ALWAYS relate to the previous conversation topic.
- "in root" after disk space → df for root mount, NOT cd /
- "for nginx" after config → show nginx configuration
- "again" → repeat the last type of operation
- "undo" or "revert" → reverse the last operation
- "it" or "that" → the subject of the previous exchange
- "more" or "details" → more detail on the same topic
- "all" → broader scope of the same topic
- Numbers or sizes → parameters for the previous topic
- "yes", "ok", "do it" → execute the previously suggested operation
- "check" or "verify" → verify the result of the last operation
- "fix" or "solve" → fix the issue from the last output
${envSection}
## SAFETY:
- For potentially destructive operations (rm -rf, dd, mkfs, fdisk), ensure precise targeting.
- For operations that could break SSH connectivity (iptables, sshd config, network config), test before applying when possible.
- When restarting SSH, use: sudo systemctl restart sshd || sudo systemctl restart ssh (handle both service names).
- Prefer atomic operations when possible (mv over cp+rm, sed -i.bak over sed -i for config changes).`;

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

    // Sanitize the AI response to extract clean command
    const command = sanitizeCommand(result.text);
    return { ok: true, command };
  }
);

// ========================================
// AI Command Fixing - With Rich Context
// ========================================
ipcMain.handle(
  "ai-fix-command",
  async (_event, { prompt, logs, chatHistory, failedCommands, envInfo, settings }) => {
    if (!settings?.apiKey) {
      return { ok: false, error: "Missing OpenAI API key" };
    }

    const envSection = envInfo
      ? `\nTarget system: ${envInfo.distro || envInfo.os || "Linux"} (${envInfo.arch || "unknown arch"}), shell: ${envInfo.shell || "bash"}, user: ${envInfo.user || "unknown"}, pkg: ${envInfo.packageManager || "unknown"}`
      : "";

    const failedSection = failedCommands && failedCommands.length > 0
      ? `\nPreviously failed commands (DO NOT repeat these):\n${failedCommands.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`
      : "";

    const historySection = chatHistory && chatHistory.length > 0
      ? `\nConversation context:\n${chatHistory.slice(-8).join("\n")}`
      : "";

    const systemPrompt = `You are an expert system administrator debugging a failed command on a remote Linux server. Analyze the error and provide a corrected command.

RULES:
1. Respond with ONLY the corrected command. No explanations, no markdown, no backticks.
2. NEVER repeat a command that already failed - try a genuinely different approach.
3. Always use non-interactive flags (-y, --yes, --noconfirm, DEBIAN_FRONTEND=noninteractive).
4. For config edits, use sed/awk/tee. Never suggest interactive editors.
5. If multiple steps are needed, chain with && or ;.

COMMON FIX STRATEGIES:
- "command not found" → Install the package first (apt-get update && apt-get install -y <pkg>), or use the correct binary name/path
- "permission denied" → Add sudo, or fix file permissions first
- "No such file or directory" → Create parent directories first (mkdir -p), or check the correct path
- "E: Unable to locate package" → Run apt-get update first, check package name for the distro
- "port already in use" → Find (lsof -i :<port>) and kill the process, or use a different port
- "dpkg lock" → Wait and retry, or kill stuck apt process: sudo kill $(sudo lsof /var/lib/dpkg/lock-frontend 2>/dev/null | awk 'NR>1{print $2}') 2>/dev/null; sudo dpkg --configure -a &&
- "Connection refused" → Check if service is running, check firewall, check correct port
- "Authentication failed" → Check credentials, check service config
- "Disk full" → Clear space first (apt-get clean, remove old logs, etc.)
- "Syntax error" → Fix the command syntax
- Already tried with sudo but still fails → Check if command exists, try alternative approach${envSection}`;

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Goal: ${prompt}${historySection}${failedSection}\n\nLatest error output:\n${logs}`
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

    const command = sanitizeCommand(result.text);
    return { ok: true, command };
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

    // Clean the output for AI processing
    const cleanOutput = stripAnsi(output);
    // Truncate very long outputs but keep beginning and end
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
  "answer": "your human-friendly interpretation here"
}

RULES FOR "success" field:
- true: The command achieved its intended goal (installed software, changed config, showed info, etc.)
- false: The command failed to achieve its goal (error occurred, permission denied, package not found, etc.)
- If the command was informational (ls, cat, df, etc.) and produced output, it's SUCCESS.
- If the output contains errors but also shows the operation completed, it's SUCCESS.
- If the output shows warnings but no errors, it's SUCCESS.
- "No such file", "command not found", "permission denied", "failed", segfaults → FAILED
- Empty output for commands that should produce output → context-dependent (some commands like cp, mv, chmod produce no output on success)

RULES FOR "answer" field:
- Be concise but thorough. Use **bold** for important values and metrics.
- If the output contains data (disk space, memory, processes), summarize the key points with actual numbers.
- If the command modified something, confirm what was changed.
- If there are warnings or notable findings, mention them.
- If the output suggests follow-up actions are needed, mention them briefly.
- For config changes: confirm the change was applied and if the service was restarted.
- For installations: confirm what was installed and the version if shown.
- For errors: explain what went wrong and suggest what to try.
- Use bullet points (- item) for lists of items.
- Format code/paths/values with backtick markers.
- Do NOT repeat the raw output unless a small excerpt is essential for clarity.
- Do NOT include the command itself in your answer.
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

    // Parse JSON response from AI
    try {
      // Try to extract JSON from the response (handle cases where AI wraps in markdown)
      let jsonText = result.text.trim();
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
      const parsed = JSON.parse(jsonText);
      return {
        ok: true,
        answer: parsed.answer || result.text,
        commandSucceeded: parsed.success !== false
      };
    } catch {
      // If JSON parsing fails, treat the response as a plain text answer
      // Try to detect success/failure from the text
      const isFailure = /^(?:FAILED|ERROR|The command failed)/i.test(result.text);
      return {
        ok: true,
        answer: result.text,
        commandSucceeded: !isFailure
      };
    }
  }
);
