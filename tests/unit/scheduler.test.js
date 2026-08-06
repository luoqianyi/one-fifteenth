import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWeight, chooseWeighted, drawKeyword } from '../../scripts/core/scheduler.js';

const now = Date.parse('2026-08-05T12:00:00Z');

test('未学习关键词权重大于刚掌握的关键词', () => {
  const fresh = { studyCount: 0, mastery: 0, lastStudiedAt: null, lastDrawnAt: null, skipCount: 0 };
  const mastered = { studyCount: 3, mastery: 5, lastStudiedAt: '2026-08-05T11:00:00Z', lastDrawnAt: null, skipCount: 0 };
  assert.ok(calculateWeight(fresh, now) > calculateWeight(mastered, now));
});

test('距离上次学习越久权重越高', () => {
  const recent = { studyCount: 1, mastery: 3, lastStudiedAt: '2026-08-05T11:00:00Z', lastDrawnAt: null, skipCount: 0 };
  const old = { ...recent, lastStudiedAt: '2026-07-01T11:00:00Z' };
  assert.ok(calculateWeight(old, now) > calculateWeight(recent, now));
});

test('固定随机值选择正确权重区间', () => {
  const items = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
  assert.equal(chooseWeighted(items, () => 0).id, 'a');
  assert.equal(chooseWeighted(items, () => 0.99).id, 'b');
});

test('空列表返回 null且抽卡保留关键词字段', () => {
  assert.equal(chooseWeighted([], () => 0.5), null);
  const card = drawKeyword([{ id: 'x', name: '机会成本', studyCount: 0 }], () => 0.5, now);
  assert.equal(card.name, '机会成本');
  assert.ok(card.weight > 0);
});
