// wol-waker UI：设备管理 + 一键唤醒 + 状态轮询（Windows + Android 共用）
// 真发走 window.WolNative（Electron/Capacitor 注入），无桥接时为演示模式
'use strict';

const $ = (id) => document.getElementById(id);
const LS_KEY = 'wol-waker.devices.v1';
let editingId = null;

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}
function log(msg) {
  const el = $('log');
  el.textContent += `[${now()}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}
function loadDevices() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function saveDevices(devs) {
  localStorage.setItem(LS_KEY, JSON.stringify(devs));
}

function render() {
  const devs = loadDevices();
  const list = $('list');
  list.innerHTML = devs.length ? '' : '<div class="meta">还没有设备，先在下面添加一台。</div>';
  devs.forEach((d) => {
    const card = document.createElement('div');
    card.className = 'dev';
    card.innerHTML =
      `<div class="name"><span class="dot" data-dot="${d.id}"></span>${escapeHtml(d.name || d.host)}</div>` +
      `<div class="meta">${escapeHtml(d.host)}:${d.port} · ${escapeHtml(d.mac)}</div>` +
      `<div class="row"></div>`;
    const row = card.querySelector('.row');

    const wake = document.createElement('button');
    wake.className = 'wake'; wake.textContent = '唤醒';
    wake.onclick = () => wakeDevice(d, wake, card);
    const edit = document.createElement('button');
    edit.className = 'ghost'; edit.textContent = '编辑';
    edit.onclick = () => fillForm(d);
    const del = document.createElement('button');
    del.className = 'ghost'; del.textContent = '删除';
    del.onclick = () => {
      saveDevices(loadDevices().filter((x) => x.id !== d.id));
      log(`已删除 ${d.name || d.host}`);
      render();
    };
    row.append(wake, edit, del);
    list.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fillForm(d) {
  editingId = d.id;
  $('formTitle').textContent = '编辑设备';
  $('fName').value = d.name || '';
  $('fHost').value = d.host || '';
  $('fPort').value = d.port || 9;
  $('fMac').value = d.mac || '';
  $('fSecure').value = d.secureOn || '';
  window.scrollTo({ top: document.getElementById('form').offsetTop - 12, behavior: 'smooth' });
}

async function wakeDevice(d, btn, card) {
  btn.disabled = true;
  const dot = card.querySelector('[data-dot]');
  dot.className = 'dot ing';
  try {
    // 本地先校验（复用核心库）
    const core = window.WolCore;
    if (core) core.validateTarget(d);
    if (!window.WolNative) {
      log(`演示模式：${d.name || d.host} 应发 ${d.host}:${d.port}（未检测到原生桥接，打包后才会真发）`);
    } else {
      const r = await window.WolNative.sendMagicPacket(d);
      log(`已发送 ${r.bytes} 字节 -> ${d.host}(${r.resolvedIp}):${d.port}，第 ${r.attempts} 次成功`);
      pollStatus(d, dot);
    }
    const devs = loadDevices().map((x) => (x.id === d.id ? { ...x, lastWakeAt: Date.now() } : x));
    saveDevices(devs);
  } catch (e) {
    log(`唤醒失败：${e && e.message ? e.message : e}`);
    dot.className = 'dot';
  } finally {
    setTimeout(() => { btn.disabled = false; }, 3000);
  }
}

async function pollStatus(d, dot) {
  if (!window.WolNative) return;
  // 2 分钟内每 5 秒探测一次 3389/22 是否通
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const s = await window.WolNative.checkHost({ host: d.host, tcpPorts: [3389, 22], timeoutMs: 3000 });
      if (s.online) {
        dot.className = 'dot on';
        log(`${d.name || d.host} 已在线（${s.latencyMs}ms）`);
        return;
      }
    } catch { /* 继续轮询 */ }
  }
  dot.className = 'dot';
  log(`${d.name || d.host} 2 分钟内未上线，请检查转发/ARP/电源`);
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const d = {
    id: editingId || 'd' + Date.now().toString(36),
    name: $('fName').value.trim(),
    host: $('fHost').value.trim(),
    port: Number($('fPort').value),
    mac: $('fMac').value.trim(),
    secureOn: $('fSecure').value.trim(),
  };
  try {
    if (window.WolCore) window.WolCore.validateTarget(d);
    if (!d.name) d.name = d.host;
    const devs = loadDevices();
    const i = devs.findIndex((x) => x.id === d.id);
    if (i >= 0) devs[i] = d; else devs.push(d);
    saveDevices(devs);
    log(`已保存 ${d.name}`);
  } catch (err) {
    log(`保存失败：${err.message}`);
    return;
  }
  editingId = null;
  $('formTitle').textContent = '新增设备';
  e.target.reset();
  $('fPort').value = 9;
  render();
});
$('btnReset').onclick = () => {
  editingId = null;
  $('formTitle').textContent = '新增设备';
  $('form').reset();
  $('fPort').value = 9;
};
$('btnClearLog').onclick = () => { $('log').textContent = ''; };

render();
log(window.WolNative ? '原生桥接已就绪，可真发魔术包。' : '当前为网页预览：打包为 Windows/Android 应用后可真发。');
