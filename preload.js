const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  newTab: () => ipcRenderer.send("new-tab"),
  switchTab: (i) => ipcRenderer.send("switch-tab", i),
  closeTab: (i) => ipcRenderer.send("close-tab", i),
  goBack: () => ipcRenderer.send("go-back"),
  goForward: () => ipcRenderer.send("go-forward"),
  navigate: (url) => ipcRenderer.send("navigate", url),
  onTabsUpdated: (cb) =>
    ipcRenderer.on("tabs-updated", (_, data) => cb(data))
});