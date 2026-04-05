function evidenceText(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return '无';
  return evidence.map((item) => `[${item.type}] ${item.snippet}`).join(' | ');
}

export function renderPoolList(container, emptyEl, pool) {
  if (!container || !emptyEl) return;

  const list = Array.isArray(pool) ? pool : [];
  container.innerHTML = '';
  emptyEl.style.display = list.length === 0 ? 'block' : 'none';

  for (const event of list) {
    const card = document.createElement('div');
    card.className = 'revt-event';
    card.innerHTML = `
      <div class="revt-event-top">
        <div class="revt-event-title">${event.title}</div>
        <button class="menu_button revt-delete" data-id="${event.id}">删除</button>
      </div>
      <div class="revt-event-meta">
        <span class="revt-chip">when: ${event.when}</span>
        <span class="revt-chip">impact: ${event.impact}</span>
        <span class="revt-chip">location: ${event.location || 'unknown'}</span>
      </div>
      <div class="revt-event-main">${event.event}</div>
      <div class="revt-reason">requirements: ${(event.requirements || []).join('；') || '无'}</div>
      <details>
        <summary>evidence</summary>
        <div class="revt-reason">${evidenceText(event.evidence)}</div>
      </details>
    `;
    container.appendChild(card);
  }
}

export function renderDeletedLogs(container, logs) {
  if (!container) return;
  const list = Array.isArray(logs) ? logs : [];
  if (list.length === 0) {
    container.innerHTML = '<div class="revt-muted">暂无自动清理日志</div>';
    return;
  }

  const rows = list.slice(-8).reverse().map((row) => {
    return `<div class="revt-log-item">[${row.reason}] ${row.title}</div>`;
  });

  container.innerHTML = rows.join('');
}

export function renderAnchorLogs(container, logs) {
  if (!container) return;
  const list = Array.isArray(logs) ? logs : [];
  if (list.length === 0) {
    container.innerHTML = '<div class="revt-muted">暂无运行锚点</div>';
    return;
  }

  const rows = list.slice(-20).reverse().map((row) => {
    const detail = row.detail ? ` | ${row.detail}` : '';
    return `<div class="revt-log-item">${row.time} [${row.tag}]${detail}</div>`;
  });
  container.innerHTML = rows.join('');
}
