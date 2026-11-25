'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const growth = require('../src/rule/growth');
const resumeRule = require('../src/rule/resume');
const interviewRule = require('../src/rule/interview');
const catalog = require('../src/agents/catalog');
const { emptyResume, mergeResume } = require('../src/repo/resume');

const profile = {
  grade: '大二',
  major: '软件技术',
  targetJob: '前端开发工程师',
  skills: [{ name: 'HTML', level: '了解' }]
};
const job = catalog.findJob('前端开发工程师');

function ctx(messages, userMessage, extra = {}) {
  return {
    profile,
    job,
    resume: emptyResume(),
    plan: null,
    interview: null,
    messages,
    userMessage,
    ...extra
  };
}

test('成长规划：4 轮后生成包含阶段任务的计划', () => {
  const messages = [];
  let result = growth.run(ctx(messages, ''));
  assert.ok(result.nextQuestion);
  messages.push({ role: 'assistant', content: result.reply, meta: { nextQuestion: result.nextQuestion } });

  const answers = ['学过 HTML/CSS，做过课程作业', '最满意的是一个静态官网，我负责页面实现', '每周能投入 8 小时', '喜欢跟着视频做项目'];
  for (const answer of answers) {
    messages.push({ role: 'user', content: answer });
    result = growth.run(ctx(messages, answer));
    if (result.nextQuestion) {
      messages.push({ role: 'assistant', content: result.reply, meta: { nextQuestion: result.nextQuestion } });
    }
  }
  assert.ok(result.planPatch, '应生成计划');
  assert.equal(result.progress.done, true);
  assert.ok(result.planPatch.phases.length >= 3);
  assert.ok(result.planPatch.matchScore >= 0 && result.planPatch.matchScore <= 100);
  assert.match(result.planPatch.phases[0].tasks[0].text, /每周|学习|完成/);
});

test('简历导航：按 7 个问题逐项生成草稿', () => {
  const messages = [];
  let resume = emptyResume();
  let result = resumeRule.run(ctx(messages, '', { resume }));
  assert.ok(result.nextQuestion.includes('姓名'));
  messages.push({ role: 'assistant', content: result.reply, meta: { nextQuestion: result.nextQuestion } });

  const answers = [
    '张三 | 13800000000 | zhangsan@example.com | 杭州',
    '某职业技术学院 | 软件技术 | 大专 | 2023-2026 | 3.6',
    '校园二手平台 | 前端负责人 | Vue、Axios | 实现登录与商品列表、封装请求 | 上线后日均 200 次访问',
    '某科技公司 | 前端实习生 | 2025.07-2025.09 | 完成 3 个页面 | 页面加载提升 20%',
    'Vue(熟练), JavaScript(熟练), Git(了解)',
    '校级一等奖 | 2025.05 | 校级',
    '学习能力强，能快速上手新框架，希望在前端方向长期发展'
  ];
  for (const answer of answers) {
    messages.push({ role: 'user', content: answer });
    result = resumeRule.run(ctx(messages, answer, { resume }));
    resume = mergeResume(resume, result.draftPatch || {});
    if (result.nextQuestion) {
      messages.push({ role: 'assistant', content: result.reply, meta: { nextQuestion: result.nextQuestion } });
    }
  }
  assert.equal(result.progress.done, true);
  assert.equal(resume.basic.name, '张三');
  assert.equal(resume.basic.phone, '13800000000');
  assert.equal(resume.education.school, '某职业技术学院');
  assert.ok(resume.projects[0].name.includes('二手平台'));
  assert.equal(resume.skills.length, 3);
  assert.ok(resume.selfEvaluation.includes('学习能力'));
});

test('简历导航：回答暂无时跳过实习与奖项', () => {
  let resume = mergeResume(emptyResume(), {
    basic: { name: '李四' },
    education: { school: '某学院' },
    projects: [{ name: '课程设计' }]
  });
  const messages = [
    { role: 'user', content: '张三 | 138 | a@b.com | 杭州' },
    { role: 'user', content: '某学院 | 软件 | 大专 | 2023 | 3.0' },
    { role: 'user', content: '课程设计 | 开发 | Java | 写接口 | 通过答辩' },
    { role: 'user', content: '暂无' }
  ];
  const result = resumeRule.run(ctx(messages, '暂无', { resume }));
  assert.deepEqual(result.draftPatch.internships, []);
  assert.equal(result.progress.done, false);
});

test('模拟面试：6 轮回答后给出评分', () => {
  const resume = mergeResume(emptyResume(), {
    basic: { name: '张三', targetJob: '前端开发工程师' },
    projects: [{ name: '校园二手平台', role: '前端负责人' }]
  });
  let interview = { rounds: [] };
  let result = interviewRule.run({
    profile,
    job,
    resume,
    interview,
    messages: [],
    userMessage: ''
  });
  assert.equal(result.interviewPatch.rounds.length, 1);

  for (let i = 0; i < 6; i += 1) {
    interview = { rounds: result.interviewPatch.rounds };
    result = interviewRule.run({
      profile,
      job,
      resume,
      interview,
      messages: [],
      userMessage: `我负责了登录页和商品列表，用 Vue 实现，上线后访问量提升了 30%，解决了接口并发问题。第 ${i} 轮`
    });
  }
  assert.equal(result.interviewPatch.status, 'finished');
  assert.ok(result.interviewPatch.score.overall > 0);
  assert.equal(result.interviewPatch.score.dimensions.length, 4);
});

test('岗位图谱可以按名称与专业匹配', () => {
  assert.equal(catalog.findJob('前端').id, 'frontend');
  assert.equal(catalog.findJob('Java开发').id, 'backend');
  assert.ok(catalog.findJobsByMajor('护理学').some((item) => item.id === 'nursing'));
  assert.ok(catalog.recommendJob({ major: '电子商务' }).id);
});

test('岗位诊断会给出差距摘要', () => {
  const diagnosis = catalog.diagnosis({ targetJob: '前端开发工程师', skills: ['HTML/CSS/JavaScript'] }, job);
  assert.ok(diagnosis.matchScore > 0);
  assert.ok(diagnosis.gapSummary.includes('前端开发工程师'));
  assert.ok(diagnosis.dimensions.length === job.skills.length);
});