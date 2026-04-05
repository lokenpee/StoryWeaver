const MAX_LOGS = 120;
const listeners = new Set();
const logs = [];

function nowLabel() {
  return new Date().toLocaleTimeString();
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(logs);
    } catch {
      // Ignore listener errors to avoid breaking runtime.
    }
  }
}

export function addAnchorLog(tag, detail = '') {
  const row = {
    time: nowLabel(),
    tag: String(tag || 'UNKNOWN'),
    detail: String(detail || ''),
  };

  logs.push(row);
  if (logs.length > MAX_LOGS) logs.shift();

  const suffix = row.detail ? ` | ${row.detail}` : '';
  console.info(`[REVT][ANCHOR] ${row.time} [${row.tag}]${suffix}`);
  notify();
}

export function getAnchorLogs() {
  return logs.slice(-30);
}

export function subscribeAnchorLogs(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}
