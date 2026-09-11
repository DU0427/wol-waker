// 各页面视图（设备列表 / 设备详情 / 日志 / 设置）
// 点击动作统一走全局 Actions（在 app.js 中定义）
'use strict';

// 设备状态 → 中文文案（app.js 的 setState 也会用）
var STATUS_LABEL = {
  unknown: '未检查',
  offline: '离线',
  checking: '检查中…',
  waking: '唤醒中…',
  online: '在线',
};

const Views = (() => {
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function svgUse(symbol) { return `<svg class="i"><use href="#${symbol}"/></svg>`; }
  function iconBtn(symbol, label, onClick, cls) {
    const b = el('button', 'icon-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = svgUse(symbol);
    b.onclick = onClick;
    return b;
  }
  function ghost(text, onClick, extra) {
    const b = el('button', 'ghost-btn' + (extra ? ' ' + extra : ''), text);
    b.type = 'button';
    b.onclick = onClick;
    return b;
  }
  function addInfo(list, k, v) {
    const row = el('div', 'info-row');
    row.append(el('span', 'k', k), el('span', 'v', v));
    list.appendChild(row);
  }
  function fmtWhen(ts) {
    if (!ts) return '从未';
    const d = new Date(ts);
    const hm = d.toLocaleTimeString('zh-CN', { hour12: false });
    return d.toDateString() === new Date().toDateString()
      ? hm
      : d.toLocaleDateString('zh-CN') + ' ' + hm;
  }
  function renderTermLines(container, entries) {
    container.textContent = '';
    entries.forEach((e) => {
      const line = el('div', 'term-line ' + (e.level || 'info'));
      line.append(
        el('span', 't', new Date(e.t).toLocaleTimeString('zh-CN', { hour12: false })),
        el('span', 'lv', (e.level || 'info').toUpperCase()),
        el('span', 'msg', e.msg),
      );
      container.appendChild(line);
    });
    container.scrollTop = container.scrollHeight;
  }

  /* ── 设备列表：横向列表行 ──────────────── */
  function devices() {
    const root = el('div', 'devices-view');
    const devs = Store.list();
    if (!devs.length) {
      const empty = el('div', 'empty');
      empty.innerHTML = '<strong>还没有设备</strong><span>点右上角 + 添加第一台电脑</span>';
      root.appendChild(empty);
      return root;
    }
    const list = el('div', 'dev-list');
    devs.forEach((d) => list.appendChild(deviceRow(d)));
    root.appendChild(list);
    return root;
  }

  function deviceRow(d) {
    const st = Actions.state(d.id) || 'unknown';
    const row = el('div', 'dev-row');
    row.dataset.id = d.id;
    if (st === 'online') row.classList.add('is-online');

    // 左：状态 + 名称 + 状态文案
    const id = el('div', 'dev-id');
    const dot = el('span', 'dot');
    dot.dataset.dot = d.id;
    dot.dataset.state = st;
    const idText = el('div', 'dev-id-text');
    idText.appendChild(el('span', 'dev-name', d.name || d.host));
    const status = el('span', 'dev-status', STATUS_LABEL[st] || '未检查');
    status.dataset.status = d.id;
    status.dataset.state = st;
    idText.appendChild(status);
    id.append(dot, idText);

    // 中：辅助信息，低对比度
    const detail = el('div', 'dev-detail');
    detail.appendChild(el('span', 'dev-addr', d.host + ':' + d.port));
    detail.appendChild(el('span', 'dev-sub', d.mac));

    // 右：轻量操作
    const actions = el('div', 'dev-actions');
    const wake = el('button', 'wake-link');
    wake.type = 'button';
    wake.dataset.wake = d.id;
    wake.innerHTML = '<span class="wake-label">唤醒</span><span class="wake-suffix">电脑</span><svg class="i wake-arrow"><use href="#i-arrow"/></svg>';
    wake.onclick = (ev) => { ev.stopPropagation(); Actions.wake(d.id); };
    const edit = iconBtn('i-pencil', '编辑', (ev) => { ev.stopPropagation(); Actions.edit(d.id); });
    actions.append(wake, edit);

    row.append(id, detail, actions);
    row.onclick = () => { location.hash = '#/device/' + encodeURIComponent(d.id); };
    Actions.refreshWake(d.id);
    return row;
  }

  /* ── 设备详情 ─────────────────────────── */
  function deviceDetail(id) {
    const root = el('div', 'detail');
    const d = Store.get(id);
    if (!d) {
      root.appendChild(el('div', 'empty', '设备不存在或已被删除'));
      return root;
    }
    const st = Actions.state(id) || 'unknown';

    const hero = el('header', 'detail-hero');
    hero.appendChild(el('h2', 'detail-name', d.name || d.host));
    hero.appendChild(el('div', 'detail-host', d.host + ':' + d.port));
    const statusLine = el('div', 'detail-status');
    statusLine.dataset.state = st;
    const dot = el('span', 'dot');
    dot.dataset.dot = id;
    dot.dataset.state = st;
    const statusText = el('span', 'status-text', STATUS_LABEL[st] || '未检查');
    statusText.dataset.status = id;
    statusText.dataset.state = st;
    statusLine.append(dot, statusText);
    hero.appendChild(statusLine);

    const wake = el('button', 'wake-link lg');
    wake.type = 'button';
    wake.dataset.wake = id;
    wake.innerHTML = svgUse('i-power') + '<span class="wake-label">唤醒</span><span class="wake-suffix">电脑</span><svg class="i wake-arrow"><use href="#i-arrow"/></svg>';
    if (st === 'waking') wake.classList.add('is-waking');
    wake.onclick = () => Actions.wake(id);
    hero.appendChild(wake);

    const infoSec = el('section');
    infoSec.appendChild(el('div', 'section-label', '设备信息'));
    const info = el('div', 'info-list');
    addInfo(info, '域名 / IP', d.host);
    addInfo(info, '唤醒端口', String(d.port));
    addInfo(info, 'MAC 地址', d.mac);
    addInfo(info, '检查端口', Store.parsePorts(d.checkPorts).join(', '));
    addInfo(info, 'SecureOn', d.secureOn || '未设置');
    addInfo(info, '上次唤醒', fmtWhen(d.lastWakeAt));
    infoSec.appendChild(info);

    const actSec = el('section');
    actSec.appendChild(el('div', 'section-label', '操作'));
    const actRow = el('div', 'action-row');
    actRow.append(
      ghost('检查在线', () => Actions.check(id, false)),
      ghost('编辑', () => Actions.edit(id)),
      ghost('删除', () => Actions.remove(id), 'danger'),
    );
    actSec.appendChild(actRow);

    const logSec = el('section');
    logSec.appendChild(el('div', 'section-label', '本机日志'));
    const box = el('div', 'dlog');
    box.dataset.log = 'device:' + id;
    logSec.appendChild(box);

    root.append(hero, infoSec, actSec, logSec);
    Actions.refreshWake(id);
    return root;
  }

  /* ── 日志页 ───────────────────────────── */
  function logs() {
    const root = el('div', 'logs-page');
    const bar = el('div', 'term-bar');
    bar.appendChild(el('div', 'section-label', '全部日志'));

    const term = el('div', 'terminal');
    term.dataset.log = 'all';

    const filters = el('div', 'term-filter');
    ['all', 'info', 'warn', 'err', 'net'].forEach((f) => {
      const chip = el('button', 'chip' + (f === 'all' ? ' active' : ''), f.toUpperCase());
      chip.type = 'button';
      chip.onclick = () => {
        filters.querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
        chip.classList.add('active');
        term.dataset.log = f;
        renderLogInto(term);
      };
      filters.appendChild(chip);
    });
    bar.appendChild(filters);

    root.append(bar, term);
    return root;
  }

  /* ── 设置页 ───────────────────────────── */
  function setRow(key, sub, control) {
    const row = el('div', 'set-row');
    const k = el('div', 'k');
    k.appendChild(el('b', null, key));
    if (sub) k.appendChild(el('small', null, sub));
    row.appendChild(k);
    if (control) {
      const v = el('div', 'v');
      v.appendChild(control);
      row.appendChild(v);
    }
    return row;
  }
  function setInput(id, value, maxlen) {
    const i = el('input');
    i.id = id;
    i.type = 'text';
    i.value = value;
    i.inputMode = 'numeric';
    i.spellcheck = false;
    if (maxlen) i.maxLength = maxlen;
    return i;
  }

  function settings() {
    const root = el('div', 'settings');
    const s = Store.settings();

    const sec1 = el('section');
    sec1.appendChild(el('div', 'section-label', '默认值'));
    sec1.appendChild(setRow('默认唤醒端口', '新建设备时自动带入', setInput('sWakePort', String(s.wakePort || 9), 5)));
    sec1.appendChild(setRow('默认检查端口', '逗号分隔，留空用 3389,22', setInput('sCheckPorts', s.checkPorts || '', 24)));
    const saveBtn = el('button', 'primary-btn', '保存');
    saveBtn.type = 'button';
    saveBtn.onclick = () => Actions.saveDefaults();
    const r1 = el('div', 'set-row');
    const v1 = el('div', 'v');
    v1.appendChild(saveBtn);
    r1.append(el('div', 'k'), v1);
    sec1.appendChild(r1);

    const sec2 = el('section');
    sec2.appendChild(el('div', 'section-label', '数据'));
    const r2 = el('div', 'set-row');
    const k2 = el('div', 'k');
    k2.appendChild(el('b', null, '设备数据'));
    k2.appendChild(el('small', null, '导出/导入 JSON，用于备份或换机'));
    const v2 = el('div', 'v');
    v2.append(
      ghost('导出', () => Actions.exportData()),
      ghost('导入', () => Actions.importData()),
      ghost('清空全部', () => Actions.removeAll(), 'danger'),
    );
    r2.append(k2, v2);
    sec2.appendChild(r2);

    const sec3 = el('section');
    sec3.appendChild(el('div', 'section-label', '关于'));
    sec3.appendChild(setRow('工作原理', 'DNS 解析 → UDP 魔术包 → 网卡待机监听开机'));
    sec3.appendChild(setRow('数据存储', '全部保存在本机，不上传任何服务器'));
    const link = el('a', 'ghost-btn', '打开仓库');
    link.href = 'https://github.com/DU0427/wol-waker';
    link.target = '_blank';
    link.rel = 'noopener';
    const r3 = el('div', 'set-row');
    const k3 = el('div', 'k');
    k3.appendChild(el('b', null, 'GitHub'));
    k3.appendChild(el('small', null, 'github.com/DU0427/wol-waker'));
    const v3 = el('div', 'v');
    v3.appendChild(link);
    r3.append(k3, v3);
    sec3.appendChild(r3);

    root.append(sec1, sec2, sec3);
    return root;
  }

  /* 日志容器重绘：data-log = all | info | warn | err | net | device:<id> */
  function renderLogInto(container) {
    const mode = container.dataset.log || 'all';
    let entries = Log.all();
    if (mode.startsWith('device:')) {
      const did = mode.slice(7);
      entries = entries.filter((e) => e.deviceId === did);
    } else if (mode !== 'all') {
      entries = entries.filter((e) => e.level === mode);
    }
    renderTermLines(container, entries);
  }

  return { devices, deviceDetail, logs, settings, renderLogInto };
})();