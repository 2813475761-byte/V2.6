'use strict';

const { diagnosis } = require('../agents/catalog');

const QUESTIONS = [
  '先聊聊你的起点：你学过哪些和专业相关的课程，或者做过什么小项目、小练习？',
  '这些经历里，哪一项你自己最满意？简单说说你具体做了什么、最后做成了什么样。',
  '你每周大概能拿出多少小时来提升自己？',
  '你更喜欢哪种学习方式：跟着视频做项目、看文档啃基础，还是找人一起练？'
];

function buildTasks(job, missing, answers, hours, style) {
  const focus = missing.slice(0, 3).map((item) => item.name);
  const first = focus.length ? focus.join('、') : '核心基础';
  const project = job.projects[0] || '一个能写进简历的完整项目';
  const second = job.projects[1] || '进阶小项目';
  const hoursText = hours ? `每周投入约 ${hours} 小时` : '每周固定投入时间';
  const styleText = style || '边做边学';
  return [
    {
      title: '第 1 阶段 · 补齐短板（1-4 周）',
      tasks: [
        { text: `用 2 周系统学习 ${first}，每天至少 1 小时，做好笔记`, done: false },
        { text: `完成 ${job.resources[0] ? job.resources[0].name : '官方文档'} 的基础章节，并动手敲一遍示例`, done: false },
        { text: `整理一份「能力自检表」，逐项标注掌握程度`, done: false },
        { text: `${hoursText}，按「${styleText}」的方式推进`, done: false }
      ]
    },
    {
      title: '第 2 阶段 · 做出作品（5-8 周）',
      tasks: [
        { text: `独立完成「${project}」，从需求、设计到上线走完整流程`, done: false },
        { text: `把项目部署到公网或本地可演示，整理 README 和截图`, done: false },
        { text: `再完成一个小练习「${second}」，巩固手感`, done: false },
        { text: '用 STAR 把项目写进简历，准备 3 个可讲的细节', done: false }
      ]
    },
    {
      title: '第 3 阶段 · 面向求职（9-12 周）',
      tasks: [
        { text: `围绕「${job.interviewFocus[0] || '项目难点'}」准备 2 分钟回答`, done: false },
        { text: `围绕「${job.interviewFocus[1] || '岗位理解'}」准备 2 分钟回答`, done: false },
        { text: '做一次模拟面试，录下来复盘表达和结构', done: false },
        { text: '针对目标岗位投递 3-5 份实习/校招，记录反馈', done: false }
      ]
    }
  ];
}

function extractHours(text) {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(?:个)?小时/);
  return match ? match[1] : '';
}

function run(ctx) {
  const { profile, job, messages, userMessage } = ctx;
  const asked = messages.filter((item) => item.role === 'assistant').length;
  const userMessages = messages.filter((item) => item.role === 'user').map((item) => item.content);
  const answers = userMessage ? [...userMessages, userMessage] : userMessages;
  const result = diagnosis(profile, job);

  if (asked < QUESTIONS.length) {
    const question = QUESTIONS[Math.min(asked, QUESTIONS.length - 1)];
    const firstAnswer = String(answers[0] || '').trim().slice(0, 24);
    const bestAnswer = String(answers[1] || '').trim().slice(0, 24);
    const reply =
      asked === 0
        ? `你好，我是你的成长教练。目标岗位先锁定为「${job.name}」。${result.gapSummary} 我们从你的现状开始聊。`
        : asked === 1
        ? `记下了。你提到的「${firstAnswer || '这些课程和练习'}」里，我会重点看能不能拆出可写进简历的产出，比如图纸、模型、页面或可运行 demo。`
        : asked === 2
        ? `「${bestAnswer || '这段经历'}」是你目前最有说服力的素材，建议补上 2 个量化结果（尺寸、数量、成绩或耗时），后面的计划会围绕它安排。`
        : '学习偏好记下了：我会把任务拆成「看一段资料 → 跟着做 → 提交一个产出」的小步，避免只看不练。';
    return {
      reply,
      nextQuestion: question,
      progress: { stage: 'collecting', done: false },
      suggestions: asked === 2 ? ['每周 5 小时', '每周 10 小时', '每周 20 小时'] : []
    };
  }

  if (ctx.plan && Array.isArray(ctx.plan.phases) && ctx.plan.phases.length > 0) {
    return {
      reply: '你的 12 周计划没有改动，仍在右侧。想做哪一项就直接问我，例如"第 1 阶段第 1 项怎么做"，我会按"步骤 + 产出 + 预计用时"拆开讲；要改任务就说"帮我调整计划"。',
      nextQuestion: '',
      progress: { stage: 'done', done: true },
      suggestions: ['帮我调整计划', '再讲讲项目怎么做']
    };
  }

  const hours = extractHours(answers[2] || '');
  const style = answers[3] || '';
  const phases = buildTasks(job, result.missing, answers, hours, style);
  const highlights = [
    `目标明确：主动对标「${job.name}」的岗位要求`,
    `已有基础：${answers[0] ? String(answers[0]).slice(0, 40) : '正在补齐专业课程'}`,
    `学习意愿强：${hours ? `每周可投入 ${hours} 小时` : '愿意持续投入时间'}`
  ];
  const plan = {
    targetJob: job.name,
    matchScore: result.matchScore,
    gapSummary: result.gapSummary,
    dimensions: result.dimensions,
    phases,
    highlights,
    resources: job.resources
  };
  return {
    reply: `信息够了，我按「${job.name}」的要求给你排了一份 12 周计划：先补 ${result.missing
      .slice(0, 3)
      .map((i) => i.name)
      .join('、') || '核心能力'}，再做出可写进简历的作品，最后做面试准备。计划里的任务可以逐条打勾，完成后随时回来调整。`,
    nextQuestion: '',
    planPatch: plan,
    progress: { stage: 'done', done: true },
    suggestions: ['帮我调整计划', '再讲讲项目怎么做']
  };
}

module.exports = { run, QUESTIONS };