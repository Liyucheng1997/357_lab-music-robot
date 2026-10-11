// 桌面歌词：浮在所有窗口之上的双行卡拉 OK 歌词。
// 按浏览器能力依次选择：
//   1. Document Picture-in-Picture（Chrome / Edge 116+）：置顶小窗，可放控制按钮
//   2. 视频画中画 + Canvas 绘制（Safari 等）：置顶小窗，纯显示
//   3. 页面内悬浮歌词条（Firefox 等）：可拖动

import { player } from './player.js';
import { store } from './store.js';
import { activeIndex } from './lyric.js';
import { svg, toast, artistNames } from './ui.js';

// 经典播放器配色：已唱、未唱各是一条自上而下的渐变，外加深色描边
const REST = ['#ffffff', '#d9e2ec'];
const THEMES = [
  { name: '珊瑚', sung: ['#ffe39a', '#ff5a36'] },
  { name: '晴空', sung: ['#c2f3ff', '#2b95ff'] },
  { name: '薄荷', sung: ['#dcffb8', '#16b86e'] },
  { name: '樱粉', sung: ['#ffd6ee', '#ff4a9e'] },
  { name: '鎏金', sung: ['#fff6b0', '#eea300'] },
];
const OUTLINE = 'rgba(14,14,18,.88)';
// 浏览器小窗的背景无法透明，只能选一个和窗口标题栏协调的纯色
const BGS = [
  { key: 'auto', name: '跟随系统' },
  { key: 'dark', name: '深色', color: '#202124' },
  { key: 'light', name: '浅色', color: '#f1f3f4' },
];

const settings = {
  scale: clamp(store.get('dlScale') ?? 1, 0.6, 1.8),
  theme: (store.get('dlTheme') ?? 0) % THEMES.length,
  trans: !!store.get('dlTrans'),
  bg: (store.get('dlBg') ?? 0) % BGS.length,
};

function bgColor() {
  const b = BGS[settings.bg];
  if (b.color) return b.color;
  return matchMedia('(prefers-color-scheme: light)').matches ? BGS[2].color : BGS[1].color;
}

let lines = [];
let hint = '';
let mode = null; // 'pip' | 'video' | 'inline'
let ctx = null; // 当前模式的渲染上下文
const listeners = new Set();

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ================= 计算当前要显示的两行 =================

function frame(t) {
  const song = player.current;
  if (!lines.length) {
    return {
      a: { text: song ? song.name : '音隅 · 桌面歌词', on: true, p: 1 },
      b: { text: song ? hint || artistNames(song) : '播放一首歌试试', on: false },
    };
  }
  const i = activeIndex(lines, t);
  if (i < 0) {
    return { a: { text: song ? `${song.name} - ${artistNames(song)}` : '', on: true, p: 1 }, b: { text: lines[0].text, on: false } };
  }
  const cur = lines[i];
  const gap = (lines[i + 1]?.t ?? cur.t + 6) - cur.t;
  // 逐行歌词没有逐字时间，按字数估算演唱时长，避免长间奏时填色过慢
  const dur = Math.max(0.4, Math.min(gap, Math.max(2, [...cur.text].length * 0.42)));
  const curLine = { text: cur.text, on: true, p: clamp((t - cur.t) / dur, 0, 1) };
  if (settings.trans && cur.trans) return { a: curLine, b: { text: cur.trans, on: false, sub: true } };
  const next = { text: lines[i + 1]?.text || '', on: false };
  return i % 2 === 0 ? { a: curLine, b: next } : { a: next, b: curLine };
}

// ================= DOM 渲染（PiP 窗口与页内悬浮共用） =================

const CSS = `
.dl { --sung: #ff5a36; --sung1: #ffe39a; --sung2: #ff5a36; --rest1: #fff; --rest2: #d9e2ec;
  --outline: rgba(14,14,18,.88); --k: 1;
  position: relative; box-sizing: border-box; width: 100%; height: 100%;
  display: flex; flex-direction: column; justify-content: center;
  padding: 6px 18px; overflow: hidden; user-select: none; background: transparent;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif; }
.dl-line { box-sizing: border-box; width: 100%; padding: 0 .12em; line-height: 1.3; white-space: nowrap; }
.dl-line.b { text-align: right; }
.dl-line .w { position: relative; display: inline-block; vertical-align: top;
  font-weight: 800; letter-spacing: .03em; opacity: .8; transition: opacity .3s;
  font-size: clamp(14px, calc(var(--k) * min(5.4vw, 32vh)), 120px); }
.dl-line .w.on { opacity: 1; }
.dl-line .w.sub { font-weight: 600; font-size: clamp(12px, calc(var(--k) * min(4vw, 22vh)), 90px); }
.dl-line .w > span { display: block; white-space: nowrap; }
/* 底层：粗描边 + 投影；描边有一半落在字形内，会被上层填色盖住，只露出外圈 */
.dl-line .s { color: var(--outline); -webkit-text-stroke: .15em var(--outline);
  text-shadow: 0 .06em .14em rgba(0,0,0,.4); }
.dl-line .f, .dl-line .h { position: absolute; inset: 0; color: transparent;
  -webkit-background-clip: text; background-clip: text; }
.dl-line .f { background-image: linear-gradient(180deg, var(--rest1) 25%, var(--rest2) 85%); }
.dl-line .h { background-image: linear-gradient(180deg, var(--sung1) 15%, var(--sung2) 80%);
  clip-path: inset(-30% calc(100% - var(--p, 0%)) -30% 0); }
.dl-line .w:not(.on) .h { display: none; }
.dl-bar { position: absolute; top: 4px; left: 50%; transform: translate(-50%, -4px);
  display: flex; align-items: center; gap: 2px; padding: 3px 6px; border-radius: 999px;
  background: rgba(24,24,28,.8); backdrop-filter: blur(10px); box-shadow: 0 4px 14px rgba(0,0,0,.25);
  opacity: 0; transition: opacity .2s, transform .2s; z-index: 2; }
.dl:hover .dl-bar, .dl.force-bar .dl-bar { opacity: 1; transform: translate(-50%, 0); }
.dl-bar button { all: unset; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%;
  color: rgba(255,255,255,.85); cursor: pointer; font-size: 12px; font-weight: 700; }
.dl-bar button:hover { background: rgba(255,255,255,.16); color: #fff; }
.dl-bar button.on { color: var(--sung); }
.dl-bar svg { width: 15px; height: 15px; }
.dl-bar .sep { width: 1px; height: 14px; margin: 0 4px; background: rgba(255,255,255,.2); }
.dl-bar .dot { width: 12px; height: 12px; border-radius: 50%;
  background: linear-gradient(180deg, var(--sung1), var(--sung2)); box-shadow: 0 0 0 2px rgba(255,255,255,.25); }
.dl.inline { position: fixed; z-index: 30; width: min(820px, calc(100vw - 32px)); height: 116px;
  border-radius: 18px; cursor: grab; transition: background .2s; }
.dl.inline:hover, .dl.inline.dragging { background: rgba(0,0,0,.16); backdrop-filter: blur(4px); }
.dl.inline.dragging { cursor: grabbing; }
.dl.inline [data-a="bg"] { display: none; }
.dl.inline .dl-line .w { font-size: calc(var(--k) * 32px); }
.dl.inline .dl-line .w.sub { font-size: calc(var(--k) * 22px); }
@media (max-width: 820px) { .dl.inline { height: 96px; } .dl.inline .dl-line .w { font-size: calc(var(--k) * 23px); } }
`;

// 每行三层相同文字：描边底 / 未唱渐变 / 已唱渐变（按进度裁切）
const LINE = '<span class="w"><span class="s"></span><span class="f"></span><span class="h"></span></span>';

function buildDom(doc) {
  const el = doc.createElement('div');
  el.className = 'dl';
  el.innerHTML = `
    <div class="dl-bar">
      <button data-a="prev" title="上一首">${svg('prev')}</button>
      <button data-a="toggle" title="播放/暂停">${svg('play')}</button>
      <button data-a="next" title="下一首">${svg('next')}</button>
      <span class="sep"></span>
      <button data-a="smaller" title="缩小字号">A-</button>
      <button data-a="bigger" title="放大字号">A+</button>
      <button data-a="theme" title="切换颜色"><span class="dot"></span></button>
      <button data-a="trans" title="显示翻译">译</button>
      <button data-a="bg" title="背景"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg></button>
      <span class="sep"></span>
      <button data-a="close" title="关闭桌面歌词">${svg('close')}</button>
    </div>
    <div class="dl-line a">${LINE}</div>
    <div class="dl-line b">${LINE}</div>`;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    e.stopPropagation();
    ({
      prev: () => player.prev(),
      next: () => player.next(),
      toggle: () => player.toggle(),
      smaller: () => setScale(settings.scale - 0.1),
      bigger: () => setScale(settings.scale + 0.1),
      theme: () => setTheme(settings.theme + 1),
      trans: () => setTrans(!settings.trans),
      bg: () => setBg(settings.bg + 1),
      close: () => close(),
    })[a]?.();
  });
  return el;
}

function applySettings(el) {
  const th = THEMES[settings.theme];
  el.style.setProperty('--sung', th.sung[1]);
  el.style.setProperty('--sung1', th.sung[0]);
  el.style.setProperty('--sung2', th.sung[1]);
  el.style.setProperty('--rest1', REST[0]);
  el.style.setProperty('--rest2', REST[1]);
  el.style.setProperty('--outline', OUTLINE);
  el.style.setProperty('--k', settings.scale);
  el.querySelector('[data-a="trans"]')?.classList.toggle('on', settings.trans);
  el.querySelector('[data-a="theme"]')?.setAttribute('title', `颜色：${th.name}`);
  el.querySelector('[data-a="bg"]')?.setAttribute('title', `背景：${BGS[settings.bg].name}`);
  // 小窗背景挂在 PiP 文档根节点上；页内悬浮模式始终透明
  if (!el.classList.contains('inline')) el.ownerDocument.documentElement.dataset.bg = BGS[settings.bg].key;
}

function syncPlayButton(el) {
  const btn = el.querySelector('[data-a="toggle"]');
  if (btn) btn.innerHTML = svg(player.playing ? 'pause' : 'play');
}

/** 把一行写入 DOM；文字变化时重新计算是否需要缩小以完整显示 */
function paintLine(lineEl, spec) {
  const w = lineEl.firstElementChild;
  const sub = !!spec.sub;
  if (w.dataset.text !== spec.text || w.classList.contains('sub') !== sub) {
    w.dataset.text = spec.text;
    for (const layer of w.children) layer.textContent = spec.text;
    w.classList.toggle('sub', sub);
    fit(lineEl);
  }
  w.classList.toggle('on', !!spec.on);
  w.style.setProperty('--p', `${((spec.on ? spec.p ?? 1 : 0) * 100).toFixed(2)}%`);
}

function fit(lineEl) {
  const w = lineEl.firstElementChild;
  w.style.fontSize = '';
  const view = w.ownerDocument.defaultView;
  const cs = view.getComputedStyle(lineEl);
  const avail = lineEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const need = w.scrollWidth;
  if (avail > 0 && need > avail) {
    const size = parseFloat(view.getComputedStyle(w).fontSize);
    w.style.fontSize = `${Math.max(10, size * (avail / need) * 0.97)}px`;
  }
}

function domRenderer(el) {
  const la = el.querySelector('.dl-line.a');
  const lb = el.querySelector('.dl-line.b');
  return {
    el,
    draw() {
      const f = frame(player.time);
      paintLine(la, f.a);
      paintLine(lb, f.b);
    },
    refit() {
      fit(la);
      fit(lb);
    },
  };
}

// ================= 模式一：Document Picture-in-Picture =================

async function openPip() {
  const win = await window.documentPictureInPicture.requestWindow({ width: 760, height: 130 });
  const doc = win.document;
  doc.title = '音隅 · 桌面歌词';
  const style = doc.createElement('style');
  style.textContent = `
:root { --bg: ${BGS[1].color}; }
@media (prefers-color-scheme: light) { :root { --bg: ${BGS[2].color}; } }
:root[data-bg="dark"] { --bg: ${BGS[1].color}; }
:root[data-bg="light"] { --bg: ${BGS[2].color}; }
html, body { margin: 0; height: 100%; background: var(--bg); overflow: hidden; }
${CSS}`;
  doc.head.append(style);
  const el = buildDom(doc);
  doc.body.append(el);
  applySettings(el);
  syncPlayButton(el);
  const r = domRenderer(el);
  let raf = 0;
  const loop = () => {
    r.draw();
    raf = win.requestAnimationFrame(loop);
  };
  loop();
  win.addEventListener('resize', () => r.refit());
  win.addEventListener('pagehide', () => {
    win.cancelAnimationFrame(raf);
    if (mode === 'pip') finish();
  });
  return { ...r, close: () => win.close() };
}

// ================= 模式二：视频画中画（Canvas 绘制） =================

async function openVideoPip() {
  const W = 1200;
  const H = 220;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const font = '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei UI",sans-serif';

  const vGrad = (y, size, [top, bottom]) => {
    const gr = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    gr.addColorStop(0.2, top);
    gr.addColorStop(0.85, bottom);
    return gr;
  };

  const drawLine = (spec, y, align) => {
    if (!spec.text) return;
    const th = THEMES[settings.theme];
    const weight = spec.sub ? 600 : 800;
    let size = (spec.sub ? 50 : 70) * settings.scale;
    g.font = `${weight} ${size}px ${font}`;
    let w = g.measureText(spec.text).width;
    const max = W - 70;
    if (w > max) {
      size *= max / w;
      g.font = `${weight} ${size}px ${font}`;
      w = g.measureText(spec.text).width;
    }
    const x = align === 'left' ? 35 : W - 35 - w;
    g.globalAlpha = spec.on ? 1 : 0.8;
    // 描边 + 投影，再叠渐变填色
    g.lineJoin = 'round';
    g.lineWidth = size * 0.15;
    g.strokeStyle = OUTLINE;
    g.shadowColor = 'rgba(0,0,0,.4)';
    g.shadowOffsetY = size * 0.06;
    g.shadowBlur = size * 0.14;
    g.strokeText(spec.text, x, y);
    g.shadowColor = 'transparent';
    g.fillStyle = vGrad(y, size, REST);
    g.fillText(spec.text, x, y);
    if (spec.on && spec.p > 0) {
      g.save();
      g.beginPath();
      g.rect(x, 0, w * spec.p, H);
      g.clip();
      g.fillStyle = vGrad(y, size, th.sung);
      g.fillText(spec.text, x, y);
      g.restore();
    }
    g.globalAlpha = 1;
  };

  const draw = () => {
    g.fillStyle = bgColor();
    g.fillRect(0, 0, W, H);
    g.textBaseline = 'middle';
    const f = frame(player.time);
    drawLine(f.a, H * 0.32, 'left');
    drawLine(f.b, H * 0.72, 'right');
  };
  draw();

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = canvas.captureStream(30);
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0';
  document.body.append(video);
  await video.play().catch((err) => {
    video.remove();
    throw err;
  });
  // 播放音频的标签页不会被节流，定时器足够流畅
  const timer = setInterval(draw, 1000 / 30);
  let closing = false;
  // 画中画窗口自带的播放/暂停按钮用来控制音乐
  video.addEventListener('pause', () => {
    if (closing) return;
    player.toggle();
    video.play().catch(() => {});
  });
  video.addEventListener('leavepictureinpicture', () => {
    closing = true;
    clearInterval(timer);
    video.remove();
    if (mode === 'video') finish();
  });
  try {
    await video.requestPictureInPicture();
  } catch (err) {
    closing = true;
    clearInterval(timer);
    video.remove();
    throw err;
  }
  return {
    draw() {},
    refit() {},
    close: () => document.exitPictureInPicture().catch(() => {}),
  };
}

// ================= 模式三：页面内悬浮 =================

function openInline() {
  if (!document.getElementById('dl-style')) {
    const style = document.createElement('style');
    style.id = 'dl-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  const el = buildDom(document);
  el.classList.add('inline');
  document.body.append(el);
  applySettings(el);
  syncPlayButton(el);

  // 位置：默认在播放栏上方居中，可拖动，位置会记住
  const place = (x, y) => {
    const r = el.getBoundingClientRect();
    const nx = clamp(x, 8, innerWidth - r.width - 8);
    const ny = clamp(y, 8, innerHeight - r.height - 8);
    el.style.left = `${nx}px`;
    el.style.top = `${ny}px`;
    return [nx, ny];
  };
  const saved = store.get('dlPos');
  const r0 = el.getBoundingClientRect();
  place(saved?.[0] ?? (innerWidth - r0.width) / 2, saved?.[1] ?? innerHeight - r0.height - 120);

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging', 'force-bar');
    const move = (ev) => place(ev.clientX - dx, ev.clientY - dy);
    const up = (ev) => {
      el.removeEventListener('pointermove', move);
      el.classList.remove('dragging', 'force-bar');
      store.set('dlPos', place(ev.clientX - dx, ev.clientY - dy));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
  });

  const r = domRenderer(el);
  let raf = 0;
  const loop = () => {
    r.draw();
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = () => {
    const b = el.getBoundingClientRect();
    place(b.left, b.top);
    r.refit();
  };
  addEventListener('resize', onResize);
  return {
    ...r,
    close() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      el.remove();
      finish();
    },
  };
}

// ================= 开关 & 设置 =================

async function open() {
  if (mode) return;
  const attempts = [
    ['pip', 'documentPictureInPicture' in window, openPip],
    ['video', document.pictureInPictureEnabled && !!HTMLCanvasElement.prototype.captureStream, openVideoPip],
  ];
  for (const [name, supported, openFn] of attempts) {
    if (!supported) continue;
    try {
      ctx = await openFn();
      mode = name;
      break;
    } catch (err) {
      console.warn(`桌面歌词：${name} 模式打开失败`, err);
      ctx = null;
    }
  }
  if (!ctx) {
    ctx = openInline();
    mode = 'inline';
    toast('当前浏览器不支持置顶小窗，已在页面内显示歌词（可拖动）');
  }
  emit();
}

function close() {
  if (!mode) return;
  const c = ctx;
  if (mode === 'inline') c.close();
  else {
    c.close();
    finish();
  }
}

function finish() {
  mode = null;
  ctx = null;
  emit();
}

function forEachDom(fn) {
  if (ctx?.el) fn(ctx.el);
}

function setScale(v) {
  settings.scale = Math.round(clamp(v, 0.6, 1.8) * 10) / 10;
  store.set('dlScale', settings.scale);
  forEachDom((el) => {
    applySettings(el);
    ctx.refit();
  });
}

function setTheme(i) {
  settings.theme = ((i % THEMES.length) + THEMES.length) % THEMES.length;
  store.set('dlTheme', settings.theme);
  forEachDom(applySettings);
}

function setBg(i) {
  settings.bg = ((i % BGS.length) + BGS.length) % BGS.length;
  store.set('dlBg', settings.bg);
  forEachDom(applySettings);
}

function setTrans(v) {
  settings.trans = v;
  store.set('dlTrans', v);
  forEachDom(applySettings);
  toast(v ? '桌面歌词：显示翻译' : '桌面歌词：显示下一句');
}

function emit() {
  listeners.forEach((fn) => fn(!!mode));
}

player.on('state', () => forEachDom(syncPlayButton));

export const desktopLyric = {
  get isOpen() {
    return !!mode;
  },
  toggle() {
    return mode ? close() : open();
  },
  close,
  /** 由歌词加载逻辑调用：lines 为解析后的歌词，emptyText 为无歌词时的提示 */
  setLyric(newLines, emptyText = '') {
    lines = newLines || [];
    hint = emptyText;
  },
  onChange(fn) {
    listeners.add(fn);
  },
};
