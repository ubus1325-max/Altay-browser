// main.js
const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const SIDEBAR_COLLAPSED_WIDTH = 60; // px (CSS default)
const SIDEBAR_EXPANDED_WIDTH = 200; // px (CSS :hover)
const TOPBAR_HEIGHT = 44; // px (URL bar + controls)
const START_URL = pathToFileURL(path.join(__dirname, 'home.html')).toString();

/** @type {BrowserWindow | null} */
let mainWindow = null;

/**
 * Single source of truth for tabs.
 * Each tab: { id: number, title: string, view: BrowserView }
 */
let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let sidebarWidth = SIDEBAR_COLLAPSED_WIDTH;
let hasInitialTab = false;
let browserViewSuspended = false;

const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
};

let currentSearchEngine = 'duckduckgo';
let history = []; // simple in-memory history

// ---------- Window & Layout helpers ----------

function getContentAreaBounds(win) {
  // Use *content* size, not full window size, to avoid frame offsets
  const { width, height } = win.getContentBounds();
  return {
    x: sidebarWidth,
    y: TOPBAR_HEIGHT,
    width: Math.max(0, width - sidebarWidth),
    height: Math.max(0, height - TOPBAR_HEIGHT),
  };
}

function sendNavState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const active = getActiveTab();
  if (!active) {
    mainWindow.webContents.send('nav:state', {
      url: '',
      canGoBack: false,
      canGoForward: false,
      searchEngine: currentSearchEngine,
    });
    return;
  }

  const wc = active.view.webContents;
  mainWindow.webContents.send('nav:state', {
    url: wc.getURL() === START_URL ? '' : wc.getURL(),
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    searchEngine: currentSearchEngine,
  });
}

function sendHistoryState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('history:state', history);
}

function recordHistory(wc) {
  const url = wc.getURL();
  if (!url || url === START_URL) return;
  const title = wc.getTitle();
  const ts = Date.now();
  if (history.length && history[history.length - 1].url === url) return;
  history.push({ url, title, ts });
  if (history.length > 100) history.shift();
  sendHistoryState();
}

function applyViewBoundsForWindow(view) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = getContentAreaBounds(mainWindow);
  view.setBounds(bounds);

  // Auto-resize width/height with window; keep x/y fixed
  view.setAutoResize({
    width: true,
    height: true,
  });
}

function attachActiveView() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const active = getActiveTab();
  if (!active || browserViewSuspended) return;
  mainWindow.setBrowserView(active.view);
  applyViewBoundsForWindow(active.view);
}

// ---------- Tab core logic (single source of truth) ----------

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

function broadcastTabsState(targetWebContents) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const payload = {
    tabs: tabs.map((t) => ({
      id: t.id,
      title: t.title,
    })),
    activeTabId,
  };

  const wc = targetWebContents || mainWindow.webContents;
  wc.send('tabs:state', payload);
}

function setActiveTab(tabId) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (tabId === activeTabId) return;

  const nextTab = tabs.find((t) => t.id === tabId);
  if (!nextTab) return;

  const currentTab = getActiveTab();

  // Ensure only one BrowserView is attached at any time
  if (currentTab) {
    mainWindow.setBrowserView(null);
  }

  if (!browserViewSuspended) {
    mainWindow.setBrowserView(nextTab.view);
    applyViewBoundsForWindow(nextTab.view);
  }

  activeTabId = nextTab.id;
  sendNavState();
}

function createTab() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const id = nextTabId++;
  const view = new BrowserView({
    webPreferences: {
      // Keep the page sandboxed; adjust if you need Node in views.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  view.webContents.loadURL(START_URL);
  applyViewBoundsForWindow(view);

  const tab = {
    id,
    title: `Tab ${id}`,
    view,
  };

  tabs.push(tab);
  setActiveTab(id);
  broadcastTabsState();

  const wc = view.webContents;
  const navEvents = ['did-navigate', 'did-navigate-in-page', 'did-finish-load'];
  navEvents.forEach((ev) => {
    wc.on(ev, () => {
      if (activeTabId === id) {
        sendNavState();
        recordHistory(wc);
      }
    });
  });
}

function closeTab(tabId) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (tabs.length <= 1) {
    // Never close the last remaining tab
    return;
  }

  const index = tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return;

  const [tab] = tabs.splice(index, 1);

  if (tab.id === activeTabId) {
    // Detach and destroy the active view
    mainWindow.setBrowserView(null);
    activeTabId = null;
    if (tab.view && tab.view.webContents) {
      tab.view.webContents.destroy();
    }

    if (tabs.length > 0) {
      // Prefer previous tab; otherwise next
      const newIndex = index > 0 ? index - 1 : 0;
      setActiveTab(tabs[newIndex].id);
    }
  } else {
    // Closing a background tab
    if (tab.view && tab.view.webContents) {
      tab.view.webContents.destroy();
    }
  }

  broadcastTabsState();
}

// ---------- Window lifecycle ----------

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'ALTAY',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // optional; if not used, remove
      nodeIntegration: true, // for simple renderer IPC usage
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    // Cleanup all BrowserViews on window close
    tabs.forEach((t) => {
      try {
        if (t.view && t.view.webContents) {
          t.view.webContents.destroy();
        }
      } catch {
        // ignore
      }
    });
    tabs = [];
    activeTabId = null;
    hasInitialTab = false;
    mainWindow = null;
  });

  mainWindow.on('resize', () => {
    const active = getActiveTab();
    if (active) {
      applyViewBoundsForWindow(active.view);
    }
  });
}

// ---------- IPC wiring ----------

function setupIpc() {
  ipcMain.on('tabs:create', () => {
    createTab();
  });

  ipcMain.on('tabs:close', (event, tabId) => {
    closeTab(tabId);
  });

  ipcMain.on('tabs:activate', (event, tabId) => {
    setActiveTab(tabId);
    broadcastTabsState();
  });

  ipcMain.on('tabs:request-state', (event) => {
    broadcastTabsState(event.sender);
  });

  ipcMain.on('ui:sidebar-expanded', (event, expanded) => {
    sidebarWidth = expanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
    const active = getActiveTab();
    if (active) {
      applyViewBoundsForWindow(active.view);
    }
  });

  ipcMain.on('ui:settings-open', (event, open) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (open) {
      browserViewSuspended = true;
      mainWindow.setBrowserView(null);
    } else {
      browserViewSuspended = false;
      attachActiveView();
    }
  });

  ipcMain.on('ui:url-focused', (event, focused) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (focused) {
      browserViewSuspended = true;
      mainWindow.setBrowserView(null);
    } else {
      browserViewSuspended = false;
      attachActiveView();
    }
  });

  ipcMain.on('nav:go', (event, input) => {
    const active = getActiveTab();
    if (!active) return;
    const text = String(input || '').trim();
    if (!text) return;

    function buildSearchUrl(query) {
      const base = SEARCH_ENGINES[currentSearchEngine] || SEARCH_ENGINES.duckduckgo;
      return base + encodeURIComponent(query);
    }

    let url = text;
    const looksLikeUrl = /^https?:\/\//i.test(text) || (text.includes('.') && !text.includes(' '));

    if (!looksLikeUrl) {
      url = buildSearchUrl(text);
    } else if (!/^https?:\/\//i.test(text)) {
      url = `https://${text}`;
    }

    active.view.webContents.loadURL(url);
  });

  ipcMain.on('nav:back', () => {
    const active = getActiveTab();
    if (!active) return;
    const wc = active.view.webContents;
    if (wc.canGoBack()) wc.goBack();
  });

  ipcMain.on('nav:forward', () => {
    const active = getActiveTab();
    if (!active) return;
    const wc = active.view.webContents;
    if (wc.canGoForward()) wc.goForward();
  });

  ipcMain.on('settings:set-search-engine', (event, key) => {
    if (!Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, key)) return;
    currentSearchEngine = key;
    sendNavState();
  });

  ipcMain.on('ui:ready', () => {
    if (!hasInitialTab) {
      hasInitialTab = true;
      createTab();
    }
  });

  ipcMain.on('history:request', (event) => {
    event.sender.send('history:state', history);
  });

  ipcMain.on('history:open', (event, url) => {
    const active = getActiveTab();
    if (!active || !url) return;
    active.view.webContents.loadURL(url);
  });

  ipcMain.on('history:clear', () => {
    history = [];
    sendHistoryState();
  });
}

// ---------- App lifecycle ----------

app.whenReady().then(() => {
  setupIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On non-macOS, quit when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});