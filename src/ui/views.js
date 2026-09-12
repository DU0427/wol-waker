// 各页面视图（设备列表 / 设备详情 / 日志 / 设置）
// 基于 Ionic Framework 组件构建；点击动作统一走全局 Actions
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
  function ion(tag) { return document.createElement(tag); }
  function icon(name, cls) {
    const i = ion('ion-icon');
    i.name = name;
    if (cls) i.className = cls;
    return i;
  }
  function fmtWhen(ts) {
    if (!ts) return '从未';
    const d = new Date(ts);
    const hm = d.toLocaleTimeString('zh-CN', { hour12: false });
    return d.toDateString() === new Date().toDateString()
      ? hm
      : d.toLocaleDateString('zh-CN') + ' ' + hm;
  }
  function setDot(ic, st) {
    ic.color = { online: 'success', waking: 'warning', checking: 'warning', offline: 'medium' }[st] || 'medium';
    ic.name = st === 'online' ? 'ellipse' : 'ellipse-outline';
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

  /* ── 设备列表 ──────────────────────────── */
  function devices() {
    const root = el('div', 'devices-view');
    const devs = Store.list();
    if (!devs.length) {
      const empty = el('div', 'empty');
      const strong = el('strong', null, '还没有设备');
      const span = el('span', null, '添加一台电脑，然后就可以从手机或电脑远程唤醒它。');
      const btn = ion('ion-button');
      btn.className = 'primary-btn';
      btn.onclick = () => Actions.addDevice();
      btn.innerHTML = '<ion-icon name="add" slot="start"></ion-icon>添加设备';
      empty.append(strong, span, btn);
      root.appendChild(empty);
      return root;
    }
    const list = ion('ion-list');
    list.className = 'dev-list';
    list.inset = true;
    devs.forEach((d) => list.appendChild(deviceItem(d)));
    root.appendChild(list);
    return root;
  }

  function deviceItem(d) {
    const st = Actions.state(d.id) || 'unknown';
    const item = ion('ion-item');
    item.className = 'dev-item';

    const dot = icon(st === 'online' ? 'ellipse' : 'ellipse-outline', null);
    dot.slot = 'start';
    dot.dataset.dot = d.id;
    setDot(dot, st);

    const label = ion('ion-label');
    label.appendChild(el('div', 'dev-name', d.name || d.host));
    const p = el('p', null, `${STATUS_LABEL[st]} · ${d.host}:${d.port}`);
    p.dataset.status = d.id;
    label.appendChild(p);
    label.appendChild(el('p', 'dev-mac', d.mac));

    const wake = ion('ion-button');
    wake.className = 'wake-link';
    wake.slot = 'end';
    wake.shape = 'round';
    wake.dataset.wake = d.id;
    wake.innerHTML = '<span class="wake-label">唤醒</span><span class="wake-suffix">电脑</span><ion-icon name="arrow-forward" class="wake-arrow"></ion-icon>';
    wake.onclick = (ev) => { ev.stopPropagation(); Actions.wake(d.id); };

    const more = ion('ion-button');
    more.className = 'more-btn';
    more.slot = 'end';
    more.fill = 'clear';
    more.onclick = (ev) => { ev.stopPropagation(); openMoreMenu(d, more); };
    more.innerHTML = '<ion-icon name="ellipsis-horizontal"></ion-icon>';

    item.append(dot, label, wake, more);
    item.onclick = () => { location.hash = '#/device/' + encodeURIComponent(d.id); };
    return item;
  }

  /* ── 行内更多菜单：检查在线 / 编辑 / 删除 ── */
  function closeMenus() {
    document.querySelectorAll('.row-menu').forEach((m) => m.remove());
  }
  document.addEventListener('click', closeMenus);

  function openMoreMenu(d, anchor) {
    closeMenus();
    const menu = el('div', 'row-menu');
    const item = (label, icName, danger, fn) => {
      const b = el('button', 'menu-item' + (danger ? ' danger' : ''));
      b.innerHTML = `<ion-icon name="${icName}"></ion-icon><span>${label}</span>`;
      b.onclick = (e) => { e.stopPropagation(); closeMenus(); fn(); };
      menu.appendChild(b);
    };
    item('检查在线', 'refresh-outline', false, () => Actions.check(d.id, false));
    item('编辑', 'create-outline', false, () => Actions.edit(d.id));
    item('删除', 'trash-outline', true, () => Actions.remove(d.id));
    document.body.appendChild(menu);

    const r = anchor.getBoundingClientRect();
    const mw = 148, mh = 132;
    let left = r.right - mw;
    if (left < 8) left = 8;
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    setTimeout(() => {
      const closer = (e) => { if (!menu.contains(e.target)) { closeMenus(); document.removeEventListener('click', closer); } };
      document.addEventListener('click', closer);
    }, 0);
  }

  /* ── 设备详情 ──────────────────────────── */
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
    hero.appendChild(el('div', 'detail-host', `${d.host}:${d.port}`));
    const statusLine = el('div', 'detail-status');
    const dot = icon(st === 'online' ? 'ellipse' : 'ellipse-outline', null);
    dot.dataset.dot = id;
    setDot(dot, st);
    const statusText = el('span', 'status-text', STATUS_LABEL[st] || '未检查');
    statusText.dataset.status = id;
    if (st === 'online') statusText.classList.add('online');
    statusLine.append(dot, statusText);
    hero.appendChild(statusLine);

    const wake = ion('ion-button');
    wake.className = 'wake-link';
    wake.shape = 'round';
    wake.dataset.wake = id;
    wake.innerHTML = '<ion-icon name="power" slot="start"></ion-icon><span class="wake-label">唤醒</span><span class="wake-suffix">电脑</span><ion-icon name="arrow-forward" class="wake-arrow"></ion-icon>';
    wake.onclick = () => Actions.wake(id);
    hero.appendChild(wake);

    const infoSec = el('section');
    infoSec.appendChild(el('div', 'section-label', '设备信息'));
    const info = ion('ion-list');
    info.className = 'info-list';
    info.inset = true;
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
    const mkBtn = (label, color, iconName, fn) => {
      const b = ion('ion-button');
      b.fill = 'outline';
      if (color) b.color = color;
      b.innerHTML = `<ion-icon name="${iconName}" slot="start"></ion-icon>${label}`;
      b.onclick = fn;
      actRow.appendChild(b);
    };
    mkBtn('检查在线', 'primary', 'refresh-outline', () => Actions.check(id, false));
    mkBtn('编辑', 'primary', 'create-outline', () => Actions.edit(id));
    mkBtn('删除', 'danger', 'trash-outline', () => Actions.remove(id));
    actSec.appendChild(actRow);

    const logSec = el('section');
    logSec.appendChild(el('div', 'section-label', '本机日志'));
    const box = el('div', 'dlog');
    box.dataset.log = 'device:' + id;
    logSec.appendChild(box);

    root.append(hero, infoSec, actSec, logSec);
    return root;
  }

  function addInfo(list, k, v) {
    const row = ion('ion-item');
    row.className = 'info-row';
    row.appendChild(el('span', 'k', k));
    row.appendChild(el('span', 'v', v));
    list.appendChild(row);
  }

  /* ── 日志页 ────────────────────────────── */
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

  /* ── 设置页 ────────────────────────────── */
  function settings() {
    const root = el('div', 'settings');
    const s = Store.settings();

    // 默认值
    const g1 = el('section', 'set-group');
    g1.appendChild(el('div', 'section-label', '默认值'));
    const l1 = ion('ion-list');
    l1.inset = true;
    l1.appendChild(setRow('默认唤醒端口', '新建设备时自动带入', 'sWakePort', String(s.wakePort || 9), 5));
    l1.appendChild(setRow('默认检查端口', '逗号分隔，留空用 3389,22', 'sCheckPorts', s.checkPorts || '', 24));
    g1.appendChild(l1);
    const saveBtn = ion('ion-button');
    saveBtn.className = 'primary-btn';
    saveBtn.onclick = () => Actions.saveDefaults();
    saveBtn.innerHTML = '保存';
    const saveWrap = el('div', 'set-actions');
    saveWrap.appendChild(saveBtn);
    g1.appendChild(saveWrap);
    root.appendChild(g1);

    // 数据
    const g2 = el('section', 'set-group');
    g2.appendChild(el('div', 'section-label', '数据'));
    const l2 = ion('ion-list');
    l2.inset = true;
    const r2 = ion('ion-item');
    r2.className = 'set-row';
    const k2 = el('div', 'k');
    k2.appendChild(el('b', null, '设备数据'));
    k2.appendChild(el('small', null, '导出 / 导入 JSON，用于备份或换机'));
    const v2 = el('div', 'set-actions');
    const exp = ion('ion-button'); exp.fill = 'outline'; exp.innerHTML = '导出'; exp.onclick = () => Actions.exportData();
    const imp = ion('ion-button'); imp.fill = 'outline'; imp.innerHTML = '导入'; imp.onclick = () => Actions.importData();
    const clr = ion('ion-button'); clr.fill = 'outline'; clr.color = 'danger'; clr.innerHTML = '清空全部'; clr.onclick = () => Actions.removeAll();
    v2.append(exp, imp, clr);
    r2.append(k2, v2);
    l2.appendChild(r2);
    g2.appendChild(l2);
    root.appendChild(g2);

    // 关于
    const g3 = el('section', 'set-group');
    g3.appendChild(el('div', 'section-label', '关于'));
    const l3 = ion('ion-list');
    l3.inset = true;
    l3.appendChild(setRow('工作原理', 'DNS 解析 → UDP 魔术包 → 网卡待机监听开机'));
    l3.appendChild(setRow('数据存储', '全部保存在本机，不上传任何服务器'));
    const r3 = ion('ion-item');
    r3.className = 'set-row';
    const k3 = el('div', 'k');
    k3.appendChild(el('b', null, 'GitHub'));
    k3.appendChild(el('small', null, 'github.com/DU0427/wol-waker'));
    const link = ion('ion-button');
    link.fill = 'clear';
    link.innerHTML = '打开 <ion-icon name="open-outline"></ion-icon>';
    link.onclick = () => { window.open('https://github.com/DU0427/wol-waker', '_blank'); };
    const v3 = el('div', 'set-actions');
    v3.appendChild(link);
    r3.append(k3, v3);
    l3.appendChild(r3);
    g3.appendChild(l3);
    root.appendChild(g3);

    return root;
  }

  function setRow(key, sub, inputId, value, maxlen) {
    const row = ion('ion-item');
    row.className = 'set-row';
    const k = el('div', 'k');
    k.appendChild(el('b', null, key));
    if (sub) k.appendChild(el('small', null, sub));
    row.appendChild(k);
    if (inputId) {
      const input = ion('ion-input');
      input.id = inputId;
      input.value = value || '';
      input.inputmode = 'numeric';
      if (maxlen) input.maxlength = maxlen;
      row.appendChild(input);
    }
    return row;
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