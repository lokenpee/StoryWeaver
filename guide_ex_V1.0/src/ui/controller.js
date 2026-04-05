import { poolService } from '../services/poolService.js';
import { contextService } from '../services/contextService.js';
import { renderPoolList, renderDeletedLogs, renderAnchorLogs } from './render.js';
import { getApiSettings, saveApiSettings } from '../services/apiSettingsService.js';
import { addAnchorLog, getAnchorLogs, subscribeAnchorLogs } from '../services/runtimeLogService.js';
import {
  getAvailableWorldBooks,
  getBookEntries,
  isEntrySelected,
  loadWorldbookSourceConfig,
  saveWorldbookSourceConfig,
} from '../services/worldbookSourceService.js';

const refs = {
  wrapper: null,
  drawerToggle: null,
  toolbarIcon: null,
  contentPanel: null,
  tabButtons: [],
  tabPanels: [],
  enabled: null,
  preference: null,
  aiRules: null,
  storyOutline: null,
  wbSourceAuto: null,
  wbSourceManual: null,
  wbManualPanel: null,
  wbBooksSearch: null,
  wbBooksList: null,
  wbEntriesSearch: null,
  wbEntriesList: null,
  wbEntriesCount: null,
  list: null,
  empty: null,
  chatHint: null,
  logs: null,
  apiProvider: null,
  apiUrl: null,
  apiKey: null,
  modelName: null,
  modelOptions: null,
  modelFetchStatus: null,
  anchorLogs: null,
};

let modelFetchTimer = null;

function resolveRefs() {
  refs.wrapper = document.getElementById('revt-wrapper');
  refs.drawerToggle = refs.wrapper?.querySelector('.drawer-toggle') || null;
  refs.toolbarIcon = document.getElementById('revt-toolbar-icon');
  refs.contentPanel = document.getElementById('revt-content-panel');
  refs.tabButtons = Array.from(document.querySelectorAll('.revt-tab-btn'));
  refs.tabPanels = Array.from(document.querySelectorAll('.revt-tab-panel'));
  refs.enabled = document.getElementById('revt-enabled');
  refs.preference = document.getElementById('revt-preference');
  refs.aiRules = document.getElementById('revt-ai-rules');
  refs.storyOutline = document.getElementById('revt-story-outline');
  refs.wbSourceAuto = document.getElementById('revt-wb-source-auto');
  refs.wbSourceManual = document.getElementById('revt-wb-source-manual');
  refs.wbManualPanel = document.getElementById('revt-wb-manual-panel');
  refs.wbBooksSearch = document.getElementById('revt-wb-books-search');
  refs.wbBooksList = document.getElementById('revt-wb-books-list');
  refs.wbEntriesSearch = document.getElementById('revt-wb-entries-search');
  refs.wbEntriesList = document.getElementById('revt-wb-entries-list');
  refs.wbEntriesCount = document.getElementById('revt-wb-entries-count');
  refs.list = document.getElementById('revt-list');
  refs.empty = document.getElementById('revt-empty');
  refs.chatHint = document.getElementById('revt-chat-hint');
  refs.logs = document.getElementById('revt-log-list');
  refs.apiProvider = document.getElementById('revt-api-provider');
  refs.apiUrl = document.getElementById('revt-api-url');
  refs.apiKey = document.getElementById('revt-api-key');
  refs.modelName = document.getElementById('revt-model-name');
  refs.modelOptions = document.getElementById('revt-model-options');
  refs.modelFetchStatus = document.getElementById('revt-model-fetch-status');
  refs.anchorLogs = document.getElementById('revt-anchor-log-list');
}

function bindDrawerToggle() {
  if (!refs.drawerToggle || !refs.contentPanel) return;

  refs.drawerToggle.onclick = () => {
    const isOpen = refs.contentPanel.classList.contains('openDrawer');

    refs.contentPanel.classList.toggle('openDrawer', !isOpen);
    refs.contentPanel.classList.toggle('closedDrawer', isOpen);

    if (refs.toolbarIcon) {
      refs.toolbarIcon.classList.toggle('openIcon', !isOpen);
      refs.toolbarIcon.classList.toggle('closedIcon', isOpen);
    }
  };
}

function bindTabs() {
  if (!refs.tabButtons.length || !refs.tabPanels.length) return;

  const activatePanel = (panelId) => {
    for (const btn of refs.tabButtons) {
      btn.classList.toggle('active', btn.dataset.panel === panelId);
    }
    for (const panel of refs.tabPanels) {
      panel.classList.toggle('active', panel.id === panelId);
    }
  };

  for (const btn of refs.tabButtons) {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panel;
      if (!panelId) return;
      activatePanel(panelId);
    });
  }
}

function renderModelCandidates(candidates, currentModel) {
  if (!refs.modelOptions) return;
  const list = Array.isArray(candidates) ? candidates : [];
  refs.modelOptions.innerHTML = '';
  for (const name of list) {
    const opt = document.createElement('option');
    opt.value = name;
    refs.modelOptions.appendChild(opt);
  }

  if (refs.modelName && !refs.modelName.value && list.length > 0) {
    refs.modelName.value = currentModel || list[0];
  }
}

function setModelFetchStatus(text, level = 'muted') {
  if (!refs.modelFetchStatus) return;
  refs.modelFetchStatus.textContent = text || '';
  refs.modelFetchStatus.className = `revt-muted revt-status-${level}`;
}

function saveApiForm() {
  const current = getApiSettings();
  const next = {
    ...current,
    apiProvider: String(refs.apiProvider?.value || 'sillytavern_preset').trim(),
    apiUrl: String(refs.apiUrl?.value || '').trim(),
    apiKey: String(refs.apiKey?.value || '').trim(),
    modelName: String(refs.modelName?.value || '').trim(),
  };
  return saveApiSettings(next);
}

async function fetchModelsAndBind(onFetchModels) {
  const api = saveApiForm();
  if (api.apiProvider === 'sillytavern_preset') {
    addAnchorLog('MODEL_FETCH_SKIP', 'provider=sillytavern_preset');
    setModelFetchStatus('当前提供商无需自动拉取模型', 'muted');
    return;
  }
  if (api.apiProvider === 'sillytavern_proxy_openai') {
    addAnchorLog('MODEL_FETCH_SKIP', 'provider=sillytavern_proxy_openai');
    setModelFetchStatus('代理模式暂不支持自动拉取模型，请手动填写模型名', 'muted');
    return;
  }
  if (!api.apiUrl || !api.apiKey) {
    addAnchorLog('MODEL_FETCH_SKIP', 'url/key missing');
    setModelFetchStatus('填写 URL + Key 后会自动拉取模型', 'muted');
    return;
  }

  addAnchorLog('MODEL_FETCH_START', api.apiUrl);
  setModelFetchStatus('正在拉取模型列表...', 'loading');
  try {
    const models = await onFetchModels();
    const next = saveApiSettings({
      ...getApiSettings(),
      modelCandidates: models,
      modelName: String(refs.modelName?.value || '').trim() || models[0] || '',
    });
    renderModelCandidates(next.modelCandidates, next.modelName);
    addAnchorLog('MODEL_FETCH_OK', `count=${models.length}`);
    setModelFetchStatus(`已获取 ${models.length} 个模型`, 'ok');
  } catch (error) {
    addAnchorLog('MODEL_FETCH_FAIL', error?.message || 'unknown');
    setModelFetchStatus(error?.message || '拉取模型失败，请手动填写', 'warn');
  }
}

function scheduleFetchModels(onFetchModels, delayMs = 700) {
  if (modelFetchTimer) clearTimeout(modelFetchTimer);
  modelFetchTimer = setTimeout(() => {
    fetchModelsAndBind(onFetchModels);
  }, delayMs);
}

function safeDomId(text) {
  return String(text || '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function updateWorldbookEntryCount() {
  if (!refs.wbEntriesList || !refs.wbEntriesCount) return;
  const all = refs.wbEntriesList.querySelectorAll('input[type="checkbox"]');
  const selected = refs.wbEntriesList.querySelectorAll('input[type="checkbox"]:checked');
  refs.wbEntriesCount.textContent = `${selected.length} / ${all.length}`;
}

async function renderWorldbookBooks(chatId) {
  if (!refs.wbBooksList) return;

  const cfg = loadWorldbookSourceConfig(chatId);
  const books = await getAvailableWorldBooks();
  const selectedBooks = cfg.manualBooks || [];
  refs.wbBooksList.innerHTML = '';

  if (!books.length) {
    refs.wbBooksList.innerHTML = '<p class="revt-muted">未找到任何世界书</p>';
    return;
  }

  books.forEach((bookName) => {
    const item = document.createElement('div');
    item.className = 'revt-wb-checkbox-item';
    item.dataset.bookName = bookName;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `revt-wb-book-${safeDomId(bookName)}`;
    checkbox.checked = selectedBooks.includes(bookName);

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = bookName;

    checkbox.addEventListener('change', async () => {
      const next = loadWorldbookSourceConfig(chatId);
      if (checkbox.checked) {
        if (!next.manualBooks.includes(bookName)) next.manualBooks.push(bookName);
      } else {
        next.manualBooks = next.manualBooks.filter((x) => x !== bookName);
        delete next.manualEntries[bookName];
      }
      saveWorldbookSourceConfig(chatId, next);
      await renderWorldbookEntries(chatId);
    });

    item.appendChild(checkbox);
    item.appendChild(label);
    refs.wbBooksList.appendChild(item);
  });
}

async function renderWorldbookEntries(chatId) {
  if (!refs.wbEntriesList) return;
  const cfg = loadWorldbookSourceConfig(chatId);
  const selectedBooks = cfg.manualBooks || [];

  refs.wbEntriesList.innerHTML = '';
  if (!selectedBooks.length) {
    refs.wbEntriesList.innerHTML = '<p class="revt-muted">请先选择世界书</p>';
    if (refs.wbEntriesCount) refs.wbEntriesCount.textContent = '0 / 0';
    return;
  }

  const allEntries = [];
  for (const bookName of selectedBooks) {
    const entries = await getBookEntries(bookName);
    entries.filter((e) => e.enabled).forEach((entry) => allEntries.push({ ...entry, bookName }));
  }

  if (!allEntries.length) {
    refs.wbEntriesList.innerHTML = '<p class="revt-muted">所选世界书没有已启用条目</p>';
    if (refs.wbEntriesCount) refs.wbEntriesCount.textContent = '0 / 0';
    return;
  }

  allEntries.sort((a, b) => String(a.comment || '').localeCompare(String(b.comment || '')));

  allEntries.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'revt-wb-checkbox-item revt-wb-entry-item';
    item.dataset.bookName = entry.bookName;
    item.dataset.entryUid = String(entry.uid);

    const left = document.createElement('div');
    left.className = 'revt-wb-checkbox-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `revt-wb-entry-${safeDomId(entry.bookName)}-${safeDomId(entry.uid)}`;
    checkbox.checked = isEntrySelected(cfg, entry.bookName, entry.uid);

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = entry.comment || '无标题条目';

    const badge = document.createElement('span');
    badge.className = 'revt-wb-book-badge';
    badge.textContent = entry.bookName;

    checkbox.addEventListener('change', () => {
      const next = loadWorldbookSourceConfig(chatId);
      if (!Array.isArray(next.manualEntries[entry.bookName])) {
        next.manualEntries[entry.bookName] = [];
      }

      const uid = String(entry.uid);
      const old = next.manualEntries[entry.bookName];
      const has = old.includes(uid);
      if (checkbox.checked && !has) old.push(uid);
      if (!checkbox.checked && has) {
        next.manualEntries[entry.bookName] = old.filter((x) => x !== uid);
      }
      if (!next.manualEntries[entry.bookName].length) {
        delete next.manualEntries[entry.bookName];
      }
      saveWorldbookSourceConfig(chatId, next);
      updateWorldbookEntryCount();
    });

    left.appendChild(checkbox);
    left.appendChild(label);
    item.appendChild(left);
    item.appendChild(badge);
    refs.wbEntriesList.appendChild(item);
  });

  updateWorldbookEntryCount();
}

async function applyWorldbookSourceUi(chatId) {
  const cfg = loadWorldbookSourceConfig(chatId);
  if (refs.wbSourceAuto) refs.wbSourceAuto.checked = cfg.mode !== 'manual';
  if (refs.wbSourceManual) refs.wbSourceManual.checked = cfg.mode === 'manual';
  if (refs.wbManualPanel) refs.wbManualPanel.style.display = cfg.mode === 'manual' ? 'block' : 'none';

  if (cfg.mode === 'manual') {
    await renderWorldbookBooks(chatId);
    await renderWorldbookEntries(chatId);
  }
}

function bindWorldbookSelector() {
  refs.wbSourceAuto?.addEventListener('change', async () => {
    if (!refs.wbSourceAuto.checked) return;
    const chatId = contextService.getChatId();
    const next = loadWorldbookSourceConfig(chatId);
    next.mode = 'auto';
    saveWorldbookSourceConfig(chatId, next);
    await applyWorldbookSourceUi(chatId);
  });

  refs.wbSourceManual?.addEventListener('change', async () => {
    if (!refs.wbSourceManual.checked) return;
    const chatId = contextService.getChatId();
    const next = loadWorldbookSourceConfig(chatId);
    next.mode = 'manual';
    saveWorldbookSourceConfig(chatId, next);
    await applyWorldbookSourceUi(chatId);
  });

  refs.wbBooksSearch?.addEventListener('input', () => {
    const term = String(refs.wbBooksSearch.value || '').toLowerCase();
    refs.wbBooksList?.querySelectorAll('.revt-wb-checkbox-item').forEach((item) => {
      const label = item.querySelector('label');
      const text = String(label?.textContent || '').toLowerCase();
      item.style.display = !term || text.includes(term) ? 'flex' : 'none';
    });
  });

  refs.wbEntriesSearch?.addEventListener('input', () => {
    const term = String(refs.wbEntriesSearch.value || '').toLowerCase();
    refs.wbEntriesList?.querySelectorAll('.revt-wb-entry-item').forEach((item) => {
      const label = item.querySelector('label');
      const text = String(label?.textContent || '').toLowerCase();
      item.style.display = !term || text.includes(term) ? 'flex' : 'none';
    });
  });

  document.getElementById('revt-wb-refresh-books-btn')?.addEventListener('click', async () => {
    const chatId = contextService.getChatId();
    await renderWorldbookBooks(chatId);
  });

  document.getElementById('revt-wb-refresh-entries-btn')?.addEventListener('click', async () => {
    const chatId = contextService.getChatId();
    await renderWorldbookEntries(chatId);
  });

  document.getElementById('revt-wb-select-all-entries')?.addEventListener('click', () => {
    const chatId = contextService.getChatId();
    const next = loadWorldbookSourceConfig(chatId);
    refs.wbEntriesList?.querySelectorAll('.revt-wb-entry-item').forEach((item) => {
      const bookName = item.dataset.bookName;
      const uid = String(item.dataset.entryUid || '');
      if (!bookName || !uid) return;
      if (!Array.isArray(next.manualEntries[bookName])) next.manualEntries[bookName] = [];
      if (!next.manualEntries[bookName].includes(uid)) next.manualEntries[bookName].push(uid);
      const checkbox = item.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = true;
    });
    saveWorldbookSourceConfig(chatId, next);
    updateWorldbookEntryCount();
  });

  document.getElementById('revt-wb-deselect-all-entries')?.addEventListener('click', () => {
    const chatId = contextService.getChatId();
    const next = loadWorldbookSourceConfig(chatId);
    refs.wbEntriesList?.querySelectorAll('.revt-wb-entry-item').forEach((item) => {
      const bookName = item.dataset.bookName;
      const uid = String(item.dataset.entryUid || '');
      if (!bookName || !uid) return;
      if (Array.isArray(next.manualEntries[bookName])) {
        next.manualEntries[bookName] = next.manualEntries[bookName].filter((x) => x !== uid);
        if (!next.manualEntries[bookName].length) delete next.manualEntries[bookName];
      }
      const checkbox = item.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = false;
    });
    saveWorldbookSourceConfig(chatId, next);
    updateWorldbookEntryCount();
  });
}

export function refreshUi() {
  const chatId = contextService.getChatId();
  const pool = poolService.loadPool(chatId);
  const logs = poolService.loadDeletedHistory(chatId);

  if (refs.enabled) refs.enabled.checked = poolService.loadEnabled();
  if (refs.preference) refs.preference.value = poolService.loadPreference(chatId);
  if (refs.aiRules) refs.aiRules.value = poolService.loadAiRules(chatId);
  if (refs.storyOutline) refs.storyOutline.value = poolService.loadStoryOutline(chatId);
  if (refs.chatHint) refs.chatHint.textContent = `chat: ${chatId}`;

  const api = getApiSettings();
  if (refs.apiProvider) refs.apiProvider.value = api.apiProvider || 'sillytavern_preset';
  if (refs.apiUrl) refs.apiUrl.value = api.apiUrl || '';
  if (refs.apiKey) refs.apiKey.value = api.apiKey || '';
  if (refs.modelName) refs.modelName.value = api.modelName || '';
  renderModelCandidates(api.modelCandidates || [], api.modelName || '');
  if ((api.modelCandidates || []).length > 0) {
    setModelFetchStatus(`已缓存 ${(api.modelCandidates || []).length} 个模型`, 'ok');
  } else if (api.apiProvider === 'sillytavern_preset') {
    setModelFetchStatus('预设模式使用当前酒馆模型，无需拉取', 'muted');
  } else if (api.apiProvider === 'sillytavern_proxy_openai') {
    setModelFetchStatus('代理模式建议手动填写模型名', 'muted');
  } else {
    setModelFetchStatus('填写 URL + Key 后会自动拉取模型', 'muted');
  }

  renderPoolList(refs.list, refs.empty, pool);
  renderDeletedLogs(refs.logs, logs);
  renderAnchorLogs(refs.anchorLogs, getAnchorLogs());
  applyWorldbookSourceUi(chatId);
}

export function mountUiHandlers({ onDeleteEvent, onGenerateIfEmpty, onApiTest, onFetchModels }) {
  resolveRefs();
  bindDrawerToggle();
  bindTabs();
  bindWorldbookSelector();
  refreshUi();
  subscribeAnchorLogs(() => {
    renderAnchorLogs(refs.anchorLogs, getAnchorLogs());
  });

  document.getElementById('revt-refresh')?.addEventListener('click', () => refreshUi());

  document.getElementById('revt-save-pref')?.addEventListener('click', () => {
    const chatId = contextService.getChatId();
    poolService.savePreference(chatId, refs.preference?.value || '');
    if (typeof toastr !== 'undefined') toastr.success('偏好已保存', '随机事件池');
  });

  document.getElementById('revt-save-ai-rules')?.addEventListener('click', () => {
    const chatId = contextService.getChatId();
    poolService.saveAiRules(chatId, refs.aiRules?.value || '');
    if (typeof toastr !== 'undefined') toastr.success('生成规则已保存', '随机事件池');
  });

  document.getElementById('revt-save-outline')?.addEventListener('click', () => {
    const chatId = contextService.getChatId();
    poolService.saveStoryOutline(chatId, refs.storyOutline?.value || '');
    if (typeof toastr !== 'undefined') toastr.success('故事梗概已保存', '随机事件池');
  });

  document.getElementById('revt-save-api')?.addEventListener('click', () => {
    saveApiForm();
    if (typeof toastr !== 'undefined') toastr.success('API设置已保存', '随机事件池');
  });

  document.getElementById('revt-fetch-models')?.addEventListener('click', async () => {
    await fetchModelsAndBind(onFetchModels);
  });

  refs.apiProvider?.addEventListener('change', () => {
    saveApiForm();
    scheduleFetchModels(onFetchModels, 100);
  });

  refs.apiUrl?.addEventListener('blur', () => scheduleFetchModels(onFetchModels));
  refs.apiKey?.addEventListener('blur', () => scheduleFetchModels(onFetchModels));

  refs.modelName?.addEventListener('change', () => saveApiForm());

  document.getElementById('revt-test-api')?.addEventListener('click', async () => {
    try {
      document.getElementById('revt-save-api')?.click();
      const msg = await onApiTest();
      if (typeof toastr !== 'undefined') toastr.success(msg || '连接成功', '随机事件池');
    } catch (error) {
      if (typeof toastr !== 'undefined') {
        toastr.error(error?.message || String(error), '随机事件池 API 测试失败');
      }
    }
  });

  refs.enabled?.addEventListener('change', (e) => {
    poolService.saveEnabled(Boolean(e.target?.checked));
  });

  document.getElementById('revt-generate')?.addEventListener('click', async () => {
    await onGenerateIfEmpty();
    refreshUi();
  });

  refs.list?.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('revt-delete')) return;
    const eventId = target.dataset.id;
    if (!eventId) return;
    onDeleteEvent(eventId);
    refreshUi();
  });
}
