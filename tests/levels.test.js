'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LEVELS, levelScore, normalizeLevel, levelGap } = require('../src/agents/levels');
const catalog = require('../src/agents/catalog');

const KEYS = ['未接触', '了解', '熟悉', '掌握', '熟练', '精通'];

test('六档等级分数与归一化', () => {
  assert.deepEqual(LEVELS.map((item) => item.key), KEYS);
  assert.equal(levelScore('未接触'), 5);
  assert.equal(levelScore('了解'), 25);
  assert.equal(levelScore('熟悉'), 45);
  assert.equal(levelScore('掌握'), 65);
  assert.equal(levelScore('熟练'), 85);
  assert.equal(levelScore('精通'), 100);
  assert.equal(levelScore('不会'), 5);
  assert.equal(levelScore('不熟悉'), 5);
  assert.equal(levelScore('70'), 70);
  assert.equal(normalizeLevel('已掌握'), '掌握');
  assert.equal(normalizeLevel('勉强熟练'), '熟练');
  assert.equal(normalizeLevel(''), '');
});

test('差距按分数计算', () => {
  assert.equal(levelGap('了解', '熟练'), 60);
  assert.equal(levelGap('熟练', '了解'), 0);
});

test('岗位图谱使用细化后的等级', () => {
  const job = catalog.findJob('前端开发工程师');
  const levels = new Set(job.skills.map((item) => item.level));
  assert.ok(levels.has('熟练'));
  assert.ok([...levels].every((level) => KEYS.includes(level)));
});

test('诊断按学生自评等级计算差距', () => {
  const job = catalog.findJob('前端开发工程师');
  const weak = catalog.diagnosis(
    { targetJob: '前端开发工程师', skills: [{ name: 'HTML/CSS/JavaScript', level: '了解' }] },
    job
  );
  const strong = catalog.diagnosis(
    { targetJob: '前端开发工程师', skills: [{ name: 'HTML/CSS/JavaScript', level: '熟练' }] },
    job
  );
  const weakDim = weak.dimensions.find((item) => item.name === 'HTML/CSS/JavaScript');
  const strongDim = strong.dimensions.find((item) => item.name === 'HTML/CSS/JavaScript');
  assert.equal(weakDim.current, '了解');
  assert.equal(strongDim.current, '熟练');
  assert.ok(weakDim.gap > strongDim.gap);
  assert.ok(strong.matchScore > weak.matchScore);
  assert.ok(weak.matchScore >= 0 && weak.matchScore <= 100);
});

test('未填等级的技能按了解处理，未掌握的能力列为未接触', () => {
  const job = catalog.findJob('前端开发工程师');
  const result = catalog.diagnosis({ targetJob: '前端开发工程师', skills: ['HTML/CSS/JavaScript'] }, job);
  const matched = result.dimensions.find((item) => item.name === 'HTML/CSS/JavaScript');
  const missing = result.dimensions.find((item) => item.name !== 'HTML/CSS/JavaScript');
  assert.equal(matched.current, '了解');
  assert.equal(missing.current, '未接触');
});