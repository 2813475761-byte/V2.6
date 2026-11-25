'use strict';

const LEVELS = [
  { key: '未接触', score: 5 },
  { key: '了解', score: 25 },
  { key: '熟悉', score: 45 },
  { key: '掌握', score: 65 },
  { key: '熟练', score: 85 },
  { key: '精通', score: 100 }
];

const LEVEL_KEYS = LEVELS.map((item) => item.key);

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function levelScore(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return clamp(Number(text));
  if (/^(未|不|没)/.test(text)) return LEVELS[0].score;
  const hit = LEVELS.slice()
    .reverse()
    .find((item) => text.includes(item.key));
  if (hit) return hit.score;
  if (/入门|初学|零基础|刚接触/.test(text)) return LEVELS[0].score;
  return 0;
}

function normalizeLevel(value) {
  const score = levelScore(value);
  if (!score) return '';
  let best = LEVELS[0];
  for (const item of LEVELS) {
    if (Math.abs(item.score - score) < Math.abs(best.score - score)) best = item;
  }
  return best.key;
}

function levelGap(current, target) {
  const currentScore = levelScore(current);
  const targetScore = levelScore(target) || 100;
  return Math.max(0, targetScore - currentScore);
}

module.exports = { LEVELS, LEVEL_KEYS, levelScore, normalizeLevel, levelGap };