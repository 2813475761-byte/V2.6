'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const growth = require('../src/rule/growth');
const catalog = require('../src/agents/catalog');
const { mergePlan, shouldAcceptPlanPatch } = require('../src/agents/orchestrator');

const profile = { grade: '大二', major: '软件技术', targetJob: '前端开发工程师', skills: [] };
const job = catalog.findJob('前端开发工程师');
const existingPlan = {
  targetJob: '前端开发工程师',
  phases: [
    { title: '第 1 阶段', tasks: [{ text: '补齐基础', done: true }, { text: '做笔记', done: false }] },
    { title: '第 2 阶段', tasks: [{ text: '完成项目', done: false }] }
  ],
  dimensions: [{ name: 'HTML', gap: 1 }]
};

test('规则引擎在已有计划时不会重建计划', () => {
  const messages = [];
  for (let i = 0; i < 5; i += 1) {
    messages.push({ role: 'assistant', content: `第 ${i} 次提问` });
    messages.push({ role: 'user', content: `回答 ${i}` });
  }
  const result = growth.run({
    profile,
    job,
    plan: existingPlan,
    messages,
    userMessage: '你发哪里了',
    resume: null,
    interview: null
  });
  assert.equal(result.planPatch, undefined);
  assert.equal(result.progress.done, true);
  assert.ok(result.reply.includes('没有改动'));
});

test('规则引擎在没有计划时仍会生成计划', () => {
  const messages = [];
  for (let i = 0; i < 5; i += 1) {
    messages.push({ role: 'assistant', content: `第 ${i} 次提问` });
    messages.push({ role: 'user', content: `回答 ${i}` });
  }
  const result = growth.run({ profile, job, plan: null, messages, userMessage: '继续', resume: null, interview: null });
  assert.ok(result.planPatch);
  assert.equal(result.planPatch.phases.length, 3);
});

test('mergePlan 保留同名任务的勾选状态', () => {
  const merged = mergePlan(existingPlan, {
    phases: [{ title: '第 1 阶段（重写）', tasks: [{ text: '补齐基础' }, { text: '新增任务' }] }]
  });
  assert.equal(merged.phases[0].tasks[0].done, true);
  assert.ok(!merged.phases[0].tasks[1].done);
  assert.deepEqual(merged.dimensions, existingPlan.dimensions);
  assert.ok(merged.updatedAt);
});

test('mergePlan 未提供 phases 时保留原有阶段', () => {
  const merged = mergePlan(existingPlan, { gapSummary: '更新摘要' });
  assert.deepEqual(merged.phases, existingPlan.phases);
  assert.equal(merged.gapSummary, '更新摘要');
});
test('已有计划时普通追问不接受 planPatch', () => {
  assert.equal(shouldAcceptPlanPatch(existingPlan, '你发哪里了'), false);
  assert.equal(shouldAcceptPlanPatch(existingPlan, '再讲讲项目怎么做'), false);
  assert.equal(shouldAcceptPlanPatch(existingPlan, ''), false);
});

test('明确要求调整计划时接受 planPatch', () => {
  assert.equal(shouldAcceptPlanPatch(existingPlan, '帮我调整计划'), true);
  assert.equal(shouldAcceptPlanPatch(existingPlan, '每周只能 4 小时，重新生成一份'), true);
  assert.equal(shouldAcceptPlanPatch(existingPlan, '删掉第 2 阶段的任务'), true);
});

test('没有计划时始终接受 planPatch', () => {
  assert.equal(shouldAcceptPlanPatch(null, '随便说'), true);
  assert.equal(shouldAcceptPlanPatch({ phases: [] }, '随便说'), true);
});