'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase, setDb } = require('../src/repo/db');

setDb(createDatabase(':memory:'));

const { createApp } = require('../server');

let server;
let base;
let cookie = '';

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const merged = { 'Content-Type': 'application/json', ...headers };
  if (cookie) merged.Cookie = cookie;
  const response = await fetch(base + path, {
    method,
    headers: merged,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

test('健康检查返回模型通道信息', async () => {
  const { status, data } = await call('/api/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.ok(data.llm.mode);
});

test('创建会话并拿到 HttpOnly Cookie', async () => {
  const { status, data } = await call('/api/session', { method: 'POST' });
  assert.equal(status, 200);
  assert.ok(data.state.sessionId);
  assert.match(cookie, /^sid=/);
});

test('保存画像后状态同步更新', async () => {
  const { status, data } = await call('/api/profile', {
    method: 'PUT',
    body: {
      grade: '大二',
      major: '软件技术',
      targetJob: '前端开发工程师',
      skills: ['HTML', 'CSS']
    }
  });
  assert.equal(status, 200);
  assert.equal(data.state.profile.targetJob, '前端开发工程师');
  assert.equal(data.state.profile.skills.length, 2);
});

test('岗位元数据包含内置图谱', async () => {
  const { status, data } = await call('/api/meta');
  assert.equal(status, 200);
  assert.ok(data.jobs.length >= 10);
  assert.equal(data.agents.length, 3);
});

test('成长规划接口：4 轮对话生成计划', async () => {
  let response = await call('/api/chat', { method: 'POST', body: { agent: 'growth', message: '' } });
  assert.equal(response.status, 200);
  assert.ok(response.data.nextQuestion);

  const answers = ['学过 HTML/CSS', '做过一个静态官网，我负责页面实现', '每周 8 小时', '喜欢跟着视频做项目'];
  for (const answer of answers) {
    response = await call('/api/chat', { method: 'POST', body: { agent: 'growth', message: answer } });
    assert.equal(response.status, 200);
  }
  assert.ok(response.data.state.plan);
  assert.ok(response.data.state.plan.phases.length >= 3);
  assert.equal(response.data.engine, 'rule');
});

test('简历导航接口：7 轮生成可编辑草稿', async () => {
  let response = await call('/api/chat', { method: 'POST', body: { agent: 'resume', message: '' } });
  assert.equal(response.status, 200);

  const answers = [
    '张三 | 13800000000 | zhangsan@example.com | 杭州',
    '某职业技术学院 | 软件技术 | 大专 | 2023-2026 | 3.6',
    '校园二手平台 | 前端负责人 | Vue、Axios | 实现登录与商品列表 | 上线后日均 200 次访问',
    '某科技公司 | 前端实习生 | 2025.07-2025.09 | 完成 3 个页面 | 加载提升 20%',
    'Vue(熟练), JavaScript(熟练), Git(了解)',
    '校级一等奖 | 2025.05 | 校级',
    '学习能力强，希望在前端方向长期发展'
  ];
  for (const answer of answers) {
    response = await call('/api/chat', { method: 'POST', body: { agent: 'resume', message: answer } });
    assert.equal(response.status, 200);
  }
  const resume = response.data.state.resume.data;
  assert.equal(resume.basic.name, '张三');
  assert.equal(resume.skills.length, 3);
  assert.ok(response.data.state.resume.completeness > 50);
  assert.ok(response.data.state.resume.version >= 7);
});

test('简历手工编辑保存会生成新版本', async () => {
  const state = (await call('/api/state')).data.state;
  const draft = JSON.parse(JSON.stringify(state.resume.data));
  draft.basic.city = '上海';
  const { status, data } = await call('/api/resume', {
    method: 'PATCH',
    body: { resume: draft }
  });
  assert.equal(status, 200);
  assert.equal(data.state.resume.data.basic.city, '上海');
  assert.equal(data.state.resume.version, state.resume.version + 1);
});

test('计划任务勾选可保存', async () => {
  const state = (await call('/api/state')).data.state;
  const plan = JSON.parse(JSON.stringify(state.plan));
  plan.phases[0].tasks[0].done = true;
  const { status, data } = await call('/api/plan', { method: 'PATCH', body: { plan } });
  assert.equal(status, 200);
  assert.equal(data.state.plan.phases[0].tasks[0].done, true);
});

test('模拟面试接口：基于最新草稿完成 6 轮并评分', async () => {
  let response = await call('/api/chat', { method: 'POST', body: { agent: 'interview', message: '' } });
  assert.equal(response.status, 200);
  assert.ok(response.data.nextQuestion);
  assert.equal(response.data.state.interview.rounds.length, 1);

  for (let i = 0; i < 6; i += 1) {
    response = await call('/api/chat', {
      method: 'POST',
      body: {
        agent: 'interview',
        message: `我负责了登录页和商品列表，用 Vue 实现，上线后访问量提升 30%，解决了一个接口并发问题。第 ${i} 轮`
      }
    });
    assert.equal(response.status, 200);
  }
  assert.equal(response.data.state.interview.status, 'finished');
  assert.ok(response.data.state.interview.score.overall > 0);
});

test('提前结束面试会生成评分', async () => {
  await call('/api/interview/restart', { method: 'POST' });
  await call('/api/chat', { method: 'POST', body: { agent: 'interview', message: '' } });
  await call('/api/chat', { method: 'POST', body: { agent: 'interview', message: '简单回答' } });
  const { status, data } = await call('/api/interview/finish', { method: 'POST' });
  assert.equal(status, 200);
  assert.equal(data.state.interview.status, 'finished');
  assert.ok(data.state.interview.score);
});

test('反馈落库', async () => {
  const { status, data } = await call('/api/feedback', {
    method: 'POST',
    body: { rating: 5, comment: '流程很顺' }
  });
  assert.equal(status, 200);
  assert.equal(data.ok, true);
});

test('非法反馈评分被拒绝', async () => {
  const { status } = await call('/api/feedback', { method: 'POST', body: { rating: 9 } });
  assert.equal(status, 400);
});

test('未知接口返回 JSON 404', async () => {
  const { status, data } = await call('/api/not-exist');
  assert.equal(status, 404);
  assert.ok(data.error);
});

test('统计接口在未配置口令时拒绝访问', async () => {
  const { status } = await call('/api/stats');
  assert.equal(status, 403);
});