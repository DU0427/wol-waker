// Android 桥接：把原生 addJavascriptInterface 注入的 window.WolAndroid
// 适配成与 Electron 一致的 window.WolNative 接口
//
// 注意：WebView 的 Java 桥接方法必须「以对象成员方式」调用。
// 一旦把方法赋给变量再调用（var f = obj.m; f()），this 会丢失，
// Chromium 会抛 "Java bridge method can't be invoked on a non-injected object"。
(function () {
  if (typeof window === 'undefined' || !window.WolAndroid) return;

  function invoke(name, arg) {
    var bridge = window.WolAndroid;
    if (!bridge || typeof bridge[name] !== 'function') {
      throw new Error('原生桥接不可用');
    }
    // 关键：保持 bridge 作为接收者，不要提前把函数取出来
    var raw = bridge[name](JSON.stringify(arg || {}));
    var res = JSON.parse(raw);
    if (res && res.ok === false) throw new Error(res.error || '原生调用失败');
    return res;
  }

  window.WolNative = {
    sendMagicPacket: function (t) { return Promise.resolve(invoke('sendMagicPacket', t)); },
    checkHost: function (o) { return Promise.resolve(invoke('checkHost', o)); },
  };
})();
