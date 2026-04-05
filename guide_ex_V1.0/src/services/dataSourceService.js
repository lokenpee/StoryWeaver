import { appManager } from '../core/appManager.js';
import { normalizeText } from '../utils/text.js';
import { getSelectedWorldbookEntries } from './worldbookSourceService.js';
import { poolService } from './poolService.js';

const contextCache = {
  chatId: '',
  ts: 0,
  value: null,
};
const CONTEXT_CACHE_TTL_MS = 3000;

async function buildWorldbookText() {
  try {
    const chatId = String(appManager.getContext()?.chatId || 'no-chat');
    const entries = await getSelectedWorldbookEntries(chatId);
    if (!entries.length) return '';

    const byBook = new Map();
    entries.forEach((entry) => {
      const name = String(entry.bookName || '未命名世界书');
      if (!byBook.has(name)) byBook.set(name, []);
      byBook.get(name).push(entry);
    });

    const blocks = [];
    for (const [bookName, list] of byBook.entries()) {
      blocks.push(`## 世界书: ${bookName}`);
      list.forEach((e) => {
        const keys = Array.isArray(e.key) && e.key.length ? ` | Keys: ${e.key.join(', ')}` : '';
        blocks.push(`- [${e.uid}] ${e.comment || '未命名条目'}${keys}`);
        blocks.push(e.content ? String(e.content).trim() : '（空）');
        blocks.push('');
      });
    }

    return blocks.join('\n').trim();
  } catch (error) {
    console.warn('[REVT] 世界书读取失败，回退空文本。', error);
    return '';
  }
}

export async function getPreciseExternalContext() {
  const context = appManager.getContext();
  const chatId = String(context?.chatId || 'no-chat');
  const now = Date.now();

  if (contextCache.value && contextCache.chatId === chatId && (now - contextCache.ts) < CONTEXT_CACHE_TTL_MS) {
    return contextCache.value;
  }

  const worldbook = await buildWorldbookText();
  const outline = normalizeText(poolService.loadStoryOutline(chatId) || '');

  const result = {
    worldbook,
    outline,
  };

  contextCache.chatId = chatId;
  contextCache.ts = now;
  contextCache.value = result;
  return result;
}
