// Android 原生桥接（Capacitor）：在 Android Studio 里加一个 UDP 插件即可真发
// 文件位置示例：android/app/src/main/java/com/wolwaker/WolPlugin.kt
// 以下为完整可用代码，直接放入 Android 工程，Capacitor 端 JS 透过同名桥接调用。
package com.wolwaker

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.*
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket

@CapacitorPlugin(name = "Wol")
class WolPlugin : Plugin() {

    private fun parseMac(mac: String): ByteArray {
        val hex = mac.uppercase().filter { it.isDigit() || it in 'A'..'F' }
        require(hex.length == 12) { "MAC 非法" }
        return ByteArray(6) { i -> hex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
    }

    private fun magicPacket(mac: String, secureOn: String?): ByteArray {
        val m = parseMac(mac)
        val pkt = ByteArray(if (secureOn.isNullOrBlank()) 102 else 108)
        repeat(6) { pkt[it] = 0xFF.toByte() }
        repeat(16) { i -> m.copyInto(pkt, 6 + i * 6) }
        if (!secureOn.isNullOrBlank()) parseMac(secureOn).copyInto(pkt, 102)
        return pkt
    }

    @PluginMethod
    fun sendMagicPacket(call: PluginCall) {
        val host = call.getString("host") ?: return call.reject("域名/IP 不能为空")
        val port = call.getInt("port", 9) ?: 9
        val mac = call.getString("mac") ?: return call.reject("MAC 不能为空")
        val secureOn = call.getString("secureOn")
        CoroutineScope(Dispatchers.IO).launch {
            var attempts = 0
            var lastErr: Exception? = null
            var ip = host
            repeat(3) { i ->
                attempts = i + 1
                try {
                    val addr = InetAddress.getByName(host) // 每次重解，应对 DDNS 变化
                    ip = addr.hostAddress ?: host
                    val pkt = magicPacket(mac, secureOn)
                    DatagramSocket().use { sock ->
                        sock.send(DatagramPacket(pkt, pkt.size, addr, port))
                    }
                    lastErr = null
                    return@repeat
                } catch (e: Exception) {
                    lastErr = e
                    Log.w("Wol", "send attempt $attempts failed", e)
                    delay(500)
                }
            }
            withContext(Dispatchers.Main) {
                if (lastErr == null) {
                    val ret = JSObject()
                    ret.put("ok", true)
                    ret.put("bytes", if (secureOn.isNullOrBlank()) 102 else 108)
                    ret.put("resolvedIp", ip)
                    ret.put("attempts", attempts)
                    call.resolve(ret)
                } else call.reject("发送失败：${lastErr?.message}")
            }
        }
    }

    @PluginMethod
    fun checkHost(call: PluginCall) {
        val host = call.getString("host") ?: return call.reject("host 为空")
        val timeout = call.getInt("timeoutMs", 3000) ?: 3000
        CoroutineScope(Dispatchers.IO).launch {
            val t0 = System.currentTimeMillis()
            val online = listOf(3389, 22).any { p ->
                try {
                    Socket().use { s ->
                        s.connect(InetSocketAddress(host, p), timeout)
                        true
                    }
                } catch (_: Exception) { false }
            }
            withContext(Dispatchers.Main) {
                val ret = JSObject()
                ret.put("online", online)
                ret.put("latencyMs", System.currentTimeMillis() - t0)
                call.resolve(ret)
            }
        }
    }
}
