import { isPages, getBackendBase, setBackendBase } from './backend.js';
import { esc } from './ui.js';

if (isPages()) {
  const panel = document.createElement('section');
  panel.className = 'deployment-panel';
  panel.setAttribute('aria-label', '连接音乐服务');
  panel.innerHTML = `<details ${getBackendBase() ? '' : 'open'}>
    <summary>${getBackendBase() ? '已配置音乐服务 · 更改连接' : '连接音乐服务'}</summary>
    <p>此页面已上线。搜索、榜单和播放需要连接音乐服务，也可以通过搜索页前往各平台官方入口。</p>
    <form><label for="backendAddress">音乐服务地址</label><div class="backend-form"><input id="backendAddress" type="url" placeholder="https://你的音乐服务域名" value="${esc(getBackendBase())}" /><button class="btn" type="submit">保存连接</button></div><p class="backend-error" role="status"></p></form>
  </details>`;
  document.getElementById('view').before(panel);
  panel.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      setBackendBase(panel.querySelector('input').value);
      location.reload();
    } catch (err) { panel.querySelector('[role="status"]').textContent = err.message; }
  });
}
