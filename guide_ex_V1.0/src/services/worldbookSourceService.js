import { appManager } from '../core/appManager.js';
import { poolService } from './poolService.js';

async function loadWorldInfoModule() {
  const path = ['/scripts', 'world-info.js'].join('/');
  return import(path);
}

async function loadUtilsModule() {
  const path = ['/scripts', 'utils.js'].join('/');
  return import(path);
}

function getDefaultConfig() {
  return {
    mode: 'auto',
    manualBooks: [],
    manualEntries: {},
  };
}

function normalizeConfig(raw) {
  const base = getDefaultConfig();
  if (!raw || typeof raw !== 'object') return base;

  return {
    mode: raw.mode === 'manual' ? 'manual' : 'auto',
    manualBooks: Array.isArray(raw.manualBooks) ? raw.manualBooks.map((x) => String(x || '').trim()).filter(Boolean) : [],
    manualEntries: raw.manualEntries && typeof raw.manualEntries === 'object' ? raw.manualEntries : {},
  };
}

export function loadWorldbookSourceConfig(chatId) {
  return normalizeConfig(poolService.loadWorldbookSourceConfig(chatId));
}

export function saveWorldbookSourceConfig(chatId, config) {
  poolService.saveWorldbookSourceConfig(chatId, normalizeConfig(config));
}

export function updateWorldbookSourceConfig(chatId, updates) {
  const next = {
    ...loadWorldbookSourceConfig(chatId),
    ...(updates || {}),
  };
  saveWorldbookSourceConfig(chatId, next);
  return loadWorldbookSourceConfig(chatId);
}

export function isEntrySelected(config, bookName, entryUid) {
  const selected = config?.manualEntries?.[bookName];
  if (!Array.isArray(selected)) return false;
  const uid = String(entryUid);
  return selected.includes(uid) || selected.includes(entryUid);
}

export function getCharacterBoundBooks() {
  // Use sync fallback first; extra books from charLore are resolved asynchronously below.
  const context = appManager.getContext();
  const characters = context?.characters;
  const characterId = context?.characterId;

  if (!characters || characterId === null || characterId === undefined) return [];

  const character = Array.isArray(characters) ? characters[characterId] : characters[characterId];
  if (!character) return [];

  const names = [];
  const primary = character?.data?.extensions?.world;
  if (primary) names.push(String(primary));

  const additionalBooks = character?.data?.extensions?.additionalWorldBooks;
  if (Array.isArray(additionalBooks)) {
    names.push(...additionalBooks);
  }

  return [...new Set(names.map((x) => String(x || '').trim()).filter(Boolean))];
}

export async function getAvailableWorldBooks() {
  const mod = await loadWorldInfoModule();
  const names = Array.isArray(mod?.world_names) ? mod.world_names : [];
  return [...new Set(names)].map((x) => String(x || '').trim()).filter(Boolean);
}

export async function getBookEntries(bookName) {
  const mod = await loadWorldInfoModule();
  const content = await mod.loadWorldInfo(bookName);
  const entriesObj = content?.entries || {};

  return Object.entries(entriesObj).map(([uid, raw]) => ({
    uid: String(uid),
    key: Array.isArray(raw?.key) ? raw.key : [],
    content: String(raw?.content || ''),
    enabled: !raw?.disable,
    comment: String(raw?.comment || '无标题条目'),
    constant: Boolean(raw?.constant),
    bookName,
  }));
}

export async function getSelectedWorldbookEntries(chatId) {
  const config = loadWorldbookSourceConfig(chatId);
  let books = config.mode === 'manual' ? (config.manualBooks || []) : getCharacterBoundBooks();

  if (config.mode !== 'manual') {
    try {
      const context = appManager.getContext();
      const characters = context?.characters;
      const characterId = context?.characterId;
      const character = Array.isArray(characters) ? characters?.[characterId] : characters?.[characterId];
      if (character && Array.isArray(characters)) {
        const idx = characters.indexOf(character);
        if (idx >= 0) {
          const utils = await loadUtilsModule();
          const worldInfo = await loadWorldInfoModule();
          const fileName = utils.getCharaFilename(idx);
          const extra = worldInfo?.world_info?.charLore?.find((entry) => entry?.name === fileName);
          if (extra && Array.isArray(extra.extraBooks)) {
            books = [...new Set([...books, ...extra.extraBooks])];
          }
        }
      }
    } catch {
      // Ignore optional extra-book lookup failures.
    }
  }

  if (!books.length) return [];

  const all = [];
  for (const name of books) {
    const entries = await getBookEntries(name);
    entries.forEach((entry) => all.push(entry));
  }

  if (config.mode === 'manual') {
    return all.filter((entry) => entry.enabled && isEntrySelected(config, entry.bookName, entry.uid));
  }

  return all.filter((entry) => entry.enabled);
}
