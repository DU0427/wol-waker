// wol-waker 界面逻辑：设备管理 / 一键唤醒 / 在线检查 / 终端日志
// 真发走 window.WolNative（Electron preload 或 Android 桥接），无桥接时为预览模式
'use strict';

const $ = (id) => document.getElementById(id);
const LS_KEY = 'wol-waker.devices.v2';
const LS_KEY_V1 = 'wol-waker.devices.v1';
const DEFAULT_CHECK_PORTS = [3389, 22];

const states = {};   // id -> unknown | offline | checking | waking | online
const busy = new Set();
let editingId = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 存储 ───────────────────────────────── */
function loadDevices() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
    const old = localStorage.getItem(LS_KEY_V1);        // 兼容旧版本数据
    if (old) {
      const migrated = JSON.parse(old).map((d) => ({ checkPorts: '', ...d }));
      localStorage.setItem(LS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch { return []; }
}
function saveDevices(devs) {
  localStorage.setItem(LS_KEY, JSON.stringify(devs));
}

/* ── 工具 ───────────────────────────────── */
function parsePorts(raw) {
  const list = String(raw || '')
    .split(/[^0-9]+/).filter(Boolean).map(Number)
    .filter((p) => Number.isInteger(p) && p >= 1 && p <= 65535);
  const uniq = [...new Set(list)];
  return uniq.length ? uniq : DEFAULT_CHECK_PORTS;
}

/* ── 终端日志 ───────────────────────────── */
const LEVEL_TAG = { info: 'INFO', ok: 'OK', warn: 'WARN', err: 'ERR', net: 'NET' };
function term(level, msg) {
  const box = $('log');
  const line = document.createElement('div');
  line.className = 'term-line ' + level;
  const t = document.createElement('span'); t.className = 't';
  t.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const lv = document.createElement('span'); lv.className = 'lv';
  lv.textContent = LEVEL_TAG[level] || 'INFO';
  const m = document.createElement('span'); m.className = 'msg'; m.textContent = msg;
  line.append(t, lv, m);
  box.appendChild(line);
  while (box.children.length > 400) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
}

/* ── 状态点 ─────────────────────────────── */
function setState(id, state) {
  states[id] = state;
  const dot = document.querySelector(`.dot[data-dot="${id}"]`);
  if (dot) dot.dataset.state = state;
  const card = document.querySelector(`.dev[data-id="${id}"]`);
  if (card) card.classList.toggle('is-online', state === 'online');
}

/* ── 渲染 ───────────────────────────────── */
function iconBtn(symbol, label, onClick, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn sm' + (cls ? ' ' + cls : '');
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = `<svg class="i"><use href="#${symbol}"/></svg>`;
  b.onclick = onClick;
  return b;
}

function addMeta(dl, key, value) {
  const dt = document.createElement('dt'); dt.textContent = key;
  const dd = document.createElement('dd'); dd.textContent = value; dd.title = value;
  dl.append(dt, dd);
}

function renderCard(d) {
  const el = document.createElement('article');
  el.className = 'dev';
  el.dataset.id = d.id;

  const top = document.createElement('div');
  top.className = 'dev-top';
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.dataset.dot = d.id;
  dot.dataset.state = states[d.id] || 'unknown';
  const name = document.createElement('h3');
  name.className = 'dev-name';
  name.textContent = d.name || d.host;
  top.append(
    dot,
    name,
    iconBtn('i-pencil', '编辑', () => openForm(d)),
    iconBtn('i-trash', '删除', () => removeDevice(d)),
  );

  const meta = document.createElement('dl');
  meta.className = 'dev-meta';
  addMeta(meta, '地址', `${d.host}:${d.port}`);
  addMeta(meta, 'MAC', d.mac);
  addMeta(meta, '检查', parsePorts(d.checkPorts).join(', '));

  const actions = document.createElement('div');
  actions.className = 'dev-actions';
  const wake = document.createElement('button');
  wake.type = 'button';
  wake.className = 'primary-btn';
  wake.textContent = '唤醒';
  wake.onclick = () => wakeDevice(d, wake);
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'ghost-btn';
  check.textContent = '检查在线';
  check.onclick = () => checkDevice(d, false);
  actions.append(wake, check);

  el.append(top, meta, actions);
  if (states[d.id] === 'online') el.classList.add('is-online');
  return el;
}

function render() {
  const devs = loadDevices();
  const list = $('list');
  list.textContent = '';
  $('devCount').textContent = String(devs.length);

  if (!devs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<strong>还没有设备</strong><span>点右上角 + 添加一台电脑</span>';
    list.appendChild(empty);
    return;
  }
  devs.forEach((d) => list.appendChild(renderCard(d)));
}

/* ── 唤醒 / 检查 ────────────────────────── */
async function safeCheck(host, ports) {
  try {
    return await window.WolNative.checkHost({ host, tcpPorts: ports, timeoutMs: 3000 });
  } catch { return null; }
}

async function checkDevice(d, silent) {
  const label = d.name || d.host;
  const ports = parsePorts(d.checkPorts);
  if (!window.WolNative) {
    if (!silent) term('warn', '未检测到原生桥接，无法检查在线状态');
    return false;
  }
  setState(d.id, 'checking');
  if (!silent) term('info', `检查 ${d.host} 的端口 ${ports.join(', ')} …`);
  const res = await safeCheck(d.host, ports);
  if (res && res.online) {
    setState(d.id, 'online');
    if (!silent) term('ok', `${label} 在线（${res.latencyMs}ms）`);
    return true;
  }
  setState(d.id, 'offline');
  if (!silent) term('warn', `${label} 无响应（已试端口 ${ports.join(', ')}）`);
  return false;
}

async function wakeDevice(d, btn) {
  if (busy.has(d.id)) return;
  busy.add(d.id);
  const label = d.name || d.host;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '发送中…';

  try {
    if (!window.WolNative) {
      term('warn', '未检测到原生桥接：当前是网页预览，打包成 Windows/安卓应用后才会真发');
      return;
    }
    if (window.WolCore) window.WolCore.validateTarget(d);

    setState(d.id, 'waking');
    term('net', `发送魔术包 → ${d.host}:${d.port}`);
    const r = await window.WolNative.sendMagicPacket({
      host: d.host, port: d.port, mac: d.mac, secureOn: d.secureOn || undefined,
    });
    term('ok', `已发送 ${r.bytes} 字节 → ${r.resolvedIp}:${d.port}（第 ${r.attempts} 次成功）`);
    touchLastWake(d.id);

    btn.textContent = '等待上线…';
    const ports = parsePorts(d.checkPorts);
    for (let i = 0; i < 24; i++) {
      await sleep(5000);
      const res = await safeCheck(d.host, ports);
      if (res && res.online) {
        setState(d.id, 'online');
        term('ok', `${label} 已上线（${res.latencyMs}ms）`);
        return;
      }
    }
    setState(d.id, 'offline');
    term('warn', `${label} 2 分钟内未上线：检查端口转发 / 静态 ARP / BIOS 与网卡唤醒设置`);
  } catch (e) {
    setState(d.id, 'offline');
    term('err', `唤醒失败：${e && e.message ? e.message : e}`);
  } finally {
    busy.delete(d.id);
    btn.disabled = false;
    btn.textContent = original;
  }
}

function touchLastWake(id) {
  const devs = loadDevices().map((x) => (x.id === id ? { ...x, lastWakeAt: Date.now() } : x));
  saveDevices(devs);
}

function removeDevice(d) {
  const label = d.name || d.host;
  if (!window.confirm(`删除「${label}」？`)) return;
  saveDevices(loadDevices().filter((x) => x.id !== d.id));
  delete states[d.id];
  term('info', `已删除 ${label}`);
  render();
}

/* ── 表单弹窗 ───────────────────────────── */
function openForm(d) {
  editingId = d ? d.id : null;
  $('formTitle').textContent = d ? '编辑设备' : '添加设备';
  $('fName').value = d ? (d.name || '') : '';
  $('fHost').value = d ? d.host : '';
  $('fPort').value = d ? d.port : 9;
  $('fCheck').value = d ? (d.checkPorts || '') : '';
  $('fMac').value = d ? d.mac : '';
  $('fSecure').value = d ? (d.secureOn || '') : '';
  hideFormError();
  $('sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => { (d ? $('fHost') : $('fName')).focus(); }, 60);
}

function closeForm() {
  $('sheet').hidden = true;
  document.body.style.overflow = '';
  editingId = null;
}

function showFormError(msg) {
  const el = $('formError');
  el.textContent = msg;
  el.hidden = false;
}
function hideFormError() {
  const el = $('formError');
  el.hidden = true;
  el.textContent = '';
}

function validate(dev) {
  if (window.WolCore) {
    try { window.WolCore.validateTarget(dev); }
    catch (e) { return e.message; }
  } else {
    if (!dev.host) return '域名/IP 不能为空';
    if (!Number.isInteger(dev.port) || dev.port < 1 || dev.port > 65535) return '唤醒端口非法：1-65535';
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(dev.mac)) return 'MAC 非法：需要 12 位十六进制';
  }
  if (dev.checkPorts) {
    const parts = String(dev.checkPorts).split(/[^0-9]+/).filter(Boolean);
    if (!parts.length) return '检查端口格式不对，例如 3389 或 3389,22';
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return `检查端口非法：${p}`;
    }
  }
  return '';
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const dev = {
    id: editingId || 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: $('fName').value.trim(),
    host: $('fHost').value.trim(),
    port: Number($('fPort').value),
    mac: $('fMac').value.trim(),
    secureOn: $('fSecure').value.trim(),
    checkPorts: $('fCheck').value.trim(),
  };
  const err = validate(dev);
  if (err) { showFormError(err); return; }
  if (!dev.name) dev.name = dev.host;

  const devs = loadDevices();
  const i = devs.findIndex((x) => x.id === dev.id);
  if (i >= 0) devs[i] = dev; else devs.push(dev);
  saveDevices(devs);
  term('ok', i >= 0 ? `已更新 ${dev.name}` : `已添加 ${dev.name}`);

  closeForm();
  render();
  if (window.WolNative) checkDevice(dev, true);
});

/* ── MAC 输入：自动大写 + 自动补冒号 ─────── */
function caretForHex(formatted, hexCount) {
  if (hexCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[0-9A-F]/.test(formatted[i])) {
      if (seen === hexCount) return i;
      seen++;
    }
  }
  return formatted.length;
}

function formatMacField(el) {
  const pos = el.selectionStart;
  const hexBefore = el.value.slice(0, pos).toUpperCase().replace(/[^0-9A-F]/g, '').length;
  const raw = el.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
  const formatted = raw.replace(/(.{2})(?=.)/g, '$1:');   // 每两位插一个冒号
  el.value = formatted;
  const caret = caretForHex(formatted, hexBefore);
  el.setSelectionRange(caret, caret);
}

function attachMacInput(el) {
  el.addEventListener('input', () => formatMacField(el));
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace') return;
    const s = el.selectionStart;
    if (s !== el.selectionEnd || s === 0) return;
    if (el.value[s - 1] === ':') {           // 退格撞到冒号时，删掉冒号前那个字符
      e.preventDefault();
      el.value = el.value.slice(0, s - 2) + el.value.slice(s - 1);
      el.setSelectionRange(s - 2, s - 2);
      formatMacField(el);
    }
  });
}

/* ── 事件绑定 ───────────────────────────── */
$('btnAdd').onclick = () => openForm(null);
$('btnClearLog').onclick = () => { $('log').textContent = ''; };
document.querySelectorAll('[data-close]').forEach((el) => { el.onclick = closeForm; });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('sheet').hidden) closeForm();
});
attachMacInput($('fMac'));
attachMacInput($('fSecure'));

/* ── 启动 ───────────────────────────────── */
render();
term('info', 'wol-waker 就绪 · UDP 直发魔术包，无需后端');
if (window.WolNative) {
  term('ok', '原生桥接已连接');
  const devs = loadDevices();
  if (devs.length) {
    term('info', `检查 ${devs.length} 台设备的在线状态…`);
    (async () => {
      for (const d of devs) { await checkDevice(d, true); await sleep(150); }
      term('info', '在线状态检查完成');
    })();
  }
} else {
  term('warn', '未检测到原生桥接：当前为网页预览，打包后才会真发');
}
