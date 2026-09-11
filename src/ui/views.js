// 各页面视图（设备列表 / 设备详情 / 日志 / 设置）
// 点击动作统一走全局 Actions（在 app.js 中定义）
'use strict';

const Views = (() => {
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function svgUse(symbol) { return `<svg class="i"><use href="#${symbol}"/></svg>`; }
  function iconBtn(symbol, label, onClick, cls) {
    const b = el('button', 'icon-btn sm' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = svgUse(symbol);
    b.onclick = onClick;
    return b;
  }
  function ghost(text, onClick) {
    const b = el('button', 'ghost-btn', text);
    b.type = 'button';
    b.onclick = onClick;
    return b;
  }
  function addMeta(dl, k, v) {
    const dt = el('dt', null, k);
    const dd = el('dd', null, v);
    dd.title = v;
    dl.append(dt, dd);
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

  /* ── 设备列表 ─────────────────────────── */
  function devices() {
    const root = el('div', 'devices-view');
    const devs = Store.list();
    if (!devs.length) {
      const empty = el('div', 'empty');
      empty.innerHTML = '<strong>还没有设备</strong><span>点右上角 + 添加第一台电脑</span>';
      root.appendChild(empty);
      return root;
    }
    const grid = el('div', 'dev-grid');
    devs.forEach((d) => grid.appendChild(deviceCard(d)));
    root.appendChild(grid);
    return root;
  }

  function deviceCard(d) {
    const card = el('article', 'dev');
    card.dataset.id = d.id;
    const st = Actions.state(d.id) || 'unknown';
    if (st === 'online') card.classList.add('is-online');

    const top = el('div', 'dev-top');
    const dot = el('span', 'dot');
    dot.dataset.dot = d.id;
    dot.dataset.state = st;
    const name = el('h3', 'dev-name', d.name || d.host);
    top.append(dot, name, iconBtn('i-pencil', '编辑', (ev) => { ev.stopPropagation(); Actions.edit(d.id); }));

    const meta = el('dl', 'dev-meta');
    addMeta(meta, '地址', d.host + ':' + d.port);
    addMeta(meta, 'MAC', d.mac);
    addMeta(meta, '检查', Store.parsePorts(d.checkPorts).join(', '));

    const actions = el('div', 'dev-actions');
    const wake = el('button', 'primary-btn', '唤醒');
    wake.type = 'button';
    wake.onclick = (ev) => { ev.stopPropagation(); Actions.wake(d.id, wake); };
    actions.appendChild(wake);

    card.append(top, meta, actions);
    card.onclick = () => { location.hash = '#/device/' + encodeURIComponent(d.id); };
    return card;
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

    const hero = el('div', 'panel hero');
    const dot = el('span', 'dot big-dot');
    dot.dataset.dot = id;
    dot.dataset.state = st;
    hero.append(dot, el('h2', null, d.name || d.host), el('div', 'host', d.host + ':' + d.port));

    const orb = el('button', 'wake-orb');
    orb.type = 'button';
    orb.innerHTML = svgUse('i-power') + '<span class="txt">唤醒</span>';
    if (st === 'waking') orb.classList.add('waking');
    orb.onclick = () => Actions.wake(id, orb);
    hero.appendChild(orb);

    const info = el('div', 'panel info-list');
    addInfo(info, '域名 / IP', d.host);
    addInfo(info, '唤醒端口', String(d.port));
    addInfo(info, 'MAC', d.mac);
    addInfo(info, '检查端口', Store.parsePorts(d.checkPorts).join(', '));
    addInfo(info, 'SecureOn', d.secureOn || '未设置');
    addInfo(info, '上次唤醒', fmtWhen(d.lastWakeAt));

    const act = el('div', 'detail-actions');
    act.append(
      ghost('检查在线', () => Actions.check(id, false)),
      ghost('编辑', () => Actions.edit(id)),
      ghost('删除', () => Actions.remove(id)),
    );

    const logPanel = el('div', 'panel');
    const head = el('div', 'panel-head');
    head.appendChild(el('h2', null, '本机日志'));
    const box = el('div', 'dlog');
    box.dataset.log = 'device:' + id;
    logPanel.append(head, box);

    root.append(hero, info, act, logPanel);
    return root;
  }

  /* ── 日志页 ───────────────────────────── */
  function logs() {
    const root = el('div', 'logs-page');
    const bar = el('div', 'panel-head');
    bar.appendChild(el('h2', null, '全部日志'));

    const term = el('div', 'terminal');
    term.dataset.log = 'all';

    const filters = el('div', 'term-filter head-actions');
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

    const g1 = el('div', 'panel set-group');
    g1.appendChild(el('div', 'set-title', '默认值 · 新建设备时自动带入'));
    g1.appendChild(setRow('默认唤醒端口', '魔术包发往的端口', setInput('sWakePort', String(s.wakePort || 9), 5)));
    g1.appendChild(setRow('默认检查端口', '逗号分隔，留空用 3389,22', setInput('sCheckPorts', s.checkPorts || '', 24)));
    const saveBtn = el('button', 'primary-btn', '保存默认值');
    saveBtn.type = 'button';
    saveBtn.onclick = () => Actions.saveDefaults();
    g1.appendChild(setRow('', '', saveBtn));
    root.appendChild(g1);

    const g2 = el('div', 'panel set-group');
    g2.appendChild(el('div', 'set-title', '数据'));
    const r2 = el('div', 'set-row');
    const k2 = el('div', 'k');
    k2.appendChild(el('b', null, '设备数据'));
    k2.appendChild(el('small', null, '导出/导入 JSON，用于备份或换机'));
    const v2 = el('div', 'v');
    v2.style.display = 'flex';
    v2.style.gap = '8px';
    v2.style.flexWrap = 'wrap';
    v2.append(
      ghost('导出', () => Actions.exportData()),
      ghost('导入', () => Actions.importData()),
      ghost('清空全部', () => Actions.removeAll()),
    );
    r2.append(k2, v2);
    g2.appendChild(r2);
    root.appendChild(g2);

    const g3 = el('div', 'panel set-group');
    g3.appendChild(el('div', 'set-title', '关于'));
    g3.appendChild(setRow('工作原理', 'DNS 解析 → UDP 魔术包 → 网卡待机监听开机'));
    g3.appendChild(setRow('数据存储', '全部保存在本机，不上传任何服务器'));
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
    g3.appendChild(r3);
    root.appendChild(g3);

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