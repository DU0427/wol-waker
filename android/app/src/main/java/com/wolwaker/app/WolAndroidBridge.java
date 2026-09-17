package com.wolwaker.app;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * WoL 原生桥接：由 MainActivity 通过 addJavascriptInterface 注入为 window.WolAndroid。
 *
 * 调用是异步的：@JavascriptInterface 方法只把任务丢进线程池就立刻返回，
 * 结果通过 webView.evaluateJavascript 回调给 window.__wolBridge.resolve(id, res)。
 * 这样 DNS 解析 / TCP 连接超时（可达数秒）不会阻塞 WebView 的 JS 线程——
 * 同步返回会让整个页面在这几秒里假死。
 */
public class WolAndroidBridge {

    private final WebView webView;
    private final ExecutorService pool = Executors.newCachedThreadPool();

    public WolAndroidBridge(WebView webView) {
        this.webView = webView;
    }

    /** 发魔术包：{host, port, mac, secureOn} + 回调 id */
    @JavascriptInterface
    public void sendMagicPacket(String json, String callbackId) {
        pool.execute(() -> deliver(callbackId, doSendMagicPacket(json)));
    }

    /** 探测在线：{host, tcpPorts, timeoutMs} + 回调 id */
    @JavascriptInterface
    public void checkHost(String json, String callbackId) {
        pool.execute(() -> deliver(callbackId, doCheckHost(json)));
    }

    /** 把结果回调给 JS；evaluateJavascript 必须在 UI 线程执行 */
    private void deliver(String callbackId, JSONObject result) {
        // JSON 本身就是合法的 JS 字面量；顺手挡掉会截断脚本的 U+2028 / U+2029
        String payload = result.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
        String js = "window.__wolBridge && window.__wolBridge.resolve("
                + JSONObject.quote(callbackId) + ", " + payload + ")";
        webView.post(() -> {
            try {
                webView.evaluateJavascript(js, null);
            } catch (Exception ignored) {
                // WebView 已销毁等异常：忽略即可，JS 侧有超时兜底
            }
        });
    }

    private static JSONObject doSendMagicPacket(String json) {
        try {
            JSONObject t = new JSONObject(json);
            String host = t.getString("host").trim();
            int port = t.optInt("port", 9);
            String mac = t.getString("mac");
            String secureOn = t.optString("secureOn", "");
            if (host.isEmpty()) throw new Exception("域名/IP 不能为空");
            if (port < 1 || port > 65535) throw new Exception("端口非法：1-65535");

            byte[] pkt = magicPacket(mac, secureOn);
            String ip = host;
            int attempts = 0;
            Exception last = null;
            for (int i = 1; i <= 3; i++) {
                attempts = i;
                try {
                    InetAddress addr = InetAddress.getByName(host); // 每次重解，应对 DDNS 变化
                    ip = addr.getHostAddress();
                    DatagramSocket sock = new DatagramSocket();
                    try {
                        // 广播地址（x.x.x.255 / 255.255.255.255）必须打开 SO_BROADCAST，否则抛异常
                        try { sock.setBroadcast(true); } catch (Exception ignored) { }
                        sock.send(new DatagramPacket(pkt, pkt.length, addr, port));
                    } finally {
                        sock.close();
                    }
                    last = null;
                    break;
                } catch (Exception e) {
                    last = e;
                    try { Thread.sleep(500); } catch (InterruptedException ignored) { }
                }
            }
            JSONObject r = new JSONObject();
            if (last != null) {
                r.put("ok", false);
                r.put("error", "发送失败：" + last.getMessage());
                return r;
            }
            r.put("ok", true);
            r.put("bytes", pkt.length);
            r.put("resolvedIp", ip);
            r.put("attempts", attempts);
            return r;
        } catch (Exception e) {
            return errorJson("发送失败：" + e.getMessage());
        }
    }

    private static JSONObject doCheckHost(String json) {
        long t0 = System.currentTimeMillis();
        boolean online = false;
        try {
            JSONObject o = new JSONObject(json);
            String host = o.getString("host").trim();
            int timeout = o.optInt("timeoutMs", 3000);
            int[] ports = parsePorts(o);
            for (int p : ports) {
                try {
                    Socket s = new Socket();
                    try {
                        s.connect(new InetSocketAddress(host, p), timeout);
                        online = true;
                        break;
                    } finally {
                        s.close();
                    }
                } catch (Exception ignored) { }
            }
        } catch (Exception ignored) {
            online = false;
        }
        JSONObject r = new JSONObject();
        try {
            r.put("online", online);
            r.put("latencyMs", System.currentTimeMillis() - t0);
        } catch (Exception ignored) { }
        return r;
    }

    /** 读取前端传来的检查端口数组；缺省时回退到 3389/22 */
    private static int[] parsePorts(JSONObject o) {
        JSONArray arr = o.optJSONArray("tcpPorts");
        if (arr == null || arr.length() == 0) return new int[]{3389, 22};
        int[] out = new int[arr.length()];
        int n = 0;
        for (int i = 0; i < arr.length(); i++) {
            int p = arr.optInt(i, -1);
            if (p >= 1 && p <= 65535) out[n++] = p;
        }
        if (n == 0) return new int[]{3389, 22};
        if (n == out.length) return out;
        int[] trimmed = new int[n];
        System.arraycopy(out, 0, trimmed, 0, n);
        return trimmed;
    }

    private static JSONObject errorJson(String msg) {
        JSONObject r = new JSONObject();
        try {
            r.put("ok", false);
            r.put("error", msg);
        } catch (Exception ignored) { }
        return r;
    }

    private static byte[] parseMac(String mac) throws Exception {
        String hex = mac.toUpperCase().replaceAll("[^0-9A-F]", "");
        if (hex.length() != 12) throw new Exception("MAC 非法：需要 12 位十六进制");
        byte[] out = new byte[6];
        for (int i = 0; i < 6; i++) {
            out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    private static byte[] magicPacket(String mac, String secureOn) throws Exception {
        byte[] m = parseMac(mac);
        boolean hasPwd = secureOn != null && !secureOn.trim().isEmpty();
        byte[] pkt = new byte[hasPwd ? 108 : 102];
        for (int i = 0; i < 6; i++) pkt[i] = (byte) 0xFF;
        for (int i = 0; i < 16; i++) System.arraycopy(m, 0, pkt, 6 + i * 6, 6);
        if (hasPwd) System.arraycopy(parseMac(secureOn), 0, pkt, 102, 6);
        return pkt;
    }
}
