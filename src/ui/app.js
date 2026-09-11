// 应用入口：路由、导航、动作、表单
'use strict';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VERSION = 'v0.1.0';

/* ── 动作层：视图通过 Actions 触发 ───────── */
const Actions = (() => {
  const states = {};
  const busy = new Set();

  function state(id) { return states[id] || 'unknown'; }

  function setState(id, s) {
    states[id] = s;
    document.querySelectorAll(`.dot[data-dot="${id}"]`).forEach((dot) => { dot.dataset.state = s; });
    document.querySelectorAll(`[data-status="${id}"]`).forEach((n) => {
      n.dataset.state = s;
      n.textContent = (window.STATUS_LABEL || {})[s] || '未检查';
    });
    document.querySelectorAll(`.dev-row[data-id="${id}"]`).forEach((c) => c.classList.toggle('is-online', s === 'online'));
    const btn = document.querySelector('.wake-btn');
    if (btn) btn.classList.toggle('waking', s === 'waking');
  }

  async function safeCheck(host, ports) {
    if (!window.WolNative) return null;
    try { return await window.WolNative.checkHost({ host, tcpPorts: ports, timeoutMs: 3000 }); }
    catch { return null; }
  }

  async function check(id, silent) {
    const d = Store.get(id);
    if (!d) return false;
    const label = d.name || d.host;
    const ports = Store.parsePorts(d.checkPorts);
    if (!window.WolNative) {
      if (!silent) Log.add('warn', '未检测到原生桥接，无法检查在线状态', id);
      return false;
    }
    setState(id, 'checking');
    if (!silent) Log.add('info', `检查 ${d.host} 的端口 ${ports.join(', ')} …`, id);
    const res = await safeCheck(d.host, ports);
    if (res && res.online) {
      setState(id, 'online');
      if (!silent) Log.add('ok', `${label} 在线（${res.latencyMs}ms）`, id);
      return true;
    }
    setState(id, 'offline');
    if (!silent) Log.add('warn', `${label} 无响应（已试端口 ${ports.join(', ')}）`, id);
    return false;
  }

  async function wake(id, btn) {
    const d = Store.get(id);
    if (!d || busy.has(id)) return;
    busy.add(id);
    const label = d.name || d.host;
    const original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
    try {
      if (!window.WolNative) {
        Log.add('warn', '未检测到原生桥接：当前是网页预览，打包成 Windows/安卓应用后才会真发', id);
        return;
      }
      if (window.WolCore) window.WolCore.validateTarget(d);
      setState(id, 'waking');
      Log.add('net', `发送魔术包 → ${d.host}:${d.port}`, id);
      const r = await window.WolNative.sendMagicPacket({
        host: d.host, port: d.port, mac: d.mac, secureOn: d.secureOn || undefined,
      });
      Log.add('ok', `已发送 ${r.bytes} 字节 → ${r.resolvedIp}:${d.port}（第 ${r.attempts} 次成功）`, id);
      Store.touchWake(id);
      if (btn) btn.textContent = '等待上线…';

      const ports = Store.parsePorts(d.checkPorts);
      for (let i = 0; i < 24; i++) {
        await sleep(5000);
        const res = await safeCheck(d.host, ports);
        if (res && res.online) {
          setState(id, 'online');
          Log.add('ok', `${label} 已上线（${res.latencyMs}ms）`, id);
          return;
        }
      }
      setState(id, 'offline');
      Log.add('warn', `${label} 2 分钟内未上线：检查端口转发 / 静态 ARP / BIOS 与网卡唤醒设置`, id);
    } catch (e) {
      setState(id, 'offline');
      Log.add('err', `唤醒失败：${e && e.message ? e.message : e}`, id);
    } finally {
      busy.delete(id);
      if (btn) { btn.disabled = false; btn.textContent = original; }
    }
  }

  function edit(id) { openForm(Store.get(id)); }

  function remove(id) {
    const d = Store.get(id);
    if (!d) return;
    if (!window.confirm(`删除「${d.name || d.host}」？`)) return;
    Store.remove(id);
    Log.add('info', `已删除 ${d.name || d.host}`);
    if (parseHash().name === 'device') location.hash = '#/devices';
    else render();
  }

  function removeAll() {
    if (!Store.list().length) { Log.add('info', '当前没有设备'); return; }
    if (!window.confirm('清空全部设备？此操作不可恢复')) return;
    Store.save([]);
    Log.add('info', '已清空全部设备');
    if (parseHash().name === 'device') location.hash = '#/devices';
    else render();
  }

  function saveDefaults() {
    const s = Store.settings();
    const wakePort = Number($('sWakePort').value);
    if (!Number.isInteger(wakePort) || wakePort < 1 || wakePort > 65535) {
      Log.add('err', '默认唤醒端口非法：1-65535');
      return;
    }
    const raw = $('sCheckPorts').value.trim();
    if (raw) {
      for (const p of raw.split(/[^0-9]+/).filter(Boolean)) {
        const n = Number(p);
        if (!Number.isInteger(n) || n < 1 || n > 65535) { Log.add('err', `默认检查端口非法：${p}`); return; }
      }
    }
    s.wakePort = wakePort;
    s.checkPorts = raw;
    Store.saveSettings(s);
    Log.add('ok', `已保存默认值：唤醒端口 ${wakePort}，检查端口 ${raw || '3389,22'}`);
  }

  function exportData() {
    const json = JSON.stringify(Store.list(), null, 2);
    openDataSheet('导出设备数据', json, null);
  }

  function importData() {
    openDataSheet('导入设备数据', '', (text) => {
      let arr;
      try { arr = JSON.parse(text); }
      catch { Log.add('err', '导入失败：JSON 格式错误'); return; }
      if (!Array.isArray(arr)) { Log.add('err', '导入失败：顶层必须是数组'); return; }
      const valid = [];
      for (const d of arr) {
        if (!d || typeof d !== 'object' || !d.host || !d.mac) continue;
        valid.push({
          id: d.id || Store.newId(),
          name: d.name || d.host,
          host: String(d.host),
          port: Number(d.port) || 9,
          mac: String(d.mac).toUpperCase(),
          secureOn: d.secureOn || '',
          checkPorts: d.checkPorts || '',
          lastWakeAt: d.lastWakeAt || undefined,
        });
      }
      if (!valid.length) { Log.add('err', '导入失败：没有可用设备（需要 host 和 mac）'); return; }
      Store.save(valid);
      Log.add('ok', `已导入 ${valid.length} 台设备`);
      if (parseHash().name === 'device') location.hash = '#/devices';
      else render();
    });
  }

  return { state, wake, check, edit, remove, removeAll, saveDefaults, exportData, importData };
})();

/* ── 通用数据弹窗（导出/导入 JSON） ─────── */
function openDataSheet(title, initial, onSave) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML =
    '<div class="backdrop" data-close></div>' +
    '<div class="sheet-card">' +
      '<div class="sheet-head"><h2></h2><button type="button" class="icon-btn" data-close aria-label="关闭">' +
        '<svg class="i"><use href="#i-x"/></svg></button></div>' +
      '<div class="sheet-body"><textarea class="codearea" spellcheck="false"></textarea></div>' +
      '<div class="sheet-foot"><button type="button" class="ghost-btn" data-close>关闭</button>' +
        '<button type="button" class="primary-btn" data-save></button></div>' +
    '</div>';
  sheet.querySelector('h2').textContent = title;
  const ta = sheet.querySelector('textarea');
  ta.value = initial || '';
  if (!onSave) { ta.readOnly = true; ta.placeholder = '（无数据）'; }
  else ta.placeholder = '在此粘贴 JSON…';

  const saveBtn = sheet.querySelector('[data-save]');
  saveBtn.textContent = onSave ? '导入' : '复制';
  sheet.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => sheet.remove(); });

  if (onSave) {
    saveBtn.onclick = () => { onSave(ta.value); sheet.remove(); };
  } else {
    saveBtn.onclick = () => {
      ta.focus(); ta.select();
      try { document.execCommand('copy'); saveBtn.textContent = '已复制'; }
      catch { saveBtn.textContent = '请手动复制'; }
    };
  }
  document.body.appendChild(sheet);
  setTimeout(() => ta.focus(), 60);
}

/* ── 路由 ───────────────────────────────── */
function parseHash() {
  const h = location.hash || '#/devices';
  let m;
  if ((m = h.match(/^#\/device\/([^/?]+)/))) return { name: 'device', id: decodeURIComponent(m[1]) };
  if (h.startsWith('#/logs')) return { name: 'logs' };
  if (h.startsWith('#/settings')) return { name: 'settings' };
  return { name: 'devices' };
}

const TITLES = { devices: '设备', device: '设备详情', logs: '日志', settings: '设置' };

function render() {
  const r = parseHash();
  const view = $('view');
  view.textContent = '';

  $('btnBack').hidden = r.name !== 'device';
  $('pageTitle').textContent = TITLES[r.name] || '设备';

  const acts = $('topbarActions');
  acts.textContent = '';
  if (r.name === 'devices') {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'icon-btn accent';
    add.title = '添加设备';
    add.setAttribute('aria-label', '添加设备');
    add.innerHTML = '<svg class="i"><use href="#i-plus"/></svg>';
    add.onclick = () => openForm(null);
    acts.appendChild(add);
  } else if (r.name === 'logs') {
    const clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'ghost-btn sm';
    clr.textContent = '清空';
    clr.onclick = () => Log.clear();
    acts.appendChild(clr);
  }

  const key = r.name === 'device' ? 'devices' : r.name;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));

  const inner = document.createElement('div');
  inner.className = 'view-inner';
  if (r.name === 'device') {
    if (!Store.get(r.id)) { location.hash = '#/devices'; return; }
    inner.appendChild(Views.deviceDetail(r.id));
  } else if (r.name === 'logs') {
    inner.appendChild(Views.logs());
  } else if (r.name === 'settings') {
    inner.appendChild(Views.settings());
  } else {
    inner.appendChild(Views.devices());
  }
  view.appendChild(inner);

  document.querySelectorAll('[data-log]').forEach((c) => Views.renderLogInto(c));
  view.scrollTop = 0;
}

/* ── 设备表单 ───────────────────────────── */
let editingId = null;

function openForm(d) {
  editingId = d ? d.id : null;
  const s = Store.settings();
  $('formTitle').textContent = d ? '编辑设备' : '添加设备';
  $('fName').value = d ? (d.name || '') : '';
  $('fHost').value = d ? d.host : '';
  $('fPort').value = d ? d.port : s.wakePort;
  $('fCheck').value = d ? (d.checkPorts || '') : s.checkPorts;
  $('fMac').value = d ? d.mac : '';
  $('fSecure').value = d ? (d.secureOn || '') : '';
  hideFormError();
  $('sheet').hidden = false;
  setTimeout(() => { (d ? $('fHost') : $('fName')).focus(); }, 60);
}

function closeForm() {
  $('sheet').hidden = true;
  editingId = null;
}

function showFormError(msg) {
  const e = $('formError');
  e.textContent = msg;
  e.hidden = false;
}
function hideFormError() {
  const e = $('formError');
  e.hidden = true;
  e.textContent = '';
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
    id: editingId || Store.newId(),
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

  const existed = !!Store.get(dev.id);
  Store.upsert(dev);
  Log.add('ok', existed ? `已更新 ${dev.name}` : `已添加 ${dev.name}`, dev.id);
  closeForm();
  render();
  if (window.WolNative) Actions.check(dev.id, true);
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
  const formatted = raw.replace(/(.{2})(?=.)/g, '$1:');
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
    if (el.value[s - 1] === ':') {
      e.preventDefault();
      el.value = el.value.slice(0, s - 2) + el.value.slice(s - 1);
      el.setSelectionRange(s - 2, s - 2);
      formatMacField(el);
    }
  });
}

/* ── 事件绑定 ───────────────────────────── */
$('btnBack').onclick = () => { location.hash = '#/devices'; };
document.querySelectorAll('[data-close]').forEach((el) => { el.onclick = closeForm; });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('sheet').hidden) closeForm();
});
attachMacInput($('fMac'));
attachMacInput($('fSecure'));
Log.onChange(() => { document.querySelectorAll('[data-log]').forEach((c) => Views.renderLogInto(c)); });
window.addEventListener('hashchange', render);

/* ── 启动 ───────────────────────────────── */
$('versionFoot').textContent = VERSION;
if (!location.hash) location.hash = '#/devices';
render();

Log.add('info', 'wol-waker 就绪 · UDP 直发魔术包，无需后端');
if (window.WolNative) {
  Log.add('ok', '原生桥接已连接');
  const devs = Store.list();
  if (devs.length) {
    Log.add('info', `检查 ${devs.length} 台设备的在线状态…`);
    (async () => {
      for (const d of devs) { await Actions.check(d.id, true); await sleep(150); }
      Log.add('info', '在线状态检查完成');
    })();
  }
} else {
  Log.add('warn', '未检测到原生桥接：当前为网页预览，打包后才会真发');
}