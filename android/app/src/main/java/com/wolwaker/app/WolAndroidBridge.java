package com.wolwaker.app;

import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * WoL 原生桥接：由 MainActivity 通过 addJavascriptInterface 注入为 window.WolAndroid。
 * 直接用 UDP 发魔术包，不需要任何后端服务。
 */
public class WolAndroidBridge {

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

    @JavascriptInterface
    public String sendMagicPacket(String json) {
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
                return r.toString();
            }
            r.put("ok", true);
            r.put("bytes", pkt.length);
            r.put("resolvedIp", ip);
            r.put("attempts", attempts);
            return r.toString();
        } catch (Exception e) {
            return errorJson("发送失败：" + e.getMessage());
        }
    }

    @JavascriptInterface
    public String checkHost(String json) {
        long t0 = System.currentTimeMillis();
        try {
            JSONObject o = new JSONObject(json);
            String host = o.getString("host").trim();
            int timeout = o.optInt("timeoutMs", 3000);
            boolean online = false;
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
            JSONObject r = new JSONObject();
            r.put("online", online);
            r.put("latencyMs", System.currentTimeMillis() - t0);
            return r.toString();
        } catch (Exception e) {
            try {
                JSONObject r = new JSONObject();
                r.put("online", false);
                r.put("latencyMs", System.currentTimeMillis() - t0);
                return r.toString();
            } catch (Exception ignored) {
                return "{\"online\":false,\"latencyMs\":0}";
            }
        }
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

    private static String errorJson(String msg) {
        try {
            JSONObject r = new JSONObject();
            r.put("ok", false);
            r.put("error", msg);
            return r.toString();
        } catch (Exception ignored) {
            return "{\"ok\":false,\"error\":\"unknown\"}";
        }
    }
}
