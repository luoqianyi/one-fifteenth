import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSuggestions, removeDuplicateSuggestions, buildEndpoint } from '../../scripts/core/ai.js';

test('解析代码围栏中的合法候选', () => {
  const text = '```json\n{"suggestions":[{"name":"机会成本","level":"beginner","summary":"放弃的最佳替代价值"}]}\n```';
  assert.deepEqual(parseSuggestions(text), [
    { name: '机会成本', level: 'beginner', summary: '放弃的最佳替代价值' }
  ]);
});

test('过滤无效项并在没有合法候选时报错', () => {
  const text = JSON.stringify({ suggestions: [
    { name: '', level: 'beginner', summary: 'x' },
    { name: '需求弹性', level: 'expert', summary: 'x' }
  ] });
  assert.throws(() => parseSuggestions(text), /没有有效的关键词/);
});

test('按标准化名称去重', () => {
  const input = [
    { name: ' 机会成本 ', level: 'beginner', summary: 'a' },
    { name: '边际效用', level: 'beginner', summary: 'b' }
  ];
  assert.deepEqual(removeDuplicateSuggestions(input, ['机会成本']), [
    { name: '边际效用', level: 'beginner', summary: 'b' }
  ]);
});

test('兼容 Base URL 和完整 chat completions 地址', () => {
  assert.equal(buildEndpoint('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
  assert.equal(buildEndpoint('https://api.example.com/v1/chat/completions'), 'https://api.example.com/v1/chat/completions');
});
