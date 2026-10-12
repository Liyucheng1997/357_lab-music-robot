// PWA：手机「添加到桌面」，从桌面图标打开没有地址栏，像一个 APP。
// 安卓 Chrome 有一键安装；苹果手机只能教用户点「分享 → 添加到主屏幕」。

import { icon } from './ui.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

const DISMISS_KEY = 'yinyu:pwa-dismissed';
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 安卓 Chrome 的「安装」事件只发一次，页面一加载就收着 */
let deferred = null;
let banner = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  render();
});
window.addEventListener('appinstalled', () => { deferred = null; banner?.remove(); banner = null; });

function dismissed() {
  try { return !!localStorage.getItem(DISMISS_KEY); } catch { return false; }
}

const STEPS = isIOS
  ? '用 <b>Safari</b> 打开本页，点底部中间的 <b>分享</b> 按钮，往下找 <b>「添加到主屏幕」</b>'
  : '用 <b>Chrome</b> 打开本页，点右上角 <b>⋮</b>，选 <b>「添加到主屏幕」</b>或<b>「安装应用」</b>';

function render() {
  if (isStandalone() || dismissed()) return;
  if (!banner) {
    banner = document.createElement('section');
    banner.className = 'install-banner';
    banner.setAttribute('aria-label', '添加到手机桌面');
    banner.addEventListener('click', onClick);
    document.getElementById('view').before(banner);
  }
  const canPrompt = !!deferred && !isIOS;
  banner.innerHTML = `
    <div class="install-row">
      <img src="./icons/icon-192.png" alt="" width="38" height="38" />
      <div class="install-text">
        <strong>添加到手机桌面</strong>
        <span>全屏打开，没有网址栏</span>
      </div>
      <button class="btn install-go" type="button">${canPrompt ? '添加' : '怎么加'}</button>
      <button class="icon-btn sm install-close" type="button" title="不再提示" aria-label="不再提示">${icon('close')}</button>
    </div>
    <p class="install-steps" hidden>${STEPS}</p>`;
}

async function onClick(e) {
  if (e.target.closest('.install-close')) {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    banner.remove();
    banner = null;
    return;
  }
  if (!e.target.closest('.install-go')) return;
  if (deferred && !isIOS) {
    const ev = deferred;
    deferred = null;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') { banner?.remove(); banner = null; } else render();
    return;
  }
  const steps = banner.querySelector('.install-steps');
  steps.hidden = !steps.hidden;
}

render();
