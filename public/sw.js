// PWA 的 service worker：手机「添加到桌面」要用到。
// 不缓存任何页面和数据（榜单、播放地址都要实时的），只在断网打不开时给一个提示页。
const OFFLINE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>没有网络</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f6f3;
font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#1d1c1a;text-align:center}
@media (prefers-color-scheme:dark){body{background:#111113;color:#f1f0ee}}
button{margin-top:24px;height:48px;padding:0 32px;border:0;border-radius:999px;background:#e0533d;color:#fff;font-size:17px;font-weight:600}</style>
</head><body><div><div style="font-size:48px">🎧</div><div style="font-size:22px;font-weight:700;margin-top:12px">没有网络</div>
<div style="font-size:15px;opacity:.6;margin-top:8px">连上 Wi-Fi 或打开流量，再点下面重试</div>
<button onclick="location.reload()">重试</button></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  // 只管打开页面；接口、音频、图片、脚本照常走网络
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});
