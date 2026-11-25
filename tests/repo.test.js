'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase, setDb } = require('../src/repo/db');

setDb(createDatabase(':memory:'));

const repo = require('../src/repo');
const { emptyResume } = require('../src/repo/resume');

test('会话可以创建并查询', () => {
  repo.ensureSession('s-1');
  assert.equal(repo.sessionExists('s-1'), true);
  assert.equal(repo.sessionExists('s-2'), false);
});

test('画像保存后能读回并规范化技能', () => {
  repo.ensureSession('s-profile');
  const saved = repo.saveProfile('s-profile', {
    grade: '大二',
    major: '软件技术',
    targetJob: '前端开发工程师',
    skills: ['Vue', { name: 'Python', level: '了解' }, '']
  });
  assert.equal(saved.grade, '大二');
  assert.equal(saved.skills.length, 2);
  assert.deepEqual(saved.skills[0], { name: 'Vue', level: '' });

  const read = repo.getProfile('s-profile');
  assert.equal(read.targetJob, '前端开发工程师');
});

test('消息按角色写入并可计数', () => {
  repo.ensureSession('s-msg');
  repo.addMessage('s-msg', 'growth', 'user', '你好');
  repo.addMessage('s-msg', 'growth', 'assistant', '你好呀', { nextQuestion: '你学过大几的课？' });
  const list = repo.listMessages('s-msg', 'growth', 10);
  assert.equal(list.length, 2);
  assert.equal(list[1].meta.nextQuestion, '你学过大几的课？');
  assert.equal(repo.countMessages('s-msg', 'growth', 'user'), 1);
});

test('简历保存生成新版本且能取最新版', () => {
  repo.ensureSession('s-resume');
  const first = repo.saveResume('s-resume', { basic: { name: '张三' } });
  assert.equal(first.version, 1);
  const second = repo.saveResume('s-resume', { basic: { phone: '13800000000' } });
  assert.equal(second.version, 2);

  const latest = repo.getLatestResume('s-resume');
  assert.equal(latest.version, 2);
  assert.equal(latest.resume.basic.name, '');
  assert.equal(latest.resume.basic.phone, '13800000000');
  assert.equal(repo.listResumeVersions('s-resume').length, 2);
});

test('计划可以覆盖保存', () => {
  repo.ensureSession('s-plan');
  repo.savePlan('s-plan', { targetJob: '前端开发工程师', phases: [] });
  const updated = repo.savePlan('s-plan', { targetJob: '后端开发工程师', phases: [{ title: '阶段一' }] });
  assert.equal(updated.targetJob, '后端开发工程师');
  assert.equal(updated.phases.length, 1);
  assert.ok(updated.updatedAt);
});

test('面试创建、更新与结束', () => {
  repo.ensureSession('s-interview');
  const interview = repo.createInterview('s-interview', '前端开发工程师');
  assert.ok(interview.id);
  assert.equal(repo.getActiveInterview('s-interview').id, interview.id);

  repo.updateInterview(interview.id, { rounds: [{ question: '介绍一下自己', answer: '' }] });
  assert.equal(repo.getActiveInterview('s-interview').rounds.length, 1);

  repo.finishInterview(interview.id, { rounds: [{ question: 'q', answer: 'a' }], score: { overall: 80 } }, 80);
  assert.equal(repo.getActiveInterview('s-interview'), null);
  const latest = repo.getLatestInterview('s-interview');
  assert.equal(latest.status, 'finished');
  assert.equal(latest.score.overall, 80);
  assert.equal(latest.score.dimensions, undefined);
});

test('反馈与统计', () => {
  repo.ensureSession('s-fb');
  repo.addFeedback('s-fb', 5, '很好用');
  repo.addFeedback('s-fb', 4, '');
  const stats = repo.getStats();
  assert.ok(stats.sessions >= 1);
  assert.ok(stats.feedback >= 2);
  assert.ok(stats.averageRating > 0);
});

test('parseJSON 对坏数据返回兜底值', () => {
  assert.deepEqual(repo.parseJSON('{bad json', { ok: true }), { ok: true });
  assert.deepEqual(repo.parseJSON('{"a":1}', {}), { a: 1 });
});

test('重置草稿为默认结构', () => {
  const empty = emptyResume();
  assert.ok(empty.basic);
  assert.equal(empty.projects.length, 1);
  assert.ok(Array.isArray(empty.skills));
});