import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BACKEND, getBackendBase, setBackendBase, backendUrl, rewriteStreamUrls } from '../public/js/backend.js';
import { api } from '../public/js/api.js';

const saved = new Map();
globalThis.localStorage = { getItem: (k) => saved.get(k) || null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) };

test('Pages 后端地址限定 HTTPS；本地页面仍使用同源 API', () => {
  globalThis.location = { hostname: 'liyucheng1997.github.io' };
  assert.throws(() => setBackendBase('http://example.com'));
  assert.throws(() => setBackendBase('https://user:pass@example.com'));
  setBackendBase('https://example.com/');
  assert.equal(getBackendBase(), 'https://example.com');
  assert.equal(backendUrl('/api/search'), 'https://example.com/api/search');
  globalThis.location = { hostname: '127.0.0.1' };
  assert.equal(backendUrl('/api/search'), '/api/search');
});

test('Pages 所有候选视频流指向配置的后端，而非 Pages', () => {
  globalThis.location = { hostname: 'liyucheng1997.github.io' };
  setBackendBase('https://example.com');
  const result = rewriteStreamUrls({ url: '/api/stream/bilibili/BV123', resources: [{ url: '/api/stream/bilibili/BV456' }, { url: 'https://cdn.example.com/audio' }] });
  assert.equal(result.url, 'https://example.com/api/stream/bilibili/BV123');
  assert.equal(result.resources[0].url, 'https://example.com/api/stream/bilibili/BV456');
  assert.equal(result.resources[1].url, 'https://cdn.example.com/audio');
});

test('Pages 默认连接已部署的音乐服务，清空自定义地址后恢复默认', () => {
  globalThis.location = { hostname: 'liyucheng1997.github.io' };
  setBackendBase('https://example.com');
  setBackendBase('');
  assert.equal(getBackendBase(), DEFAULT_BACKEND);
  assert.equal(backendUrl('/api/discover'), `${DEFAULT_BACKEND}/api/discover`);
});
