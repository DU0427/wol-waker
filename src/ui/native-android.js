// Android 桥接：把原生 addJavascriptInterface 注入的 window.WolAndroid
// 适配成与 Electron 一致的 window.WolNative 接口
(function () {
  if (typeof window === 'undefined' || !window.WolAndroid) return;
  function call(fn, arg) {
    var raw = fn(JSON.stringify(arg || {}));
    var res = JSON.parse(raw);
    if (res && res.ok === false) throw new Error(res.error || '原生发送失败');
    return res;
  }
  window.WolNative = {
    sendMagicPacket: function (t) { return Promise.resolve(call(window.WolAndroid.sendMagicPacket, t)); },
    checkHost: function (o) { return Promise.resolve(call(window.WolAndroid.checkHost, o)); },
  };
})();
