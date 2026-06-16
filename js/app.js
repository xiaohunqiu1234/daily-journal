'use strict';

// ===== 存储 =====
const STORE_KEY = 'daily_journal_v2';

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    showToast('存储空间不足，保存失败');
  }
}

// ===== 工具 =====
function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function hasContent(data) {
  if (!data) return false;
  if (data.quote && data.quote.trim()) return true;
  if (data.reflect && data.reflect.trim()) return true;
  if (data.process && data.process.trim()) return true;
  if (data.action && data.action.trim()) return true;
  if (data.tasks && data.tasks.some(t => t.text && t.text.trim())) return true;
  return false;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ===== 状态 =====
const _n = new Date(); const today = { y: _n.getFullYear(), m: _n.getMonth(), d: _n.getDate() };
let curYear = today.y;
let curMonth = today.m;
let selectedKey = null;
let store = loadStore();

// ===== 日历渲染 =====
function renderCalendar() {
  const label = document.getElementById('month-label');
  const grid = document.getElementById('cal-grid');
  label.textContent = `${curYear}年 ${curMonth + 1}月`;

  const firstDay = new Date(curYear, curMonth, 1).getDay();
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
  const daysInPrev = new Date(curYear, curMonth, 0).getDate();

  grid.innerHTML = '';

  // 上月补位
  for (let i = 0; i < firstDay; i++) {
    const cell = makeCell(daysInPrev - firstDay + 1 + i, 'other-month', null);
    grid.appendChild(cell);
  }

  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(curYear, curMonth, d);
    let extra = '';
    if (curYear === today.y && curMonth === today.m && d === today.d) extra += ' today';
    if (key === selectedKey) extra += ' selected';
    // 仅对早于今天的日期标点
    const isPast = (curYear < today.y) ||
      (curYear === today.y && curMonth < today.m) ||
      (curYear === today.y && curMonth === today.m && d < today.d);
    if (isPast && store[key] && hasContent(store[key])) extra += ' has-data';
    const cell = makeCell(d, extra.trim(), () => selectDay(curYear, curMonth, d));
    grid.appendChild(cell);
  }

  // 下月补位
  const total = firstDay + daysInMonth;
  const rem = (7 - total % 7) % 7;
  for (let i = 1; i <= rem; i++) {
    const cell = makeCell(i, 'other-month', null);
    grid.appendChild(cell);
  }

  updateStats();
}

function makeCell(num, extraClass, onClick) {
  const div = document.createElement('div');
  div.className = `day-cell ${extraClass}`;
  div.innerHTML = `${num}<span class="dot"></span>`;
  if (onClick) div.addEventListener('click', onClick);
  else div.style.pointerEvents = 'none';
  return div;
}

// ===== 日期选择 =====
function selectDay(y, m, d) {
  if (selectedKey) commitSave(false);
  selectedKey = dateKey(y, m, d);
  renderCalendar();
  loadDayPanel(selectedKey, y, m, d);
}

function loadDayPanel(key, y, m, d) {
  const WK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const wk = new Date(y, m, d).getDay();

  document.getElementById('empty-state').style.display = 'none';
  const panel = document.getElementById('day-panel');
  panel.style.display = 'block';

  document.getElementById('panel-date').textContent = `${y}年${m + 1}月${d}日`;
  document.getElementById('panel-weekday').textContent = WK[wk];

  const data = store[key] || {
    quote: '',
    tasks: Array(7).fill(null).map(() => ({ text: '', done: false })),
    reflect: '',
    process: '',
    action: ''
  };

  document.getElementById('quote-input').value = data.quote || '';
  document.getElementById('r-reflect').value = data.reflect || '';
  document.getElementById('r-process').value = data.process || '';
  document.getElementById('r-action').value = data.action || '';

  const wrap = document.getElementById('tasks-wrap');
  wrap.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const t = (data.tasks && data.tasks[i]) || { text: '', done: false };
    const row = document.createElement('div');
    row.className = 'task-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'task-cb';
    cb.checked = !!t.done;
    cb.setAttribute('aria-label', `任务 ${i + 1} 完成状态`);

    const num = document.createElement('span');
    num.className = 'task-num';
    num.textContent = i + 1;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'task-text';
    inp.placeholder = `任务 ${i + 1}`;
    inp.value = t.text || '';
    inp.setAttribute('aria-label', `任务 ${i + 1}`);

    row.appendChild(cb);
    row.appendChild(num);
    row.appendChild(inp);
    wrap.appendChild(row);
  }

  document.getElementById('saved-badge').style.opacity = '0';
}

// ===== 保存 =====
function collectData() {
  const tasks = [];
  document.querySelectorAll('.task-row').forEach(row => {
    const cb = row.querySelector('.task-cb');
    const inp = row.querySelector('.task-text');
    tasks.push({ text: inp ? inp.value : '', done: cb ? cb.checked : false });
  });
  return {
    quote: document.getElementById('quote-input').value,
    tasks,
    reflect: document.getElementById('r-reflect').value,
    process: document.getElementById('r-process').value,
    action: document.getElementById('r-action').value,
    updatedAt: new Date().toISOString()
  };
}

function commitSave(showFeedback) {
  if (!selectedKey) return;
  store[selectedKey] = collectData();
  saveStore(store);
  renderCalendar();
  if (showFeedback) {
    const badge = document.getElementById('saved-badge');
    badge.style.opacity = '1';
    clearTimeout(badge._timer);
    badge._timer = setTimeout(() => badge.style.opacity = '0', 2000);
    showToast('已保存');
  }
}

// ===== 统计 =====
function updateStats() {
  const keys = Object.keys(store).filter(k => hasContent(store[k]));
  const el = document.getElementById('stats');
  el.textContent = keys.length ? `已记录 ${keys.length} 天` : '';
}

// ===== 导出 =====
function exportData() {
  const keys = Object.keys(store).filter(k => hasContent(store[k]));
  if (!keys.length) { showToast('暂无记录可导出'); return; }
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `daily-journal-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`已导出 ${keys.length} 条记录`);
}

// ===== 导入 =====
function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (typeof imported !== 'object' || Array.isArray(imported)) throw new Error();
      const count = Object.keys(imported).length;
      // 合并，新数据优先
      store = Object.assign({}, store, imported);
      saveStore(store);
      renderCalendar();
      showToast(`已导入 ${count} 条记录`);
    } catch {
      showToast('文件格式有误，导入失败');
    }
  };
  reader.readAsText(file);
}

// ===== 快捷键 =====
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    if (selectedKey) commitSave(true);
  }
});

// ===== 事件绑定 =====
document.getElementById('prev').addEventListener('click', () => {
  if (selectedKey) commitSave(false);
  curMonth--;
  if (curMonth < 0) { curMonth = 11; curYear--; }
  renderCalendar();
});

document.getElementById('next').addEventListener('click', () => {
  if (selectedKey) commitSave(false);
  curMonth++;
  if (curMonth > 11) { curMonth = 0; curYear++; }
  renderCalendar();
});

document.getElementById('save-btn').addEventListener('click', () => {
  if (selectedKey) commitSave(true);
});

document.getElementById('export-btn').addEventListener('click', exportData);

document.getElementById('import-input').addEventListener('change', e => {
  importData(e.target.files[0]);
  e.target.value = '';
});

// 切换日期时自动保存
window.addEventListener('beforeunload', () => {
  if (selectedKey) commitSave(false);
});

// ===== 初始化 =====
renderCalendar();
selectDay(curYear, curMonth, today.d);
