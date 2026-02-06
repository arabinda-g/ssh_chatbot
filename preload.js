const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  sshConnect: (payload) => ipcRenderer.invoke("ssh-connect", payload),
  sshDisconnect: (payload) => ipcRenderer.invoke("ssh-disconnect", payload),
  sshWrite: (payload) => ipcRenderer.invoke("ssh-write", payload),
  sshExec: (payload) => ipcRenderer.invoke("ssh-exec", payload),
  sshExecSilent: (payload) => ipcRenderer.invoke("ssh-exec-silent", payload),
  aiGetCommand: (payload) => ipcRenderer.invoke("ai-get-command", payload),
  aiFixCommand: (payload) => ipcRenderer.invoke("ai-fix-command", payload),
  aiInterpretOutput: (payload) => ipcRenderer.invoke("ai-interpret-output", payload),
  onSshData: (handler) => ipcRenderer.on("ssh-data", (_e, data) => handler(data)),
  onSshError: (handler) =>
    ipcRenderer.on("ssh-error", (_e, data) => handler(data)),
  onSshStatus: (handler) =>
    ipcRenderer.on("ssh-status", (_e, data) => handler(data))
});
