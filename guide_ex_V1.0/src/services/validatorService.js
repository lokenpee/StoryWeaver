import { DELETE_REASON, RULES } from '../constants.js';
import { includesAny, normalizeText } from '../utils/text.js';

function extractKeywords(event) {
  const raw = `${event?.title || ''} ${event?.location || ''}`;
  return normalizeText(raw)
    .split(/[\s,，。.!?？；;、]+/)
    .filter((x) => x.length >= 2)
    .slice(0, RULES.OCCURRED_DETECT_KEYWORD_LIMIT);
}

function checkConflict(event, lastUserText) {
  const words = extractKeywords(event);
  const hasDeny = /不要|不需要|无视|删掉|取消|不想要/.test(lastUserText);
  if (hasDeny && includesAny(lastUserText, words)) {
    return { remove: true, reason: DELETE_REASON.CONFLICT };
  }
  return { remove: false, reason: '' };
}

function checkOccurred(event, lastAiText) {
  const words = extractKeywords(event);
  if (includesAny(lastAiText, words)) {
    return { remove: true, reason: DELETE_REASON.OCCURRED };
  }
  return { remove: false, reason: '' };
}

function checkInvalid(event, lastUserText) {
  if (/换场景|跳过|离开这里|第二天|场景切换/.test(lastUserText)) {
    if (event?.location && event.location !== 'unknown') {
      return { remove: true, reason: DELETE_REASON.INVALID };
    }
  }
  return { remove: false, reason: '' };
}

export function validatePool(pool, context) {
  const keep = [];
  const removed = [];
  const lastUserText = normalizeText(context.lastUser || '');
  const lastAiText = normalizeText(context.lastAi || '');

  for (const event of Array.isArray(pool) ? pool : []) {
    const c1 = checkConflict(event, lastUserText);
    if (c1.remove) {
      removed.push({ id: event.id, title: event.title, reason: c1.reason });
      continue;
    }

    const c2 = checkInvalid(event, lastUserText);
    if (c2.remove) {
      removed.push({ id: event.id, title: event.title, reason: c2.reason });
      continue;
    }

    const c3 = checkOccurred(event, lastAiText);
    if (c3.remove) {
      removed.push({ id: event.id, title: event.title, reason: c3.reason });
      continue;
    }

    keep.push(event);
  }

  return { keep, removed };
}
