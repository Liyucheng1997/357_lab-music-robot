// 首页「AI 选歌」面板：输入描述 → Claude 流式给出歌单 → 逐首匹配可播放的版本。

import { api } from './api.js';
import { store } from './store.js';
import { icon, esc, toast } from './ui.js';
import { songList } from './views.js';
import { createSession, getAiConfig, setAiConfig, hasAiKey, tasteNote, pickMatch, DEFAULT_BASE } from './ai.js';

const EXAMPLES = ['下雨天写代码时听的 lo-fi', '夜跑用的高燃电子', '周杰伦那种中国风', '安静的日系午后', '90 年代粤语金曲', '失恋后想听的英文慢歌'];

// 当前结果留在内存里，离开首页再回来还在
let cur = null; // { prompt, title, summary, picks: [{ name, artist, reason, status, song }], session, controller, running, error }
let root = null; // 当前首页上的面板容器
let badKey = false; // 上一次请求时 Key 被拒
const isAlive = () => root?.isConnected;

export function aiPanel() {
  return `
    <section class="ai-card" id="aiCard">
      <form class="ai-form" autocomplete="off">
        <div class="ai-head">
          <span class="ai-mark">${icon('sparkle')}</span>
          <div class="ai-title"><strong>AI 选歌</strong><small>用一句话描述想听的音乐 · Claude Opus 5.5</small></div>
          <button class="text-btn ai-key" type="button" data-ai="key"></button>
        </div>
        <textarea class="ai-input" name="prompt" rows="2" maxlength="300" placeholder="比如：下雨天写代码时听的 lo-fi，不要有人声" aria-label="描述想听的音乐"></textarea>
        <div class="ai-foot">
          <div class="chips ai-examples">${EXAMPLES.map((t) => `<button class="chip" type="button" data-ai-example="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <label class="ai-taste" title="把常听的歌手和不感兴趣的歌告诉 Claude 作参考"><input type="checkbox" name="taste" /><span>结合我的口味</span></label>
          <button class="btn ai-go" type="submit"></button>
        </div>
      </form>
    </section>
    <div id="aiResult"></div>`;
}

/** 首页渲染后调用，绑定事件并恢复上一次的结果 */
export function mountAi(el) {
  root = el.querySelector('#aiCard');
  const form = root.querySelector('form');
  const input = form.elements.prompt;
  const hasTaste = store.get('history').length + store.get('likes').length > 0;
  form.elements.taste.checked = hasTaste;
  form.querySelector('.ai-taste').hidden = !hasTaste;
  if (cur) input.value = cur.prompt;
  autosize(input);
  syncControls();
  render();

  input.addEventListener('input', () => autosize(input));
  input.addEventListener('keydown', (e) => {
    // 中文输入法选词时的回车不算提交
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (cur?.running) return stop();
    const prompt = input.value.trim();
    if (!prompt) return input.focus();
    start(prompt, form.elements.taste.checked);
  });
  form.addEventListener('click', (e) => {
    const ex = e.target.closest('[data-ai-example]');
    if (ex) {
      input.value = ex.dataset.aiExample;
      autosize(input);
      if (!cur?.running) form.requestSubmit();
    }
    if (e.target.closest('[data-ai="key"]')) openKeyDialog();
  });
  el.querySelector('#aiResult').addEventListener('click', (e) => {
    if (e.target.closest('[data-ai="more"]')) more();
    if (e.target.closest('[data-ai="key"]')) openKeyDialog();
    if (e.target.closest('[data-ai="retry"]')) cur && (cur.turns ? more() : start(cur.prompt, cur.taste));
  });
}

function autosize(t) {
  t.style.height = '';
  if (!t.value || !t.isConnected) return;
  t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
}

function syncControls() {
  if (!isAlive()) return;
  const key = root.querySelector('.ai-key');
  key.textContent = !hasAiKey() ? '设置 API Key' : badKey ? 'Key 无效' : '已设置 Key';
  key.classList.toggle('on', hasAiKey() && !badKey);
  key.classList.toggle('bad', hasAiKey() && badKey);
  const go = root.querySelector('.ai-go');
  go.innerHTML = cur?.running ? `${icon('close')}停止` : `${icon('sparkle')}推荐`;
  go.classList.toggle('secondary', !!cur?.running);
}

// ---------- 流程 ----------

function start(prompt, taste) {
  if (!hasAiKey()) {
    openKeyDialog(() => start(prompt, taste));
    return;
  }
  stop();
  cur = { prompt, taste, title: '', summary: '', picks: [], session: createSession(), turns: 0 };
  run(prompt, taste ? tasteNote({ history: store.get('history'), likes: store.get('likes'), dislikes: store.get('dislikes') }) : '');
}

function more() {
  if (!cur || cur.running) return;
  cur.title = '';
  cur.summary = '';
  cur.picks = [];
  // 之前的回答都在对话里，Claude 能看到推荐过哪些
  run('再换一批同样风格的 15 首，不要和之前推荐过的任何一首重复。');
}

async function run(prompt, taste = '') {
  const job = cur;
  job.running = true;
  job.error = null;
  job.controller = new AbortController();
  syncControls();
  render();
  try {
    const data = await job.session.ask(prompt, {
      taste,
      signal: job.controller.signal,
      onUpdate: (p) => job === cur && merge(job, p),
    });
    if (job !== cur) return;
    merge(job, data);
    job.turns++;
    badKey = false;
  } catch (err) {
    if (job !== cur) return;
    if (err.code !== 'abort') job.error = err;
    badKey = err.code === 'auth';
  } finally {
    if (job === cur) {
      job.running = false;
      syncControls();
      render();
    }
  }
}

function stop() {
  if (!cur?.running) return;
  cur.controller.abort();
}

/** 用最新的（部分）结果更新歌单；新出现的歌立即开始匹配音源 */
function merge(job, { title, summary, songs }) {
  if (title) job.title = title;
  if (summary) job.summary = summary;
  const old = new Map(job.picks.map((p) => [`${p.name}|${p.artist}`, p]));
  job.picks = songs.map((s) => {
    const k = `${s.name}|${s.artist}`;
    const p = old.get(k) || { ...s, status: 'wait', song: null };
    if (!old.has(k)) resolve(job, p);
    p.reason = s.reason || p.reason;
    return p;
  });
  schedule();
}

// 同时最多查 3 首，避免把音乐平台的接口打满
const waiting = [];
let active = 0;
function resolve(job, pick) {
  waiting.push([job, pick]);
  pump();
}
function pump() {
  while (active < 3 && waiting.length) {
    const [job, pick] = waiting.shift();
    if (job !== cur) continue;
    active++;
    find(pick)
      .then((song) => {
        pick.song = song && { ...song, reason: pick.reason };
        pick.status = song ? 'ok' : 'miss';
      })
      .catch(() => { pick.status = 'miss'; })
      .finally(() => {
        active--;
        if (job === cur) schedule();
        pump();
      });
  }
}

async function find({ name, artist }) {
  const q = `${name} ${artist}`;
  const first = await api.search(q, 1, 'netease');
  const hit = pickMatch(first.results.netease?.songs || [], name, artist);
  if (hit) return hit;
  const rest = await api.search(q, 1, 'kugou,kuwo');
  return pickMatch([...(rest.results.kugou?.songs || []), ...(rest.results.kuwo?.songs || [])], name, artist);
}

// ---------- 渲染 ----------

let frame = 0;
function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    render();
  });
}

function render() {
  if (!isAlive()) return;
  const box = root.parentElement.querySelector('#aiResult');
  if (!cur) {
    box.innerHTML = '';
    return;
  }
  const { picks, running, error } = cur;
  const found = picks.filter((p) => p.status === 'ok').map((p) => {
    p.song.reason = p.reason;
    return p.song;
  });
  const matching = picks.filter((p) => p.status === 'wait').length;
  const missed = picks.filter((p) => p.status === 'miss');

  let status = '';
  if (running && !picks.length) status = 'Claude 正在挑歌…';
  else if (running) status = `已挑出 ${picks.length} 首，继续挑选中…`;
  else if (matching) status = `正在匹配音源，还剩 ${matching} 首…`;

  const listHtml = found.length ? songList(found, { note: (s) => s.reason }) : '';
  const listId = listHtml.match(/data-list="(l\d+)"/)?.[1];
  const actions = `<span class="ai-actions">
      ${!running && cur.turns ? `<button class="btn secondary" data-ai="more">${icon('refresh')}换一批</button>` : ''}
      ${found.length ? `<button class="btn" data-act="play-all" data-list="${listId}">${icon('play')}播放全部</button>` : ''}</span>`;

  const errorHtml = error
    ? `<div class="notice ai-error">${icon('info')}<span>${esc(error.message)}</span>
        ${error.code === 'auth' || error.code === 'nokey' || error.code === 'network'
          ? '<button class="text-btn" data-ai="key">检查设置</button>'
          : '<button class="text-btn" data-ai="retry">重试</button>'}</div>`
    : '';

  const pending = picks.filter((p) => p.status === 'wait');
  const pendingHtml = pending.length
    ? `<div class="ai-pending">${pending.map((p) => `<div class="ai-pick"><span class="avail wait"></span><b>${esc(p.name)}</b><em>${esc(p.artist)}</em><span>${esc(p.reason)}</span></div>`).join('')}</div>`
    : '';
  const skeleton = running && !picks.length ? Array.from({ length: 4 }, () => '<div class="skeleton sk-row"></div>').join('') : '';

  const missHtml = missed.length && !matching
    ? `<div class="ai-miss"><span>这 ${missed.length} 首没有在站内找到，可以去搜索看看：</span>
        <div class="chips">${missed.map((p) => `<a class="chip" href="#/search/${encodeURIComponent(`${p.name} ${p.artist}`)}">${esc(p.name)} · ${esc(p.artist)}</a>`).join('')}</div></div>`
    : '';

  if (!picks.length && !running && error) {
    box.innerHTML = `<section class="section">${errorHtml}</section>`;
    return;
  }
  box.innerHTML = `
    <section class="section ai-result">
      <div class="section-head">
        <h2>${esc(cur.title || 'AI 为你挑的歌')}</h2>
        ${actions}
      </div>
      ${cur.summary ? `<p class="ai-summary">${esc(cur.summary)}</p>` : ''}
      ${status ? `<p class="ai-status">${icon('sparkle')}${esc(status)}</p>` : ''}
      ${errorHtml}
      ${listHtml}${pendingHtml}${skeleton}${missHtml}
    </section>`;
}

// ---------- API Key 设置 ----------

let dialog;
let afterSave = null;

function openKeyDialog(then = null) {
  afterSave = then;
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'resource-dialog ai-dialog';
    dialog.setAttribute('aria-labelledby', 'aiKeyTitle');
    document.body.append(dialog);
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-ai-close]')) dialog.close();
      if (e.target.closest('[data-ai-clear]')) {
        setAiConfig({ apiKey: '' });
        afterSave = null;
        dialog.close();
        syncControls();
        toast('已清除 API Key');
      }
    });
    dialog.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target.elements;
      try {
        setAiConfig({ apiKey: f.apiKey.value, baseURL: f.baseURL.value });
      } catch (err) {
        dialog.querySelector('.backend-error').textContent = err.message;
        return;
      }
      badKey = false;
      dialog.close();
      syncControls();
      if (hasAiKey()) {
        toast('已保存，可以开始 AI 选歌了');
        const fn = afterSave;
        afterSave = null;
        fn?.();
      }
    });
  }
  const { apiKey, baseURL } = getAiConfig();
  dialog.innerHTML = `
    <header><h2 id="aiKeyTitle">连接 Claude</h2><button type="button" data-ai-close aria-label="关闭">×</button></header>
    <form>
      <p class="ai-dialog-text">AI 选歌使用 Claude Opus 5.5，需要你自己的 Anthropic API Key，费用由你的账户承担。
        还没有可以在 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">Anthropic Console</a> 创建。</p>
      <label class="ai-field"><span>API Key</span>
        <input class="ai-text" name="apiKey" type="password" placeholder="sk-ant-…" value="${esc(apiKey)}" spellcheck="false" autocomplete="off" required /></label>
      <details class="ai-advanced"${baseURL ? ' open' : ''}><summary>接口地址（可选）</summary>
        <label class="ai-field"><span>无法直连 Anthropic 时，填写兼容 Anthropic 接口的 HTTPS 地址。Key 会发送到这个地址，请只填你信任的服务。</span>
          <input class="ai-text" name="baseURL" type="url" placeholder="${DEFAULT_BASE}" value="${esc(baseURL)}" spellcheck="false" /></label>
      </details>
      <p class="resource-note">Key 只保存在这个浏览器里，选歌请求从浏览器直接发往 Claude，不经过音隅的服务器。在公用电脑上用完请清除。</p>
      <p class="backend-error" role="status"></p>
      <div class="ai-dialog-actions">
        ${apiKey ? '<button class="btn secondary" type="button" data-ai-clear>清除 Key</button>' : ''}
        <button class="btn" type="submit">保存</button>
      </div>
    </form>`;
  dialog.showModal();
  dialog.querySelector('[name="apiKey"]').focus();
}
