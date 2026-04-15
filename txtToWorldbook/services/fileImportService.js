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

    const INLINE_CHAPTER_MARKER_REGEX = /第\s*[零一二三四五六七八九十百千万两〇0-9]+\s*[章回卷节部篇]/giu;
    const INLINE_CHAPTER_BOUNDARY_CHAR_REGEX = /[。！？!?；;，,、”’」』）)\]】》〉]/u;

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

    function getPreviousVisibleChar(rawContent, index) {
        if (!Number.isInteger(index) || index <= 0) return '';

        let cursor = index - 1;
        while (cursor >= 0) {
            const ch = rawContent[cursor];
            if (!(/[\s\u3000\uFEFF]/.test(ch))) return ch;
            cursor -= 1;
        }
        return '';
    }

    function isLikelyInlineChapterStart(rawContent, index) {
        if (!Number.isInteger(index) || index < 0) return false;
        if (isLikelyChapterLineStart(rawContent, index)) return true;

        const prevChar = getPreviousVisibleChar(rawContent, index);
        return INLINE_CHAPTER_BOUNDARY_CHAR_REGEX.test(prevChar);
    }

    function normalizeInlineChapterMarkers(rawContent) {
        const text = typeof rawContent === 'string' ? rawContent : String(rawContent || '');
        if (!text) return text;

        let result = '';
        let cursor = 0;
        let changed = false;

        for (const match of text.matchAll(INLINE_CHAPTER_MARKER_REGEX)) {
            const index = Number.isInteger(match.index) ? match.index : -1;
            if (index < 0) continue;

            const marker = match[0];
            result += text.slice(cursor, index);

            const shouldInsertBreak = !isLikelyChapterLineStart(text, index)
                && isLikelyInlineChapterStart(text, index)
                && !result.endsWith('\n')
                && !result.endsWith('\r');

            if (shouldInsertBreak) {
                result += '\n';
                changed = true;
            }

            result += marker;
            cursor = index + marker.length;
        }

        if (cursor === 0) return text;
        result += text.slice(cursor);
        return changed ? result : text;
    }

    function extractChapterCapture(match) {
        if (!match || typeof match[0] !== 'string') {
            return { capturedText: '', offsetInFullMatch: 0 };
        }

        const fullMatch = match[0];
        for (let i = 1; i < match.length; i++) {
            const captured = typeof match[i] === 'string' ? match[i] : '';
            if (!captured) continue;

            const offset = fullMatch.indexOf(captured);
            if (offset >= 0) {
                return { capturedText: captured, offsetInFullMatch: offset };
            }
        }

        return { capturedText: fullMatch, offsetInFullMatch: 0 };
    }

    function getChapterMatchStartIndex(match) {
        const baseIndex = Number.isInteger(match?.index) ? match.index : 0;
        const capture = extractChapterCapture(match);
        return baseIndex + capture.offsetInFullMatch;
    }

    function getChapterMatchTitle(match) {
        return extractChapterCapture(match).capturedText || '';
    }

    function detectChapterMatches(rawContent, regexPattern) {
        const chapterRegex = new RegExp(regexPattern, 'gm');
        const rawMatches = [...rawContent.matchAll(chapterRegex)];
        if (rawMatches.length === 0) return [];

        const boundaryMatches = rawMatches.filter((m) => {
            const matchStart = getChapterMatchStartIndex(m);
            return isLikelyInlineChapterStart(rawContent, matchStart);
        });
        return boundaryMatches.length > 0 ? boundaryMatches : rawMatches;
    }

    function splitContentIntoMemory(content) {
        const chunkSize = AppState.settings.chunkSize;
        const minChunkSize = Math.max(chunkSize * 0.3, 5000);
        let shouldMergeTinyChunks = true;
        AppState.memory.queue = [];

        // Normalize inline chapter markers like “……」第二章” into line-start chapter headers.
        const normalizedContent = normalizeInlineChapterMarkers(content);

        const matches = detectChapterMatches(normalizedContent, AppState.config.chapterRegex.pattern);

        if (matches.length > 0) {
            shouldMergeTinyChunks = false;
            const chapters = [];

            for (let i = 0; i < matches.length; i++) {
                const startIndex = getChapterMatchStartIndex(matches[i]);
                const endIndex = i < matches.length - 1
                    ? getChapterMatchStartIndex(matches[i + 1])
                    : normalizedContent.length;
                const chapterContent = normalizedContent.slice(startIndex, endIndex);
                chapters.push({ title: getChapterMatchTitle(matches[i]), content: chapterContent });
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

            while (i < normalizedContent.length) {
                let endIndex = Math.min(i + chunkSize, normalizedContent.length);
                if (endIndex < normalizedContent.length) {
                    const paragraphBreak = normalizedContent.lastIndexOf('\n\n', endIndex);
                    if (paragraphBreak > i + chunkSize * 0.5) {
                        endIndex = paragraphBreak + 2;
                    } else {
                        const sentenceBreak = normalizedContent.lastIndexOf('。', endIndex);
                        if (sentenceBreak > i + chunkSize * 0.5) {
                            endIndex = sentenceBreak + 1;
                        }
                    }
                }

                AppState.memory.queue.push(createMemoryChunk(normalizedContent.slice(i, endIndex), chunkIndex, `第${chunkIndex}章`));
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
            memory.worldbookStatus = memory.worldbookStatus || (memory.failed ? 'failed' : (memory.processed ? 'done' : 'pending'));
            memory.directorStatus = memory.directorStatus || memory.chapterOutlineStatus;
            memory.worldbookError = typeof memory.worldbookError === 'string'
                ? memory.worldbookError
                : (typeof memory.failedError === 'string' ? memory.failedError : '');
            memory.directorError = typeof memory.directorError === 'string'
                ? memory.directorError
                : (typeof memory.chapterOutlineError === 'string' ? memory.chapterOutlineError : '');
            memory.chapterScript = memory.chapterScript || { keyNodes: [], beats: [] };
            if (!Array.isArray(memory.chapterScript.beats)) {
                memory.chapterScript.beats = [];
            }
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

        const processedCount = AppState.memory.queue.filter((memory) => {
            const status = String(memory.worldbookStatus || '').trim().toLowerCase();
            return status === 'done';
        }).length;
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
            worldbookStatus: 'pending',
            worldbookError: '',
            worldbookProcessing: false,
            directorStatus: 'pending',
            directorError: '',
            directorProcessing: false,
            processed: false,
            failed: false,
            processing: false,
            chapterOutline: '',
            chapterOutlineStatus: 'pending',
            chapterOutlineError: '',
            chapterScript: { keyNodes: [], beats: [] },
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
