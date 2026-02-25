// renderer.js
const { ipcRenderer } = require('electron');

const TAB_CLASS = 'tab';
const TAB_ACTIVE_CLASS = 'tab--active';

let tabsState = {
  tabs: [],
  activeTabId: null,
};

let navState = {
  url: '',
  canGoBack: false,
  canGoForward: false,
  searchEngine: 'duckduckgo',
};

let currentTheme = 'altay';

function $(selector) {
  return document.querySelector(selector);
}

function createTabElement(tab, isActive, totalTabs) {
  const el = document.createElement('div');
  el.classList.add(TAB_CLASS);
  if (isActive) {
    el.classList.add(TAB_ACTIVE_CLASS);
  }
  el.dataset.tabId = String(tab.id);

  const icon = document.createElement('span');
  icon.classList.add('icon');
  icon.textContent = '📄';

  const title = document.createElement('span');
  title.classList.add('title');
  title.textContent = tab.title;

  const canClose = totalTabs > 1;
  const close = document.createElement('span');
  close.classList.add('close');
  close.textContent = '✕';
  if (!canClose) {
    close.classList.add('close--disabled'); // style in CSS (e.g. opacity: 0; pointer-events: none)
  }

  // Activate tab when clicking anywhere except the close button
  el.addEventListener('click', (event) => {
    if (event.target === close) return;
    ipcRenderer.send('tabs:activate', tab.id);
  });

  // Close button
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!canClose) return;
    ipcRenderer.send('tabs:close', tab.id);
  });

  el.appendChild(icon);
  el.appendChild(title);
  el.appendChild(close);

  return el;
}

function renderTabs() {
  const tabsContainer = $('#tabs');
  if (!tabsContainer) return;

  tabsContainer.innerHTML = '';

  const { tabs, activeTabId } = tabsState;
  const totalTabs = tabs.length;

  tabs.forEach((tab) => {
    const isActive = tab.id === activeTabId;
    const tabEl = createTabElement(tab, isActive, totalTabs);
    tabsContainer.appendChild(tabEl);
  });
}

function setupDomEvents() {
  const addTabButton = $('#add-tab');
  if (addTabButton) {
    addTabButton.addEventListener('click', () => {
      ipcRenderer.send('tabs:create');
    });
  }

  const sidebar = $('#sidebar');
  if (sidebar) {
    sidebar.addEventListener('mouseenter', () => {
      ipcRenderer.send('ui:sidebar-expanded', true);
    });
    sidebar.addEventListener('mouseleave', () => {
      ipcRenderer.send('ui:sidebar-expanded', false);
    });
  }

  const urlInput = $('#url-input');
  if (urlInput) {
    urlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        ipcRenderer.send('nav:go', urlInput.value);
        urlInput.blur();
      }
    });

    urlInput.addEventListener('focus', () => {
      ipcRenderer.send('ui:url-focused', true);
    });

    urlInput.addEventListener('blur', () => {
      ipcRenderer.send('ui:url-focused', false);
    });
  }

  const btnBack = $('#btn-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      if (btnBack.disabled) return;
      ipcRenderer.send('nav:back');
    });
  }

  const btnForward = $('#btn-forward');
  if (btnForward) {
    btnForward.addEventListener('click', () => {
      if (btnForward.disabled) return;
      ipcRenderer.send('nav:forward');
    });
  }

  const btnSettings = $('#btn-settings');
  const settingsMenu = $('#settings-menu');
  if (btnSettings && settingsMenu) {
    btnSettings.addEventListener('click', () => {
      const willOpen = settingsMenu.classList.contains('hidden');
      settingsMenu.classList.toggle('hidden');
      ipcRenderer.send('ui:settings-open', willOpen);
    });

    document.addEventListener('click', (event) => {
      if (!settingsMenu.classList.contains('hidden')) {
        if (!settingsMenu.contains(event.target) && event.target !== btnSettings) {
          settingsMenu.classList.add('hidden');
          ipcRenderer.send('ui:settings-open', false);
        }
      }
    });

    settingsMenu.querySelectorAll('.settings-option').forEach((el) => {
      el.addEventListener('click', () => {
        const engine = el.getAttribute('data-engine');
        if (!engine) return;
        ipcRenderer.send('settings:set-search-engine', engine);
        settingsMenu.classList.add('hidden');
        ipcRenderer.send('ui:settings-open', false);
      });
    });

    settingsMenu.querySelectorAll('.settings-theme-option').forEach((el) => {
      el.addEventListener('click', () => {
        const theme = el.getAttribute('data-theme');
        if (!theme) return;
        currentTheme = theme;
        document.body.setAttribute('data-theme', theme);
        settingsMenu.classList.add('hidden');
        ipcRenderer.send('ui:settings-open', false);

        settingsMenu.querySelectorAll('.settings-theme-option').forEach((btn) => {
          const btnTheme = btn.getAttribute('data-theme');
          if (btnTheme === theme) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      });
    });

    const wallpaperToggle = $('#settings-wallpaper-toggle');
    if (wallpaperToggle) {
      wallpaperToggle.addEventListener('click', () => {
        const current = document.body.getAttribute('data-wallpaper') === 'on';
        const next = !current;
        if (next) {
          document.body.setAttribute('data-wallpaper', 'on');
        } else {
          document.body.removeAttribute('data-wallpaper');
        }
        settingsMenu.classList.add('hidden');
        ipcRenderer.send('ui:settings-open', false);
      });
    }

    const historyClear = $('#history-clear');
    if (historyClear) {
      historyClear.addEventListener('click', () => {
        ipcRenderer.send('history:clear');
      });
    }
  }
}

function setupIpcListeners() {
  ipcRenderer.on('tabs:state', (event, payload) => {
    tabsState = {
      tabs: payload.tabs,
      activeTabId: payload.activeTabId,
    };
    renderTabs();
  });

  ipcRenderer.on('nav:state', (event, payload) => {
    navState = payload;

    const urlInput = $('#url-input');
    if (urlInput && document.activeElement !== urlInput) {
      urlInput.value = payload.url || '';
    }

    const btnBack = $('#btn-back');
    const btnForward = $('#btn-forward');
    if (btnBack) btnBack.disabled = !payload.canGoBack;
    if (btnForward) btnForward.disabled = !payload.canGoForward;

    const settingsMenu = $('#settings-menu');
    if (settingsMenu) {
      settingsMenu.querySelectorAll('.settings-option').forEach((el) => {
        const engine = el.getAttribute('data-engine');
        if (!engine) return;
        if (engine === payload.searchEngine) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
    }
  });

  ipcRenderer.on('history:state', (event, items) => {
    const listEl = $('#history-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    items
      .slice()
      .reverse()
      .forEach((item) => {
        const btn = document.createElement('button');
        btn.className = 'history-item';
        btn.textContent = item.title || item.url;
        btn.title = item.url;
        btn.addEventListener('click', () => {
          ipcRenderer.send('history:open', item.url);
        });
        listEl.appendChild(btn);
      });
  });

  // Request initial state once the renderer is ready
  ipcRenderer.send('tabs:request-state');
  ipcRenderer.send('history:request');
}

window.addEventListener('DOMContentLoaded', () => {
  setupDomEvents();
  setupIpcListeners();
  ipcRenderer.send('ui:ready');
});