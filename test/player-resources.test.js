import test from 'node:test';
import assert from 'node:assert/strict';

test('选择资源后使用该地址与音质；播放失败切到其他资源', async () => {
  class AudioStub extends EventTarget {
    paused = true;
    currentTime = 0;
    duration = 180;
    volume = 0.8;
    muted = false;
    src = '';
    pause() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    getAttribute() { return this.src; }
    removeAttribute() { this.src = ''; }
    load() {}
  }
  const audio = new AudioStub();
  globalThis.document = { getElementById: () => audio };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const { player } = await import('../public/js/player.js');
  const resources = [
    { via: 'kugou', kind: 'full', url: '/chosen', quality: { label: '320 kbps' } },
    { via: 'netease', kind: 'full', url: '/fallback', quality: { label: '音质未知' } },
  ];
  player.playResource({ source: 'netease', id: '1', name: '测试歌曲', artists: [] }, resources[0], resources, {});
  await new Promise(setImmediate);
  assert.equal(audio.src, '/chosen');
  assert.equal(player.info.quality.label, '320 kbps');
  audio.dispatchEvent(new Event('error'));
  await new Promise(setImmediate);
  assert.equal(audio.src, '/fallback');
  assert.equal(player.info.via, 'netease');
  assert.equal(player.queue.length, 1);
  player.clear();
});
