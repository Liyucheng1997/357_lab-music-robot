// 列表里每首歌的「免费源」提示：歌曲行滚动到可见区域时，批量向服务器查询能从哪个平台免费播放。
// 查询结果同时预热播放器的音源缓存，点击后可立即播放。

import { api } from './api.js';
import { player, primeUrl } from './player.js';
import { songKey } from './store.js';
import { getList } from './views.js';
import { esc } from './ui.js';
import { resourceBadge, resourceOptions } from './resource-ui.js';

const results = new Map(); // key -> { kind, via, matched } | 'pending'
const queue = new Map(); // key -> song
let flushTimer = 0;
let inflight = 0;
const BATCH = 10;
const MAX_INFLIGHT = 1;

const songOf = (row) => getList(row.dataset.list)?.[row.dataset.i];

function paint(row) {
  const song = songOf(row);
  const slot = row.querySelector('.avail-slot');
  if (!song || !slot) return;
  const r = results.get(songKey(song));
  slot.innerHTML = resourceBadge(r);
  row.classList.toggle('unavailable', !!r && r !== 'pending' && !r.kind);
}

function paintKey(key) {
  document.querySelectorAll(`.song[data-key="${CSS.escape(key)}"]`).forEach(paint);
}

function enqueue(row) {
  const song = songOf(row);
  if (!song) return;
  const key = songKey(song);
  if (results.has(key)) return paint(row);
  results.set(key, 'pending');
  queue.set(key, song);
  paint(row);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 250);
}

async function flush() {
  while (queue.size && inflight < MAX_INFLIGHT) {
    const batch = [...queue.entries()].slice(0, BATCH);
    batch.forEach(([k]) => queue.delete(k));
    inflight++;
    api
      .availability(batch.map(([, s]) => s))
      .then((data) => {
        for (const [key, song] of batch) {
          const r = { ...(data[key] || { kind: null }), exp: Date.now() + 5 * 60e3 };
          results.set(key, r);
          if (r.url) primeUrl(song, r);
          paintKey(key);
        }
      })
      .catch(() => {
        // 查询失败：撤销「查询中」状态，下次可见时重试
        for (const [key] of batch) {
          results.set(key, { kind: null, error: true });
          paintKey(key);
        }
      })
      .finally(() => {
        inflight--;
        if (queue.size) flush();
      });
  }
}

// ---------- 观察歌曲行 ----------

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      enqueue(e.target);
    }
  },
  { root: document.getElementById('main'), rootMargin: '200px 0px' },
);

function scan(root) {
  root.querySelectorAll?.('.song[data-list]').forEach((row) => {
    if (row.dataset.availWatched) return;
    row.dataset.availWatched = '1';
    const song = songOf(row);
    if (song && results.has(songKey(song))) paint(row);
    else io.observe(row);
  });
}

new MutationObserver((muts) => {
  for (const m of muts) m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n));
}).observe(document.getElementById('view'), { childList: true, subtree: true });

// 播放器实际解析出的结果也同步到提示上
player.on('info', (info) => {
  const s = player.current;
  if (!s) return;
  const key = songKey(s);
  results.set(key, info);
  paintKey(key);
});
player.on('unavailable', (s) => {
  const key = songKey(s);
  results.set(key, { kind: null });
  paintKey(key);
});

const dialog = document.createElement('dialog');
dialog.className = 'resource-dialog';
dialog.setAttribute('aria-labelledby', 'resourceTitle');
document.body.append(dialog);
let requestId = 0;
let selectedSong;
let selectedInfo;

async function openResources(song, refresh = false) {
  const my = ++requestId;
  selectedSong = song;
  selectedInfo = null;
  dialog.innerHTML = `<header><h2 id="resourceTitle">${esc(song.name)} · 播放资源</h2><button data-resource-close aria-label="关闭">×</button></header><div class="resource-body">正在查询可播放资源与音质…</div>`;
  if (!dialog.open) dialog.showModal();
  try {
    let info = results.get(songKey(song));
    if (refresh || !info || info === 'pending' || !info.url || info.exp < Date.now()) {
      const data = await api.availability([song], refresh);
      info = { ...data[songKey(song)], exp: Date.now() + 5 * 60e3 };
    }
    if (my !== requestId || !dialog.open) return;
    results.set(songKey(song), info);
    selectedInfo = info;
    paintKey(songKey(song));
    dialog.querySelector('.resource-body').innerHTML = resourceOptions(info) + '<button class="btn secondary" data-resource-refresh>重新查询</button>';
  } catch {
    if (my !== requestId || !dialog.open) return;
    dialog.querySelector('.resource-body').innerHTML = '<p>资源查询失败，请稍后重试。</p><button class="btn secondary" data-resource-refresh>重试</button>';
  }
}

dialog.addEventListener('click', (e) => {
  if (e.target.closest('[data-resource-close]')) return dialog.close();
  if (e.target.closest('[data-resource-refresh]')) return openResources(selectedSong, true);
  const button = e.target.closest('[data-resource-index]');
  if (!button || !selectedInfo) return;
  if (selectedInfo.exp && selectedInfo.exp < Date.now()) return openResources(selectedSong, true);
  const resources = selectedInfo.resources || [selectedInfo];
  player.playResource(selectedSong, resources[Number(button.dataset.resourceIndex)], resources, selectedInfo.statuses);
  dialog.close();
});

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-act="resources"]');
  if (!button) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const row = button.closest('.song');
  const song = row && songOf(row);
  if (song) openResources(song);
});
