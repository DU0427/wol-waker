// Android 桥接：把原生 addJavascriptInterface 注入的 window.WolAndroid
// 适配成与 Electron 一致的 window.WolNative 接口。
//
// 两个关键点：
// 1. 原生方法必须「以对象成员方式」调用。取出来再调用（var f = obj.m; f()）会丢 this，
//    Chromium 会抛 "Java bridge method can't be invoked on a non-injected object"。
// 2. 原生侧是异步的：方法立刻返回，结果通过 window.__wolBridge.resolve(id, res) 回调。
//    这样 DNS 解析 / 连接超时不会阻塞 JS 线程。
(function () {
  if (typeof window === 'undefined' || !window.WolAndroid) return;

  var seq = 0;
  var pending = {};
  var TIMEOUT_MS = 60000; // 兜底：万一回调丢失（页面切换、WebView 销毁），不要永远挂住 UI

  window.__wolBridge = {
    resolve: function (id, res) {
      var done = pending[id];
      if (!done) return;
      delete pending[id];
      done(res);
    },
  };

  function call(name, arg) {
    return new Promise(function (resolve, reject) {
      var bridge = window.WolAndroid;
      if (!bridge || typeof bridge[name] !== 'function') {
        reject(new Error('原生桥接不可用'));
        return;
      }
      var id = 'wol' + (++seq);
      var timer = setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        reject(new Error('原生调用超时'));
      }, TIMEOUT_MS);

      pending[id] = function (res) {
        clearTimeout(timer);
        if (res && res.ok === false) reject(new Error(res.error || '原生调用失败'));
        else resolve(res);
      };

      try {
        // 关键：保持 bridge 作为接收者，不要提前把函数取出来
        bridge[name](JSON.stringify(arg || {}), id);
      } catch (e) {
        clearTimeout(timer);
        delete pending[id];
        reject(e);
      }
    });
  }

  window.WolNative = {
    sendMagicPacket: function (t) { return call('sendMagicPacket', t); },
    checkHost: function (o) { return call('checkHost', o); },
  };
})();
