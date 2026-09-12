// 应用入口：路由、导航、动作、表单（基于 Ionic 组件）
'use strict';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VERSION = 'v0.1.0';

const ST_COLORS = { online: 'success', waking: 'warning', checking: 'warning', offline: 'medium' };

/* ── 动作层：视图通过 Actions 触发 ───────── */
const Actions = (() => {
  const states = {};
  const busy = new Set();

  function state(id) { return states[id] || 'unknown'; }

  function setState(id, s) {
    states[id] = s;
    document.querySelectorAll(`[data-dot="${id}"]`).forEach((ic) => {
      ic.color = ST_COLORS[s] || 'medium';
      ic.name = s === 'online' ? 'ellipse' : 'ellipse-outline';
    });
    document.querySelectorAll(`[data-status="${id}"]`).forEach((n) => {
      n.textContent = (window.STATUS_LABEL || {})[s] || '未检查';
      n.classList.toggle('online', s === 'online');
    });
    applyWakeButtons(id);
  }

  /* 唤醒按钮状态联动 */
  function wakeButtons(id) {
    return Array.from(document.querySelectorAll(`.wake-link[data-wake="${id}"]`));
  }
  function setWakeLabel(btn, text, mode, disabled) {
    const el = btn.querySelector('.wake-label');
    const suffix = btn.querySelector('.wake-suffix');
    if (el) el.textContent = text;
    if (suffix) suffix.style.display = text === '唤醒' ? '' : 'none';
    btn.disabled = !!disabled;
    if (mode === 'is-online' || mode === 'is-waking') {
      btn.fill = 'clear';
      btn.color = 'medium';
    } else {
      btn.fill = 'solid';
      btn.color = 'wake';
    }
  }
  function applyWakeButtons(id, forced) {
    const s = states[id] || 'unknown';
    const cfg = forced
      ? { text: forced, mode: 'is-waking', disabled: true }
      : s === 'online' ? { text: '已在线 ✓', mode: 'is-online', disabled: false }
      : s === 'waking' ? { text: '唤醒中…', mode: 'is-waking', disabled: true }
      : { text: '唤醒', mode: null, disabled: false };
    wakeButtons(id).forEach((b) => setWakeLabel(b, cfg.text, cfg.mode, cfg.disabled));
  }
  function refreshWake(id) { applyWakeButtons(id); }

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

  async function wake(id) {
    const d = Store.get(id);
    if (!d || busy.has(id)) return;
    busy.add(id);
    const label = d.name || d.host;
    try {
      if (!window.WolNative) {
        Log.add('warn', '未检测到原生桥接：当前是网页预览，打包成 Windows/安卓应用后才会真发', id);
        setState(id, 'unknown');
        return;
      }
      if (window.WolCore) window.WolCore.validateTarget(d);
      setState(id, 'waking');
      Log.add('net', `发送魔术包 → ${d.host}:${d.port}`, id);
      const r = await window.WolNative.sendMagicPacket({
        host: d.host, port: d.port, mac: d.mac, secureOn: d.secureOn || undefined,
      });
      Log.add('ok', `已发送唤醒请求 → ${r.resolvedIp}:${d.port}（${r.bytes} 字节，第 ${r.attempts} 次成功）`, id);
      Store.touchWake(id);

      // 成功反馈：已唤醒 ✓（2 秒后恢复正常）
      wakeButtons(id).forEach((b) => setWakeLabel(b, '已唤醒 ✓', 'is-success', false));
      await sleep(2000);
      applyWakeButtons(id, '等待上线…');

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
      Log.add('err', `无法发送唤醒请求：${e && e.message ? e.message : e}`, id);
    } finally {
      busy.delete(id);
      applyWakeButtons(id);
    }
  }

  function addDevice() { openForm(null); }
  function edit(id) { openForm(Store.get(id)); }

  function confirmDialog(header, message, dangerText) {
    return new Promise((resolve) => {
      const a = document.createElement('ion-alert');
      a.header = header;
      a.message = message;
      a.buttons = [
        { text: '取消', role: 'cancel', handler: () => resolve(false) },
        { text: dangerText || '确定', role: dangerText ? 'destructive' : 'confirm', handler: () => resolve(true) },
      ];
      document.body.appendChild(a);
      a.present();
    });
  }

  async function remove(id) {
    const d = Store.get(id);
    if (!d) return;
    const ok = await confirmDialog('删除设备', `确定删除「${d.name || d.host}」？此操作不可恢复。`, '删除');
    if (!ok) return;
    Store.remove(id);
    Log.add('info', `已删除 ${d.name || d.host}`);
    if (parseHash().name === 'device') location.hash = '#/devices';
    else render();
  }

  async function removeAll() {
    if (!Store.list().length) { Log.add('info', '当前没有设备'); return; }
    const ok = await confirmDialog('清空全部设备', '将删除所有设备，此操作不可恢复。', '清空');
    if (!ok) return;
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
    const raw = String($('sCheckPorts').value || '').trim();
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
    dataModal('导出设备数据', JSON.stringify(Store.list(), null, 2), null);
  }

  function importData() {
    dataModal('导入设备数据', '', (text) => {
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

  return { state, refreshWake, wake, check, edit, addDevice, remove, removeAll, saveDefaults, exportData, importData };
})();

/* ── 数据弹窗（导出 / 导入 JSON） ───────── */
function dataModal(title, initial, onSave) {
  const modal = document.createElement('ion-modal');
  modal.innerHTML =
    '<ion-header><ion-toolbar>' +
      '<ion-buttons slot="start"><ion-button fill="clear" data-close>取消</ion-button></ion-buttons>' +
      '<ion-title>' + title + '</ion-title>' +
      '<ion-buttons slot="end"><ion-button fill="solid" data-save>' + (onSave ? '导入' : '复制') + '</ion-button></ion-buttons>' +
    '</ion-toolbar></ion-header>' +
    '<ion-content class="ion-padding">' +
      '<ion-textarea id="dataArea" rows="14" class="codearea" spellcheck="false"' + (onSave ? ' placeholder="在此粘贴 JSON…"' : '') + '></ion-textarea>' +
    '</ion-content>';
  document.body.appendChild(modal);
  const area = modal.querySelector('#dataArea');
  area.value = initial || '';
  modal.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.dismiss(); });
  const save = modal.querySelector('[data-save]');
  if (onSave) {
    save.onclick = () => { onSave(area.value); modal.dismiss(); };
  } else {
    save.onclick = () => {
      area.getInputElement().then((inp) => {
        inp.select();
        document.execCommand('copy');
        save.innerHTML = '已复制';
      }).catch(() => { save.innerHTML = '手动复制'; });
    };
  }
  modal.present();
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
  const inner = $('viewInner');
  inner.textContent = '';

  $('btnBack').hidden = r.name !== 'device';
  $('pageTitle').textContent = TITLES[r.name] || '设备';

  const acts = $('topbarActions');
  acts.textContent = '';
  if (r.name === 'devices') {
    const add = document.createElement('ion-button');
    add.fill = 'clear';
    add.title = '添加设备';
    add.innerHTML = '<ion-icon name="add" slot="icon-only"></ion-icon>';
    add.onclick = () => openForm(null);
    acts.appendChild(add);
  } else if (r.name === 'logs') {
    const clr = document.createElement('ion-button');
    clr.fill = 'clear';
    clr.innerHTML = '清空';
    clr.onclick = () => Log.clear();
    acts.appendChild(clr);
  }

  const key = r.name === 'device' ? 'devices' : r.name;
  document.querySelectorAll('.nav-item[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
  document.querySelectorAll('ion-tab-button[data-nav]').forEach((t) => { t.selected = t.dataset.nav === key; });

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

  document.querySelectorAll('[data-log]').forEach((c) => Views.renderLogInto(c));
  const content = document.querySelector('.view');
  if (content && content.scrollToTop) content.scrollToTop();

  // 元素已入 DOM 后刷新唤醒按钮初始状态
  if (r.name === 'device') Actions.refreshWake(r.id);
  else if (r.name === 'devices') Store.list().forEach((d) => Actions.refreshWake(d.id));
}

/* ── 设备表单（ion-modal） ──────────────── */
let editingId = null;

function openForm(d) {
  editingId = d ? d.id : null;
  const s = Store.settings();
  $('formTitle').textContent = d ? '编辑设备' : '添加设备';
  $('fName').value = d ? (d.name || '') : '';
  $('fHost').value = d ? d.host : '';
  $('fPort').value = String(d ? d.port : s.wakePort);
  $('fCheck').value = d ? (d.checkPorts || '') : s.checkPorts;
  $('fMac').value = d ? d.mac : '';
  $('fSecure').value = d ? (d.secureOn || '') : '';
  hideFormError();
  $('formModal').present();
  setTimeout(() => { (d ? $('fHost') : $('fName')).setFocus(); }, 250);
}

function closeForm() {
  $('formModal').dismiss();
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

function saveDevice() {
  const dev = {
    id: editingId || Store.newId(),
    name: String($('fName').value || '').trim(),
    host: String($('fHost').value || '').trim(),
    port: Number($('fPort').value),
    mac: String($('fMac').value || '').trim(),
    secureOn: String($('fSecure').value || '').trim(),
    checkPorts: String($('fCheck').value || '').trim(),
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
}

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

function attachMacInput(el) {
  el.addEventListener('ionInput', () => {
    const inner = el.querySelector('input');
    const pos = inner ? inner.selectionStart : String(el.value).length;
    const hexBefore = String(el.value).slice(0, pos).toUpperCase().replace(/[^0-9A-F]/g, '').length;
    const raw = String(el.value).toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
    const formatted = raw.replace(/(.{2})(?=.)/g, '$1:');
    el.value = formatted;
    const caret = caretForHex(formatted, hexBefore);
    if (inner) { try { inner.setSelectionRange(caret, caret); } catch (e) { /* ignore */ } }
  });
}

/* ── 事件绑定 ───────────────────────────── */
$('btnBack').onclick = () => { location.hash = '#/devices'; };
$('btnSave').onclick = saveDevice;
$('btnCancel').onclick = closeForm;
attachMacInput($('fMac'));
attachMacInput($('fSecure'));
Log.onChange(() => { document.querySelectorAll('[data-log]').forEach((c) => Views.renderLogInto(c)); });
window.addEventListener('hashchange', render);

/* ── 启动 ───────────────────────────────── */
$('versionFoot').textContent = VERSION;
if (!location.hash) location.hash = '#/devices';
render();

Log.add('info', 'wol-waker 就绪 · UDP 直发魔术包，无需后端');
// 等 Ionic 完全水合后，确保唤醒按钮状态正确
setTimeout(() => { Store.list().forEach((d) => Actions.refreshWake(d.id)); }, 800);
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