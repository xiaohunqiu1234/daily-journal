'use strict';

// ===== 存储 =====
// 三种后端，启动时按优先级自动探测：
//   1. 'server' —— 本地 node server.js，数据存项目目录 data/journal.json（本地开发）
//   2. 'gist'   —— GitHub 私密 Gist，数据存你的 GitHub 账户（线上 / 跨设备持久化）
//   3. 'local'  —— 纯浏览器 localStorage（无服务器、未配置云同步时的兜底）
// 无论哪种后端，都会同时镜像一份到 localStorage 作为离线缓存。
const STORE_KEY = 'daily_journal_v2';
const SYNC_CFG_KEY = 'daily_journal_sync'; // { token, gistId }
const API_URL = '/api/journal';
const GIST_FILE = 'journal.json';

let backend = 'local';   // 'server' | 'gist' | 'local'
let gistCfg = null;      // { token, gistId }

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocal(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    showToast('浏览器缓存空间不足');
  }
}

function loadSyncCfg() {
  try {
    const raw = localStorage.getItem(SYNC_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSyncCfg(cfg) {
  if (cfg) localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(SYNC_CFG_KEY);
}

// 合并两份数据。规则：
//   1. 「有内容」永远胜过「空」—— 空记录绝不覆盖有内容的记录（不看时间戳）
//   2. 两者都有内容（或都为空）时，才比 updatedAt 取较新者
// 这样可避免「自动选中今天产生的空记录 + 新时间戳」把真实内容覆盖掉。
function mergeStores(base, extra) {
  const out = Object.assign({}, base);
  for (const k of Object.keys(extra)) {
    const a = out[k], b = extra[k];
    if (!a) { out[k] = b; continue; }
    const ca = hasContent(a), cb = hasContent(b);
    if (ca !== cb) {
      out[k] = ca ? a : b;
    } else {
      const ta = a.updatedAt || '', tb = b.updatedAt || '';
      if (tb > ta) out[k] = b;
    }
  }
  return out;
}

// 推送到云端/服务器前，剔除没有任何内容的空记录，保持存储干净、
// 并杜绝空记录再次参与同步、污染其他设备。
function pruneEmpty(s) {
  const o = {};
  for (const k of Object.keys(s)) if (hasContent(s[k])) o[k] = s[k];
  return o;
}

// ----- 本地服务器后端 -----
async function saveServer(store) {
  const res = await fetch(API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(store)
  });
  if (!res.ok) throw new Error('save failed');
}

// ----- GitHub Gist 后端 -----
async function gistRequest(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${gistCfg.token}`,
      'Accept': 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const msg = res.status === 401 ? 'token 无效或缺少 gist 权限'
      : res.status === 404 ? 'Gist 不存在或无权访问'
      : `GitHub ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

async function gistLoad() {
  const data = await gistRequest('GET', `https://api.github.com/gists/${gistCfg.gistId}`);
  const file = data.files && data.files[GIST_FILE];
  if (!file) return {};
  // 大文件 Gist 的 content 会被截断，需从 raw_url 拉取完整内容
  let content = file.content;
  if (file.truncated && file.raw_url) {
    content = await (await fetch(file.raw_url)).text();
  }
  try { return JSON.parse(content) || {}; } catch { return {}; }
}

async function gistSave(store) {
  await gistRequest('PATCH', `https://api.github.com/gists/${gistCfg.gistId}`, {
    files: { [GIST_FILE]: { content: JSON.stringify(pruneEmpty(store), null, 2) } }
  });
}

async function gistCreate(store) {
  const data = await gistRequest('POST', 'https://api.github.com/gists', {
    description: '每日日志数据 (daily-journal)',
    public: false,
    files: { [GIST_FILE]: { content: JSON.stringify(pruneEmpty(store), null, 2) } }
  });
  return data.id;
}

// 启动时加载：探测后端 → 合并浏览器缓存 → 把缺失内容写回云端/文件 → 返回数据
async function loadStore() {
  const local = loadLocal();

  // 1) 本地服务器（开发态）
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (res.ok) {
      backend = 'server';
      const serverData = await res.json();
      const merged = mergeStores(serverData, local);
      if (JSON.stringify(merged) !== JSON.stringify(serverData)) {
        try { await saveServer(merged); } catch { /* 下次保存再同步 */ }
      }
      saveLocal(merged);
      return merged;
    }
  } catch { /* 无本地服务器，继续探测下一级 */ }

  // 2) GitHub Gist（已配置云同步）
  gistCfg = loadSyncCfg();
  if (gistCfg && gistCfg.token && gistCfg.gistId) {
    try {
      const remote = await gistLoad();
      backend = 'gist';
      const merged = mergeStores(remote, local);
      // 首次连接时把浏览器缓存的内容合并上传
      if (JSON.stringify(merged) !== JSON.stringify(remote)) {
        try { await gistSave(merged); } catch { /* 下次保存再同步 */ }
      }
      saveLocal(merged);
      return merged;
    } catch (e) {
      showToast(`云同步连接失败（${e.message}），暂用本地缓存`);
    }
  }

  // 3) 纯 localStorage 兜底
  backend = 'local';
  return local;
}

// 把当前打开面板里「已改动但未提交」的内容并入 store（赋予最新 updatedAt），
// 这样同步合并时本设备的编辑一定胜出，不会被云端旧数据覆盖。返回是否有改动。
function commitOpenIfDirty() {
  if (!selectedKey) return false;
  const cur = collectData();
  const prev = store[selectedKey];
  const strip = o => { const x = Object.assign({}, o); delete x.updatedAt; return JSON.stringify(x); };
  // 内容没变（除时间戳外）→ 不动，避免无意义地刷新时间戳
  if (prev && strip(cur) === strip(prev)) return false;
  // 空白且原本就没有/也是空 → 不创建空记录（杜绝「空 + 新时间戳」污染同步）
  if (!hasContent(cur) && (!prev || !hasContent(prev))) return false;
  store[selectedKey] = cur;
  saveLocal(store);
  return true;
}

// 核心同步：pull → merge → push。保存、手动同步、回到页面都走它。
// opts.announce 控制是否提示「已同步」。并发安全：同一时刻只跑一个，跑完若期间又有改动则补跑。
let syncing = false;
let syncQueued = false;
async function syncWithRemote(opts = {}) {
  if (backend !== 'gist' || !gistCfg) return;
  if (syncing) { syncQueued = true; if (opts.announce) showToast('同步中…'); return; }
  syncing = true;
  try {
    const localChanged = commitOpenIfDirty();
    const openBefore = selectedKey ? JSON.stringify(store[selectedKey]) : null;

    let remote = null;
    try { remote = await gistLoad(); }
    catch (e) { if (opts.announce) showToast('拉取云端失败：' + e.message); }

    if (remote) {
      const before = JSON.stringify(store);
      store = mergeStores(remote, store); // 同一天以 updatedAt 较新者为准
      if (JSON.stringify(store) !== before) {
        saveLocal(store);
        renderCalendar();
      }
      // 仅当「当前打开的这一天」被云端较新内容更新时，才刷新面板，避免打断输入
      const openAfter = selectedKey ? JSON.stringify(store[selectedKey]) : null;
      if (openBefore !== openAfter) refreshOpenPanel();
    }

    // 本地比云端多/新才回写，避免无意义写入（如纯粹回到页面且无变化）
    const needPush = localChanged || !remote || JSON.stringify(store) !== JSON.stringify(remote);
    if (opts.force || needPush) {
      try { await gistSave(store); gistDirty = false; }
      catch (e) { showToast('云同步保存失败：' + e.message); return; }
    } else {
      gistDirty = false;
    }
    if (opts.announce) showToast('已与云端同步');
  } finally {
    syncing = false;
    if (syncQueued) { syncQueued = false; syncWithRemote(); }
  }
}

// Gist 写入防抖，避免连续切换日期时频繁打 API
let gistTimer = null;
let gistDirty = false; // 是否有改动尚未成功推送到云端（供关闭页面时判断）
function scheduleGistSave() {
  gistDirty = true;
  clearTimeout(gistTimer);
  gistTimer = setTimeout(() => syncWithRemote(), 800);
}

function saveStore() {
  // 始终镜像到 localStorage 作为缓存
  saveLocal(store);
  if (backend === 'server') {
    saveServer(store).catch(() => showToast('写入本地文件失败'));
  } else if (backend === 'gist') {
    scheduleGistSave();
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
let store = {};

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
  const data = collectData();
  // 空白记录不入库（避免「自动选中今天」产生空记录并参与同步）
  if (hasContent(data)) store[selectedKey] = data;
  else delete store[selectedKey];
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

// 关闭页面前保存：localStorage 同步写入；云端/服务器尽力送达
window.addEventListener('beforeunload', () => {
  if (!selectedKey) return;
  const dirty = commitOpenIfDirty();
  if (backend === 'server' && navigator.sendBeacon) {
    navigator.sendBeacon(API_URL, new Blob([JSON.stringify(store)], { type: 'application/json' }));
  } else if (backend === 'gist' && gistCfg && (dirty || gistDirty)) {
    // 仅在有未推送改动时才在关闭瞬间补推。sendBeacon 无法带 Authorization 头，
    // 改用 keepalive fetch 尽力送达（无法在此做 pull-merge，属尽力兜底）。
    clearTimeout(gistTimer);
    fetch(`https://api.github.com/gists/${gistCfg.gistId}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        'Authorization': `Bearer ${gistCfg.token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(pruneEmpty(store), null, 2) } } })
    });
  }
});

// 回到页面（切回标签页 / 窗口重新聚焦）时自动从云端拉取，看到其他设备的更新
let lastPull = 0;
function maybePull() {
  if (backend !== 'gist') return;
  const now = Date.now();
  if (now - lastPull < 5000) return; // 防抖，避免频繁触发
  lastPull = now;
  syncWithRemote();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') maybePull();
});
window.addEventListener('focus', maybePull);

// ===== 云同步设置面板 =====
function updateSyncIndicator() {
  const btn = document.getElementById('sync-btn');
  if (!btn) return;
  const on = backend === 'gist';
  btn.classList.toggle('synced', on);
  btn.querySelector('.sync-label').textContent = on ? '云同步已开' : '云同步';
}

function openSyncModal() {
  const cfg = loadSyncCfg() || {};
  document.getElementById('sync-token').value = cfg.token || '';
  document.getElementById('sync-gistid').value = cfg.gistId || '';
  document.getElementById('sync-status').textContent = backend === 'gist'
    ? `当前：已连接 Gist ${cfg.gistId}` : '当前：未启用云同步';
  document.getElementById('sync-connected-actions').style.display = backend === 'gist' ? 'flex' : 'none';
  document.getElementById('sync-modal').style.display = 'flex';
}

function closeSyncModal() {
  document.getElementById('sync-modal').style.display = 'none';
}

async function connectGist(createNew) {
  const statusEl = document.getElementById('sync-status');
  const token = document.getElementById('sync-token').value.trim();
  let gistId = document.getElementById('sync-gistid').value.trim();
  if (!token) { statusEl.textContent = '请先填写 GitHub Token'; return; }

  // 先把当前面板未保存的编辑并入 store，避免连接时丢失
  if (selectedKey) { store[selectedKey] = collectData(); saveLocal(store); }

  const prevCfg = gistCfg;
  gistCfg = { token, gistId };
  statusEl.textContent = '连接中…';
  try {
    if (createNew || !gistId) {
      gistId = await gistCreate(store);
      gistCfg.gistId = gistId;
      document.getElementById('sync-gistid').value = gistId;
    } else {
      const remote = await gistLoad();
      store = mergeStores(remote, store);
      await gistSave(store);
    }
    saveSyncCfg(gistCfg);
    backend = 'gist';
    saveLocal(store);
    renderCalendar();
    refreshOpenPanel();
    updateSyncIndicator();
    statusEl.textContent = `已连接 ✓ Gist ${gistId}`;
    document.getElementById('sync-connected-actions').style.display = 'flex';
    showToast('云同步已开启');
  } catch (e) {
    gistCfg = prevCfg;
    statusEl.textContent = `连接失败：${e.message}`;
  }
}

function disconnectGist() {
  saveSyncCfg(null);
  gistCfg = null;
  backend = 'server'; // 若本地有服务器则回退到它，否则下面纠正为 local
  // 重新探测：没有本地服务器就退回 localStorage
  fetch(API_URL, { cache: 'no-store' })
    .then(r => { backend = r.ok ? 'server' : 'local'; })
    .catch(() => { backend = 'local'; })
    .finally(() => { updateSyncIndicator(); });
  document.getElementById('sync-status').textContent = '已断开云同步（数据仍保留在本浏览器）';
  document.getElementById('sync-connected-actions').style.display = 'none';
  showToast('已断开云同步');
}

// 连接/合并后刷新当前打开的日期面板，展示最新数据
function refreshOpenPanel() {
  if (!selectedKey) return;
  const [y, m, d] = selectedKey.split('-').map(Number);
  loadDayPanel(selectedKey, y, m - 1, d);
}

document.getElementById('sync-btn').addEventListener('click', openSyncModal);
document.getElementById('sync-close').addEventListener('click', closeSyncModal);
document.getElementById('sync-modal').addEventListener('click', e => {
  if (e.target.id === 'sync-modal') closeSyncModal();
});
document.getElementById('sync-connect').addEventListener('click', () => connectGist(false));
document.getElementById('sync-create').addEventListener('click', () => connectGist(true));
document.getElementById('sync-disconnect').addEventListener('click', disconnectGist);
document.getElementById('sync-now').addEventListener('click', () => {
  const el = document.getElementById('sync-status');
  el.textContent = '同步中…';
  syncWithRemote({ announce: true, force: true }).then(() => {
    if (backend === 'gist') el.textContent = `当前：已连接 Gist ${gistCfg.gistId}`;
  });
});

// ===== 初始化 =====
async function init() {
  store = await loadStore();
  updateSyncIndicator();
  renderCalendar();
  selectDay(curYear, curMonth, today.d);
}
init();
