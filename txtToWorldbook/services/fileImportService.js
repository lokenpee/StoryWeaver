export function createFileImportService(deps = {}) {
    const {
        AppState,
        MemoryHistoryDB,
        Logger,
        ErrorHandler,
        confirmAction,
        fileUtils,
        updateMemoryQueueUI,
        updateStartButtonState,
        showQueueSection,
        showProgressSection,
        showResultSection,
        updateWorldbookPreview,
        applyDefaultWorldbookEntries,
        saveCurrentSettings,
    } = deps;

    async function handleFileSelect(file) {
        if (!file.name.endsWith('.txt')) {
            ErrorHandler.showUserError('请选择TXT文件');
            return;
        }

        try {
            const { encoding, content } = await fileUtils.detectBestEncoding(file);
            AppState.file.current = file;

            const newHash = await fileUtils.calculateFileHash(content);
            const savedHash = await MemoryHistoryDB.getSavedFileHash();
            if (savedHash && savedHash !== newHash) {
                const historyList = await MemoryHistoryDB.getAllHistory();
                if (
                    historyList.length > 0
                    && await confirmAction(`检测到新文件，是否清空旧历史？\n当前有 ${historyList.length} 条记录。`, {
                        title: '清空旧历史',
                        danger: true,
                    })
                ) {
                    await MemoryHistoryDB.clearAllHistory();
                    await MemoryHistoryDB.clearAllRolls();
                    await MemoryHistoryDB.clearState();
                }
            }

            AppState.file.hash = newHash;
            await MemoryHistoryDB.saveFileHash(newHash);

            document.getElementById('ttw-upload-area').style.display = 'none';
            document.getElementById('ttw-file-info').style.display = 'flex';
            document.getElementById('ttw-file-name').textContent = file.name;
            document.getElementById('ttw-file-size').textContent = `(${(content.length / 1024).toFixed(1)} KB, ${encoding})`;

            AppState.file.novelName = file.name.replace(/\.[^/.]+$/, '');

            const novelNameInput = document.getElementById('ttw-novel-name-input');
            if (novelNameInput) novelNameInput.value = AppState.file.novelName;
            const novelNameRow = document.getElementById('ttw-novel-name-row');
            if (novelNameRow) novelNameRow.style.display = 'flex';

            splitContentIntoMemory(content);
            if (AppState.experience) {
                AppState.experience.currentChapterIndex = 0;
            }
            showQueueSection(true);
            updateMemoryQueueUI();

            document.getElementById('ttw-start-btn').disabled = false;
            AppState.memory.startIndex = 0;
            AppState.memory.userSelectedIndex = null;

            AppState.worldbook.generated = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
            applyDefaultWorldbookEntries();
            if (Object.keys(AppState.worldbook.generated).length > 0) {
                showResultSection(true);
                updateWorldbookPreview();
            }

            updateStartButtonState(false);
        } catch (error) {
            ErrorHandler.showUserError('文件处理失败: ' + error.message);
        }
    }

    function isLikelyChapterLineStart(rawContent, index) {
        if (!Number.isInteger(index) || index < 0) return false;
        if (index === 0) return true;

        let cursor = index - 1;
        while (cursor >= 0) {
            const ch = rawContent[cursor];
            if (ch === '\n' || ch === '\r') return true;
            if (!(/[\s\u3000\uFEFF]/.test(ch))) return false;
            cursor -= 1;
        }
        return true;
    }

    function detectChapterMatches(rawContent, regexPattern) {
        const chapterRegex = new RegExp(regexPattern, 'gm');
        const rawMatches = [...rawContent.matchAll(chapterRegex)];
        if (rawMatches.length === 0) return [];

        const lineStartMatches = rawMatches.filter((m) => isLikelyChapterLineStart(rawContent, m.index));
        return lineStartMatches.length > 0 ? lineStartMatches : rawMatches;
    }

    function splitContentIntoMemory(content) {
        const chunkSize = AppState.settings.chunkSize;
        const minChunkSize = Math.max(chunkSize * 0.3, 5000);
        let shouldMergeTinyChunks = true;
        AppState.memory.queue = [];

        const matches = detectChapterMatches(content, AppState.config.chapterRegex.pattern);

        if (matches.length > 0) {
            shouldMergeTinyChunks = false;
            const chapters = [];

            for (let i = 0; i < matches.length; i++) {
                const startIndex = matches[i].index;
                const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
                const chapterContent = content.slice(startIndex, endIndex);
                chapters.push({ title: matches[i][0], content: chapterContent });
            }

            let chunkIndex = 1;
            for (let i = 0; i < chapters.length; i++) {
                const chapter = chapters[i];
                if (chapter.content.length > chunkSize) {
                    let remaining = chapter.content;
                    let splitPart = 1;
                    while (remaining.length > 0) {
                        let endPos = Math.min(chunkSize, remaining.length);
                        if (endPos < remaining.length) {
                            const paragraphBreak = remaining.lastIndexOf('\n\n', endPos);
                            if (paragraphBreak > endPos * 0.5) {
                                endPos = paragraphBreak + 2;
                            } else {
                                const sentenceBreak = remaining.lastIndexOf('。', endPos);
                                if (sentenceBreak > endPos * 0.5) {
                                    endPos = sentenceBreak + 1;
                                }
                            }
                        }

                        const partTitle = splitPart === 1 ? chapter.title : `${chapter.title}-分段${splitPart}`;
                        AppState.memory.queue.push(createMemoryChunk(remaining.slice(0, endPos), chunkIndex, partTitle));
                        remaining = remaining.slice(endPos);
                        splitPart++;
                        chunkIndex++;
                    }
                    continue;
                }

                AppState.memory.queue.push(createMemoryChunk(chapter.content, chunkIndex, chapter.title));
                chunkIndex++;
            }
        } else {
            let i = 0;
            let chunkIndex = 1;

            while (i < content.length) {
                let endIndex = Math.min(i + chunkSize, content.length);
                if (endIndex < content.length) {
                    const paragraphBreak = content.lastIndexOf('\n\n', endIndex);
                    if (paragraphBreak > i + chunkSize * 0.5) {
                        endIndex = paragraphBreak + 2;
                    } else {
                        const sentenceBreak = content.lastIndexOf('。', endIndex);
                        if (sentenceBreak > i + chunkSize * 0.5) {
                            endIndex = sentenceBreak + 1;
                        }
                    }
                }

                AppState.memory.queue.push(createMemoryChunk(content.slice(i, endIndex), chunkIndex, `第${chunkIndex}章`));
                i = endIndex;
                chunkIndex++;
            }
        }

        if (shouldMergeTinyChunks) {
            for (let i = AppState.memory.queue.length - 1; i > 0; i--) {
                if (AppState.memory.queue[i].content.length < minChunkSize) {
                    const prevMemory = AppState.memory.queue[i - 1];
                    if (prevMemory.content.length + AppState.memory.queue[i].content.length <= chunkSize * 1.2) {
                        prevMemory.content += AppState.memory.queue[i].content;
                        AppState.memory.queue.splice(i, 1);
                    }
                }
            }
        }

        AppState.memory.queue.forEach((memory, index) => {
            memory.title = `记忆${index + 1}`;
            if (!memory.chapterTitle || !String(memory.chapterTitle).trim()) {
                memory.chapterTitle = `第${index + 1}章`;
            }
            memory.chapterOutline = memory.chapterOutline || '';
            memory.chapterOutlineStatus = memory.chapterOutlineStatus || 'pending';
            memory.chapterOutlineError = memory.chapterOutlineError || '';
            memory.chapterScript = memory.chapterScript || { goal: '', flow: '', keyNodes: [] };
            memory.chapterOpeningPreview = memory.chapterOpeningPreview || '';
            memory.chapterOpeningSent = memory.chapterOpeningSent === true;
            memory.chapterOpeningError = memory.chapterOpeningError || '';
        });
    }

    async function handleClearFile() {
        AppState.file.current = null;
        AppState.file.novelName = '';
        AppState.memory.queue = [];
        AppState.worldbook.generated = {};
        AppState.worldbook.volumes = [];
        AppState.worldbook.currentVolumeIndex = 0;
        AppState.memory.startIndex = 0;
        AppState.memory.userSelectedIndex = null;
        AppState.file.hash = null;
        AppState.ui.isMultiSelectMode = false;
        AppState.ui.selectedIndices.clear();
        if (AppState.experience) {
            AppState.experience.currentChapterIndex = 0;
        }

        try {
            await MemoryHistoryDB.clearAllHistory();
            await MemoryHistoryDB.clearAllRolls();
            await MemoryHistoryDB.clearState();
            await MemoryHistoryDB.clearFileHash();
            Logger.info('History', '已清空所有历史记录');
        } catch (error) {
            Logger.error('History', '清空历史失败:', error);
        }

        document.getElementById('ttw-upload-area').style.display = 'block';
        document.getElementById('ttw-file-info').style.display = 'none';
        document.getElementById('ttw-file-input').value = '';

        const novelNameRow = document.getElementById('ttw-novel-name-row');
        if (novelNameRow) novelNameRow.style.display = 'none';
        const novelNameInput = document.getElementById('ttw-novel-name-input');
        if (novelNameInput) novelNameInput.value = '';

        document.getElementById('ttw-start-btn').disabled = true;
        document.getElementById('ttw-start-btn').textContent = '🚀 开始转换';

        showQueueSection(false);
        showProgressSection(false);
        showResultSection(false);
    }

    async function rechunkMemories() {
        if (AppState.memory.queue.length === 0) {
            ErrorHandler.showUserError('没有可重新分块的内容');
            return;
        }

        const processedCount = AppState.memory.queue.filter((m) => m.processed && !m.failed).length;
        if (processedCount > 0) {
            const confirmMsg = `⚠️ 警告：当前有 ${processedCount} 个已处理的章节。\n\n重新分块将会：\n1. 清除所有已处理状态\n2. 需要重新从头开始转换\n3. 但不会清除已生成的世界书数据\n\n确定要重新分块吗？`;
            if (!await confirmAction(confirmMsg, { title: '重新分块', danger: true })) {
                return;
            }
        }

        if (typeof saveCurrentSettings === 'function') {
            saveCurrentSettings();
        }

        const allContent = AppState.memory.queue.map((m) => m.content).join('');
        splitContentIntoMemory(allContent);

        AppState.memory.startIndex = 0;
        AppState.memory.userSelectedIndex = null;

        updateMemoryQueueUI();
        updateStartButtonState(false);

        ErrorHandler.showUserSuccess(`重新分块完成！\n当前共 ${AppState.memory.queue.length} 个章节`);
    }

    function createMemoryChunk(content, chunkIndex, chapterTitle = '') {
        return {
            title: `记忆${chunkIndex}`,
            chapterTitle: chapterTitle || `第${chunkIndex}章`,
            content,
            processed: false,
            failed: false,
            processing: false,
            chapterOutline: '',
            chapterOutlineStatus: 'pending',
            chapterOutlineError: '',
            chapterScript: { goal: '', flow: '', keyNodes: [] },
            chapterOpeningPreview: '',
            chapterOpeningSent: false,
            chapterOpeningError: '',
        };
    }

    return {
        handleFileSelect,
        splitContentIntoMemory,
        handleClearFile,
        rechunkMemories,
    };
}
