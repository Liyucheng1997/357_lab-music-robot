// 纯本地单元测试（不访问网络）
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseKuwo } from '../server/sources/kuwo.js';
import { normalize, decodeEntities } from '../server/lib/http.js';
import { parseLrc, mergeLyric, activeIndex } from '../public/js/lyric.js';

test('parseKuwo 提取单引号类 JSON 中的歌曲', () => {
  const text = "{'HIT':'2','abslist':[{'ARTIST':'周杰伦','MUSICRID':'MUSIC_228908','NAME':'晴天','DURATION':'269'},"
    + "{'ARTIST':'Guns N&nbsp;Roses','MUSICRID':'MUSIC_1','NAME':'Don't Cry','DURATION':'284'}],'PN':'0','MUSICRID':'X'}";
  const items = parseKuwo(text);
  assert.equal(items.length, 2);
  assert.equal(items[0].NAME, '晴天');
  assert.equal(items[0].DURATION, '269');
  assert.equal(items[1].NAME, "Don't Cry");
  assert.equal(decodeEntities(items[1].ARTIST), 'Guns N Roses');
});

test('parseKuwo 无结果时返回空数组', () => {
  assert.deepEqual(parseKuwo("{'abslist':[]}"), []);
  assert.deepEqual(parseKuwo('garbage'), []);
});

test('normalize 忽略括号备注、空白和大小写', () => {
  assert.equal(normalize('晴天 (Live)'), normalize('晴天'));
  assert.equal(normalize('Shape Of You'), normalize('shape of you'));
});

test('parseLrc 支持多时间标签并排序', () => {
  const lines = parseLrc('[00:01.50][00:10.00]副歌\n[00:05.123]第二句\n[ti:标题]\n[00:20.00]');
  assert.deepEqual(lines.map((l) => l.t), [1.5, 5.123, 10]);
  assert.equal(lines[0].text, '副歌');
});

test('mergeLyric 合并翻译，activeIndex 定位当前行', () => {
  const lines = mergeLyric('[00:01.00]Hello\n[00:03.00]World', '[00:01.00]你好\n[00:03.00]世界');
  assert.equal(lines[1].trans, '世界');
  assert.equal(activeIndex(lines, 0.2), -1);
  assert.equal(activeIndex(lines, 2), 0);
  assert.equal(activeIndex(lines, 30), 1);
});
