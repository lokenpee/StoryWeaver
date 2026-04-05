/**
 * 创世纪资料源UI绑定 - V8.0
 * 处理世界书筛选器的UI交互逻辑
 */

import {
    getGenesisSourceConfig,
    updateGenesisSourceConfig,
    saveGenesisSourceConfig,
    loadGenesisSourceConfig,
    fetchAvailableWorldBooks,
    fetchBookEntries,
    fetchCharacterBoundBooks,
    setGenesisSourceMode,
    addBookToManualList,
    removeBookFromManualList,
    toggleEntryInManualList,
    isEntryInManualList,
} from './genesisSourceManager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GenesisSource-UI');

let isInitialized = false;

/**
 * 初始化创世纪资料源UI
 */
export function initializeGenesisSourceUI() {
    if (isInitialized) {
        logger.warn('创世纪资料源UI已经初始化过了');
        return;
    }

    logger.info('正在初始化创世纪资料源UI...');

    // 加载配置
    loadGenesisSourceConfig();

    // 绑定事件
    bindModeSelection();
    bindBooksList();
    bindEntriesList();
    bindSearchFunctionality();
    bindRefreshButtons();

    // 初始化UI状态
    updateUIState();

    isInitialized = true;
    logger.info('创世纪资料源UI初始化完成');
}

/**
 * 绑定模式选择（自动/手动）
 */
function bindModeSelection() {
    const autoRadio = document.getElementById('sbt-wb-source-auto');
    const manualRadio = document.getElementById('sbt-wb-source-manual');
    const manualPanel = document.getElementById('sbt-wb-manual-panel');

    if (!autoRadio || !manualRadio || !manualPanel) {
        logger.error('找不到资料源模式选择元素');
        return;
    }

    const config = getGenesisSourceConfig();
    if (config.mode === 'manual') {
        manualRadio.checked = true;
        manualPanel.style.display = 'block';
    } else {
        autoRadio.checked = true;
        manualPanel.style.display = 'none';
    }

    autoRadio.addEventListener('change', () => {
        if (autoRadio.checked) {
            setGenesisSourceMode('auto');
            manualPanel.style.display = 'none';
            saveGenesisSourceConfig();
            logger.info('切换到自动模式');
        }
    });

    manualRadio.addEventListener('change', () => {
        if (manualRadio.checked) {
            setGenesisSourceMode('manual');
            manualPanel.style.display = 'block';
            saveGenesisSourceConfig();
            renderBooksList();
            logger.info('切换到手动精选模式');
        }
    });
}

/**
 * 渲染世界书列表
 */
async function renderBooksList() {
    const listContainer = document.getElementById('sbt-wb-books-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<p class="sbt-instructions-small">加载中...</p>';

    try {
        const worldbooks = await fetchAvailableWorldBooks();
        const config = getGenesisSourceConfig();
        const selectedBooks = config.manualBooks || [];

        listContainer.innerHTML = '';

        if (worldbooks.length === 0) {
            listContainer.innerHTML = '<p class="sbt-instructions-small">未找到任何世界书</p>';
            return;
        }

        worldbooks.forEach(bookName => {
            const item = document.createElement('div');
            item.className = 'sbt-wb-checkbox-item';
            item.dataset.bookName = bookName;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `sbt-genesis-book-${bookName.replace(/[^a-zA-Z0-9]/g, '-')}`;
            checkbox.value = bookName;
            checkbox.checked = selectedBooks.includes(bookName);

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = bookName;

            checkbox.addEventListener('change', () => {
                handleBookToggle(bookName, checkbox.checked);
            });

            item.appendChild(checkbox);
            item.appendChild(label);
            listContainer.appendChild(item);
        });

        logger.info(`已渲染 ${worldbooks.length} 个世界书`);
    } catch (e) {
        logger.error('渲染世界书列表失败', e);
        listContainer.innerHTML = '<p class="sbt-instructions-small" style="color: var(--sbt-danger-color);">加载失败</p>';
    }
}

/**
 * 处理世界书勾选状态变化
 */
async function handleBookToggle(bookName, isChecked) {
    if (isChecked) {
        addBookToManualList(bookName);
    } else {
        removeBookFromManualList(bookName);
    }

    await saveGenesisSourceConfig();
    await renderEntriesList(); // 更新条目列表
}

/**
 * 渲染条目列表
 */
async function renderEntriesList() {
    const listContainer = document.getElementById('sbt-wb-entries-list');
    const countBadge = document.getElementById('sbt-wb-entries-count');

    if (!listContainer) return;

    listContainer.innerHTML = '<p class="sbt-instructions-small">加载中...</p>';

    try {
        const config = getGenesisSourceConfig();
        const selectedBooks = config.manualBooks || [];

        if (selectedBooks.length === 0) {
            listContainer.innerHTML = '<p class="sbt-instructions-small">请先选择世界书</p>';
            if (countBadge) countBadge.textContent = '0 / 0';
            return;
        }

        // 加载所有选中世界书的条目
        const allEntries = [];
        for (const bookName of selectedBooks) {
            const entries = await fetchBookEntries(bookName);
            const enabledEntries = entries.filter(e => e.enabled);
            enabledEntries.forEach(entry => {
                allEntries.push({ ...entry, bookName });
            });
        }

        listContainer.innerHTML = '';

        if (allEntries.length === 0) {
            listContainer.innerHTML = '<p class="sbt-instructions-small">所选世界书没有已启用的条目</p>';
            if (countBadge) countBadge.textContent = '0 / 0';
            return;
        }

        // 按条目名称排序
        allEntries.sort((a, b) => (a.comment || '').localeCompare(b.comment || ''));

        let selectedCount = 0;
        allEntries.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'sbt-wb-checkbox-item sbt-wb-entry-item';
            item.dataset.bookName = entry.bookName;
            item.dataset.entryUid = entry.uid;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `sbt-genesis-entry-${entry.bookName.replace(/[^a-zA-Z0-9]/g, '-')}-${entry.uid}`;
            checkbox.checked = isEntryInManualList(entry.bookName, entry.uid);
            if (checkbox.checked) selectedCount++;

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = entry.comment || '无标题条目';

            const bookBadge = document.createElement('span');
            bookBadge.className = 'sbt-wb-book-badge';
            bookBadge.textContent = entry.bookName;

            checkbox.addEventListener('change', () => {
                handleEntryToggle(entry.bookName, entry.uid, checkbox.checked);
            });

            item.appendChild(checkbox);
            item.appendChild(label);
            item.appendChild(bookBadge);
            listContainer.appendChild(item);
        });

        if (countBadge) {
            countBadge.textContent = `${selectedCount} / ${allEntries.length}`;
        }

        logger.info(`已渲染 ${allEntries.length} 个条目，其中 ${selectedCount} 个已选中`);
    } catch (e) {
        logger.error('渲染条目列表失败', e);
        listContainer.innerHTML = '<p class="sbt-instructions-small" style="color: var(--sbt-danger-color);">加载失败</p>';
    }
}

/**
 * 处理条目勾选状态变化
 */
async function handleEntryToggle(bookName, entryUid, isChecked) {
    toggleEntryInManualList(bookName, entryUid, isChecked);
    await saveGenesisSourceConfig();

    // 更新计数徽章
    updateEntryCount();
}

/**
 * 更新条目计数徽章
 */
function updateEntryCount() {
    const listContainer = document.getElementById('sbt-wb-entries-list');
    const countBadge = document.getElementById('sbt-wb-entries-count');

    if (!listContainer || !countBadge) return;

    const totalCheckboxes = listContainer.querySelectorAll('input[type="checkbox"]').length;
    const checkedCheckboxes = listContainer.querySelectorAll('input[type="checkbox"]:checked').length;

    countBadge.textContent = `${checkedCheckboxes} / ${totalCheckboxes}`;
}

/**
 * 绑定世界书列表相关功能
 */
function bindBooksList() {
    // 刷新按钮会通过 bindRefreshButtons 绑定
}

/**
 * 绑定条目列表相关功能
 */
function bindEntriesList() {
    const selectAllBtn = document.getElementById('sbt-wb-select-all-entries');
    const deselectAllBtn = document.getElementById('sbt-wb-deselect-all-entries');

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', async () => {
            const listContainer = document.getElementById('sbt-wb-entries-list');
            if (!listContainer) return;

            const checkboxes = listContainer.querySelectorAll('input[type="checkbox"]');
            for (const checkbox of checkboxes) {
                if (!checkbox.checked) {
                    checkbox.checked = true;
                    const item = checkbox.closest('.sbt-wb-checkbox-item');
                    if (item) {
                        const bookName = item.dataset.bookName;
                        const entryUid = item.dataset.entryUid;
                        toggleEntryInManualList(bookName, entryUid, true);
                    }
                }
            }

            await saveGenesisSourceConfig();
            updateEntryCount();
            logger.info('已全选所有条目');
        });
    }

    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', async () => {
            const listContainer = document.getElementById('sbt-wb-entries-list');
            if (!listContainer) return;

            const checkboxes = listContainer.querySelectorAll('input[type="checkbox"]');
            for (const checkbox of checkboxes) {
                if (checkbox.checked) {
                    checkbox.checked = false;
                    const item = checkbox.closest('.sbt-wb-checkbox-item');
                    if (item) {
                        const bookName = item.dataset.bookName;
                        const entryUid = item.dataset.entryUid;
                        toggleEntryInManualList(bookName, entryUid, false);
                    }
                }
            }

            await saveGenesisSourceConfig();
            updateEntryCount();
            logger.info('已取消选择所有条目');
        });
    }
}

/**
 * 绑定搜索功能
 */
function bindSearchFunctionality() {
    const booksSearchInput = document.getElementById('sbt-wb-books-search');
    const entriesSearchInput = document.getElementById('sbt-wb-entries-search');

    if (booksSearchInput) {
        booksSearchInput.addEventListener('input', () => {
            const searchTerm = booksSearchInput.value.toLowerCase();
            const listContainer = document.getElementById('sbt-wb-books-list');
            if (!listContainer) return;

            const items = listContainer.querySelectorAll('.sbt-wb-checkbox-item');
            items.forEach(item => {
                const label = item.querySelector('label');
                if (label && label.textContent.toLowerCase().includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    if (entriesSearchInput) {
        entriesSearchInput.addEventListener('input', () => {
            const searchTerm = entriesSearchInput.value.toLowerCase();
            const listContainer = document.getElementById('sbt-wb-entries-list');
            if (!listContainer) return;

            const items = listContainer.querySelectorAll('.sbt-wb-checkbox-item');
            let visibleCount = 0;
            let checkedVisibleCount = 0;

            items.forEach(item => {
                const label = item.querySelector('label');
                const checkbox = item.querySelector('input[type="checkbox"]');
                if (label && label.textContent.toLowerCase().includes(searchTerm)) {
                    item.style.display = 'flex';
                    visibleCount++;
                    if (checkbox && checkbox.checked) checkedVisibleCount++;
                } else {
                    item.style.display = 'none';
                }
            });

            // 更新计数徽章（仅显示可见的）
            const countBadge = document.getElementById('sbt-wb-entries-count');
            if (countBadge && searchTerm) {
                countBadge.textContent = `${checkedVisibleCount} / ${visibleCount}`;
            } else if (countBadge) {
                updateEntryCount(); // 恢复完整计数
            }
        });
    }
}

/**
 * 绑定刷新按钮
 */
function bindRefreshButtons() {
    const refreshBooksBtn = document.getElementById('sbt-wb-refresh-books-btn');
    const refreshEntriesBtn = document.getElementById('sbt-wb-refresh-entries-btn');

    if (refreshBooksBtn) {
        refreshBooksBtn.addEventListener('click', async () => {
            logger.info('手动刷新世界书列表');
            await renderBooksList();
        });
    }

    if (refreshEntriesBtn) {
        refreshEntriesBtn.addEventListener('click', async () => {
            logger.info('手动刷新条目列表');
            await renderEntriesList();
        });
    }
}

/**
 * 更新UI状态
 */
async function updateUIState() {
    const config = getGenesisSourceConfig();

    // 更新单选按钮状态
    const autoRadio = document.getElementById('sbt-wb-source-auto');
    const manualRadio = document.getElementById('sbt-wb-source-manual');
    const manualPanel = document.getElementById('sbt-wb-manual-panel');

    if (autoRadio && manualRadio && manualPanel) {
        if (config.mode === 'manual') {
            manualRadio.checked = true;
            manualPanel.style.display = 'block';
            await renderBooksList();
            await renderEntriesList();
        } else {
            autoRadio.checked = true;
            manualPanel.style.display = 'none';
        }
    }
}

/**
 * 当角色切换时重新加载配置
 */
export async function onCharacterChanged() {
    logger.info('角色已切换，重新加载创世纪资料源配置');
    loadGenesisSourceConfig();
    await updateUIState();
}

/**
 * 当聊天切换时重新加载配置
 */
export async function onChatChanged() {
    logger.info('聊天已切换，重新加载创世纪资料源配置');
    loadGenesisSourceConfig();
    await updateUIState();
}
