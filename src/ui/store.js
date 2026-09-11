// 数据层：设备 / 设置 / 日志缓冲区（多页共用）
'use strict';

const Store = (() => {
  const DEV_KEY = 'wol-waker.devices.v2';
  const DEV_KEY_V1 = 'wol-waker.devices.v1';
  const SET_KEY = 'wol-waker.settings.v1';
  const DEFAULT_CHECK_PORTS = [3389, 22];
  const DEFAULT_SETTINGS = { wakePort: 9, checkPorts: '3389,22' };

  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  function list() {
    const v = read(DEV_KEY, null);
    if (v) return v;
    const old = read(DEV_KEY_V1, null);              // 兼容旧版本
    if (old) {
      const migrated = old.map((d) => ({ checkPorts: '', ...d }));
      write(DEV_KEY, migrated);
      return migrated;
    }
    return [];
  }
  function save(devs) { write(DEV_KEY, devs); }
  function get(id) { return list().find((d) => d.id === id) || null; }
  function upsert(d) {
    const devs = list();
    const i = devs.findIndex((x) => x.id === d.id);
    if (i >= 0) devs[i] = d; else devs.push(d);
    save(devs);
    return d;
  }
  function remove(id) { save(list().filter((x) => x.id !== id)); }
  function touchWake(id) {
    save(list().map((x) => (x.id === id ? { ...x, lastWakeAt: Date.now() } : x)));
  }
  function settings() { return { ...DEFAULT_SETTINGS, ...read(SET_KEY, {}) }; }
  function saveSettings(s) { write(SET_KEY, s); }

  function parsePorts(raw) {
    const l = String(raw || '').split(/[^0-9]+/).filter(Boolean).map(Number)
      .filter((p) => Number.isInteger(p) && p >= 1 && p <= 65535);
    const u = [...new Set(l)];
    return u.length ? u : DEFAULT_CHECK_PORTS.slice();
  }
  function newId() { return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  return {
    list, save, get, upsert, remove, touchWake,
    settings, saveSettings, parsePorts, newId,
    DEFAULT_CHECK_PORTS, DEFAULT_SETTINGS,
  };
})();

// 日志缓冲区：切换页面不丢，日志页 / 详情页共用
const Log = (() => {
  const entries = [];
  const subs = [];
  function add(level, msg, deviceId) {
    entries.push({ t: Date.now(), level, msg, deviceId: deviceId || null });
    if (entries.length > 500) entries.shift();
    subs.forEach((f) => f());
  }
  function clear() { entries.length = 0; subs.forEach((f) => f()); }
  function all() { return entries; }
  function onChange(f) { subs.push(f); }
  return { add, clear, all, onChange };
})();