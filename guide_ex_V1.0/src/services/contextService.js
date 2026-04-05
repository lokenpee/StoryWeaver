import { appManager } from '../core/appManager.js';
import { normalizeText } from '../utils/text.js';

function getChatId() {
  const context = appManager.getContext();
  return context?.chatId ? String(context.chatId) : 'no-chat';
}

function getChatMessages() {
  const context = appManager.getContext();
  return Array.isArray(context?.chat) ? context.chat : [];
}

function getLastExchange() {
  const chat = getChatMessages();
  const lastUser = [...chat].reverse().find((m) => m?.is_user === true);
  const lastAi = [...chat].reverse().find((m) => m?.is_user !== true);

  return {
    userText: normalizeText(lastUser?.mes || ''),
    aiText: normalizeText(lastAi?.mes || ''),
  };
}

function getOutlineFallback() {
  const context = appManager.getContext();
  const meta = context?.chatMetadata || {};
  return normalizeText(meta?.story_outline || meta?.outline || '');
}

function getWorldbookFallback() {
  const context = appManager.getContext();
  const charData = context?.character?.data || {};
  const worldName = charData?.extensions?.world || '';
  const additional = Array.isArray(charData?.extensions?.additionalWorldBooks)
    ? charData.extensions.additionalWorldBooks.join(', ')
    : '';
  return normalizeText([worldName, additional].filter(Boolean).join(', '));
}

export const contextService = {
  getChatId,
  getChatMessages,
  getLastExchange,
  getOutlineFallback,
  getWorldbookFallback,
};
