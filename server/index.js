// 音隅 · 服务端：静态文件 + 聚合 API（零依赖，Node 18+）

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as netease from './sources/netease.js';
import * as kugou from './sources/kugou.js';
import * as kuwo from './sources/kuwo.js';
import { externalSources } from './sources/external.js';
import * as bilibili from './sources/bilibili.js';
import { resolve as resolvePlay, availability, findLyricId } from './play.js';
import { recommend } from './recommend.js';

const PORT = Number(process.env.PORT) || 3570;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

const SOURCES = { netease, kugou, kuwo, bilibili };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

async function readBody(req, limit = 1 << 20) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, '请求体过大');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON');
  }
}

const required = (v, name) => {
  if (!v) throw new HttpError(400, `缺少参数 ${name}`);
  return v;
};

// ---------------- API ----------------

const routes = {
  'GET /api/search': async (q) => {
    const keyword = required(q.get('q')?.trim(), 'q').slice(0, 100);
    const page = Math.max(1, Number(q.get('page')) || 1);
    const want = (q.get('source') || 'all').split(',');
    const names = Object.keys(SOURCES).filter((n) => want.includes('all') || want.includes(n));
    const limit = 20;
    const results = await Promise.allSettled(
      names.map((n) =>
        n === 'netease'
          ? netease.search(keyword, { limit: 30, offset: (page - 1) * 30 })
          : SOURCES[n].search(keyword, { limit, page }),
      ),
    );
    return {
      keyword,
      page,
      results: Object.fromEntries(
        names.map((n, i) => [
          n,
          results[i].status === 'fulfilled'
            ? { ok: true, songs: results[i].value }
            : { ok: false, songs: [], error: results[i].reason?.message || '请求失败' },
        ]).concat(Object.entries(externalSources)
          .filter(([n]) => want.includes('all') || want.includes(n))
          .map(([n, s]) => [n, { ok: true, songs: [], status: s.status, message: s.message, link: s.link(keyword) }])),
      ),
    };
  },

  'GET /api/play': (q) =>
    resolvePlay({
      source: required(q.get('source'), 'source'),
      id: required(q.get('id'), 'id'),
      name: q.get('name') || '',
      artist: q.get('artist') || '',
      duration: Number(q.get('duration')) || 0,
    }),

  'POST /api/availability': async (_q, req) => {
    const { songs, refresh } = await readBody(req);
    if (!Array.isArray(songs)) throw new HttpError(400, '缺少 songs');
    const list = songs.slice(0, 30).filter((s) => s && s.source && s.id).map((s) => ({
      source: String(s.source), id: String(s.id),
      name: String(s.name || ''), artist: String(s.artist || ''), duration: Number(s.duration) || 0,
    }));
    const raw = await availability(list, 2, refresh === true);
    return raw;
  },

  'GET /api/lyric': async (q) => {
    let id = q.get('id');
    if (!id && q.get('name')) id = await findLyricId(q.get('name'), q.get('artist') || '').catch(() => null);
    if (!id) return { lrc: '', tlyric: '' };
    return netease.lyric(id);
  },

  'GET /api/toplists': () => netease.toplists(),

  'GET /api/playlist': (q) => netease.playlist(required(q.get('id'), 'id')),

  'GET /api/discover': async () => {
    const [playlists, newSongs, lists] = await Promise.allSettled([
      netease.recommendPlaylists(12),
      netease.newSongs(12),
      netease.toplists(),
    ]);
    const val = (r) => (r.status === 'fulfilled' ? r.value : []);
    return { playlists: val(playlists), newSongs: val(newSongs), toplists: val(lists).slice(0, 4) };
  },

  'POST /api/recommend': async (_q, req) => recommend(await readBody(req)),
};

async function handleApi(req, res, url) {
  const stream = url.pathname.match(/^\/api\/stream\/bilibili\/(BV[0-9A-Za-z]{10})$/);
  if (stream && (req.method === 'GET' || req.method === 'HEAD')) return bilibili.stream(stream[1], req, res);
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) throw new HttpError(404, '接口不存在');
  const data = await route(url.searchParams, req);
  send(res, 200, data);
}

// ---------------- 静态文件 ----------------

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Forbidden');

  let target = file;
  try {
    if (!(await stat(target)).isFile()) throw new Error();
  } catch {
    target = path.join(PUBLIC_DIR, 'index.html'); // 前端路由兜底
  }
  const body = await readFile(target);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    const origin = req.headers.origin;
    const allowed = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (url.pathname.startsWith('/api/') && origin && allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    }
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(req, res, url);
    else throw new HttpError(405, 'Method Not Allowed');
  } catch (err) {
    const status = err.status || 502;
    if (status >= 500) console.error(`[${req.method} ${url.pathname}]`, err.message);
    if (!res.headersSent) send(res, status, { error: err.message || '服务器错误' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  ♪ 音隅已启动  →  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
});
