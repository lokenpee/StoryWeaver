function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readText(key, fallback = '') {
  const value = localStorage.getItem(key);
  return value == null ? fallback : value;
}

function writeText(key, value) {
  localStorage.setItem(key, String(value ?? ''));
}

export const storage = {
  readJson,
  writeJson,
  readText,
  writeText,
};
