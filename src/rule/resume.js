'use strict';

const { mergeResume, missingFields, completeness } = require('../repo/resume');

const STEPS = [
  {
    key: 'basic',
    label: '基本信息',
    question: '我们开始补基本信息。请按「姓名 | 手机号 | 邮箱 | 意向城市」的格式发给我，没有的填「无」。'
  },
  {
    key: 'education',
    label: '教育背景',
    question: '接下来是教育背景，按「学校 | 专业 | 学历 | 起止时间 | GPA」发给我，没有的填「无」。'
  },
  {
    key: 'project',
    label: '项目经历',
    question:
      '说一个你最拿得出手的项目，按「项目名 | 你的角色 | 技术栈 | 你做的事 | 取得的成果」发给我；有多件事用顿号隔开。'
  },
  {
    key: 'internship',
    label: '实习经历',
    question: '有实习或兼职经历吗？按「公司 | 岗位 | 时间 | 你做的事 | 成果」发给我；没有就回复「暂无」。'
  },
  {
    key: 'skills',
    label: '专业技能',
    question: '你掌握哪些技能？用逗号分隔，熟练度可以写在括号里，例如：Vue(熟练)、Python(了解)。'
  },
  {
    key: 'award',
    label: '奖项证书',
    question: '获得过哪些奖项或证书？按「名称 | 时间 | 级别」发给我；没有就回复「暂无」。'
  },
  {
    key: 'summary',
    label: '自我评价',
    question: '最后，用两句话说说你的优势，以及为什么适合这个岗位。'
  }
];

function splitPipe(text) {
  return String(text || '')
    .split(/\s*[|｜]\s*/)
    .map((part) => part.trim())
    .filter((part, index, arr) => part !== '' || index < arr.length);
}

function splitList(text) {
  return String(text || '')
    .split(/[、;；,，]/)
    .map((item) => item.trim())
    .filter((item) => item && !/^(无|暂无|没有)$/.test(item));
}

function isNone(text) {
  return /^(无|暂无|没有|跳过|没|no)$/i.test(String(text || '').trim());
}

function cleanContact(value, phone, email) {
  return String(value || '')
    .replace(phone || '__none__', '')
    .replace(email || '__none__', '')
    .replace(/[,，;；]/g, ' ')
    .trim();
}

function parseBasic(text) {
  const raw = String(text || '').trim();
  if (!raw || isNone(raw)) return { patch: {}, note: '基本信息先标记为待补充' };
  const phone = (raw.match(/1[3-9]\d{9}/) || [''])[0];
  const email = (raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0];
  const parts = splitPipe(raw);
  let name = '';
  let city = '';
  if (parts.length >= 3) {
    name = cleanContact(parts[0], phone, email);
    city = parts[3] || '';
  } else {
    name = cleanContact(parts[0], phone, email);
    city = parts[1] || '';
  }
  return {
    patch: {
      basic: {
        name,
        phone: phone || (parts.length >= 2 ? parts[1] : ''),
        email: email || (parts.length >= 3 ? parts[2] : ''),
        city
      }
    },
    note: '基本信息'
  };
}

function parseEducation(text) {
  const raw = String(text || '').trim();
  if (!raw || isNone(raw)) return { patch: {}, note: '教育背景先标记为待补充' };
  const parts = splitPipe(raw);
  return {
    patch: {
      education: {
        school: parts[0] || '',
        major: parts[1] || '',
        degree: parts[2] || '',
        startEnd: parts[3] || '',
        gpa: parts[4] || ''
      }
    },
    note: '教育背景'
  };
}

function parseProject(text) {
  const raw = String(text || '').trim();
  if (!raw || isNone(raw)) return { patch: {}, note: '项目经历先标记为待补充' };
  const parts = splitPipe(raw);
  return {
    patch: {
      projects: [
        {
          name: parts[0] || '',
          role: parts[1] || '',
          tech: splitList(parts[2] || ''),
          actions: splitList(parts[3] || ''),
          results: splitList(parts[4] || ''),
          background: ''
        }
      ]
    },
    note: '项目经历'
  };
}

function parseInternship(text) {
  const raw = String(text || '').trim();
  if (!raw || isNone(raw)) return { patch: { internships: [] }, note: '实习经历标记为暂无' };
  const parts = splitPipe(raw);
  return {
    patch: {
      internships: [
        {
          company: parts[0] || '',
          role: parts[1] || '',
          period: parts[2] || '',
          actions: splitList(parts[3] || ''),
          results: splitList(parts[4] || '')
        }
      ]
    },
    note: '实习经历'
  };
}

function parseSkills(text) {
  const raw = String(text || '').trim();
  if (!raw || isNone(raw)) return { patch: {}, note: '技能先标记为待补充' };
  const skills = splitList(raw).map((item) => {
    const match = item.match(/^(.+?)\s*[（(]\s*(.+?)\s*[)）]\s*$/);
    return match ? { name: match[1].trim(), level: match[2].trim() } : { name: item.trim(), level: '' };
  });
  return { patch: { skills }, note: '专业技能' };
}

function parseAward(text) {
  const raw = String(text || '').trim();
  if (!raw || isNone(raw)) return { patch: { awards: [] }, note: '奖项证书标记为暂无' };
  const parts = splitPipe(raw);
  return {
    patch: { awards: [{ name: parts[0] || '', date: parts[1] || '', level: parts[2] || '' }] },
    note: '奖项证书'
  };
}

function parseSummary(text, job) {
  const raw = String(text || '').trim();
  if (!raw || isNone(raw)) return { patch: {}, note: '自我评价先标记为待补充' };
  return {
    patch: { selfEvaluation: raw.slice(0, 300) },
    note: '自我评价'
  };
}

const PARSERS = {
  basic: parseBasic,
  education: parseEducation,
  project: parseProject,
  internship: parseInternship,
  skills: parseSkills,
  award: parseAward,
  summary: parseSummary
};

function buildHighlights(resume, job) {
  const highlights = [];
  const project = resume.projects.find((item) => item.name);
  if (project) {
    const result = (project.results || [])[0];
    highlights.push(`有「${project.name}」项目经历${project.role ? `，担任${project.role}` : ''}${result ? `，${result}` : ''}`);
  }
  if (resume.skills.length) {
    highlights.push(`掌握 ${resume.skills.map((s) => s.name).slice(0, 5).join('、')} 等 ${resume.skills.length} 项技能`);
  }
  if (resume.internships.some((item) => item.company)) {
    highlights.push('有真实实习经历，具备职场协作基础');
  }
  if (resume.awards.some((item) => item.name)) {
    highlights.push(`获得过 ${resume.awards.filter((i) => i.name).map((i) => i.name).join('、')}`);
  }
  if (!highlights.length) highlights.push('正在补齐可写进简历的经历');
  return highlights.slice(0, 4);
}

function run(ctx) {
  const { profile, job, resume, messages, userMessage } = ctx;
  const answers = messages.filter((item) => item.role === 'user').map((item) => item.content);
  const stepIndex = answers.length - 1;

  if (answers.length === 0) {
    const missing = missingFields(resume);
    return {
      reply: `好的，我们用 7 个问题把简历搭起来，全程一次只问一个。目标岗位我先按「${
        job.name
      }」来对齐。目前草稿有 ${missing.length} 处待补充，我们一项项来。`,
      nextQuestion: STEPS[0].question,
      progress: { stage: 'basic', done: false },
      suggestions: []
    };
  }

  if (stepIndex >= STEPS.length) {
    const missing = missingFields(resume);
    const percent = completeness(resume);
    return {
      reply: `简历草稿完成度约 ${percent}%，还有 ${missing.length} 处待补充（如 ${
        missing.slice(0, 3).map((i) => i.label).join('、') || '无'
      }）。亮点：${buildHighlights(resume, job).join('；')}。右侧可以直接修改任意字段，改完自动保存；准备好了就切到「模拟面试」，我会用这份最新草稿出题。`,
      nextQuestion: '',
      progress: { stage: 'done', done: true },
      suggestions: ['开始模拟面试', '还有哪些待补充']
    };
  }

  const step = STEPS[stepIndex];
  const parser = PARSERS[step.key];
  const parsed = parser ? parser(userMessage || answers[stepIndex] || '', job) : { patch: {}, note: step.label };
  const nextResume = mergeResume(resume, parsed.patch);
  const missing = missingFields(nextResume);
  const isLast = stepIndex === STEPS.length - 1;

  if (isLast) {
    return {
      reply: `已更新「${parsed.note}」。简历草稿完成度约 ${completeness(nextResume)}%，还剩 ${
        missing.length
      } 处待补充。亮点：${buildHighlights(nextResume, job).join('；')}。右侧的草稿可以直接编辑，确认无误后就可以去模拟面试了。`,
      nextQuestion: '',
      draftPatch: parsed.patch,
      progress: { stage: 'done', done: true },
      suggestions: ['开始模拟面试', '还有哪些待补充']
    };
  }

  const nextStep = STEPS[stepIndex + 1];
  return {
    reply: `已更新「${parsed.note}」${
      missing.length ? `，还缺：${missing.slice(0, 3).map((i) => i.label).join('、')}` : ''
    }。${nextStep.label}这块继续：`,
    nextQuestion: nextStep.question,
    draftPatch: parsed.patch,
    progress: { stage: step.key, done: false },
    suggestions: nextStep.key === 'internship' || nextStep.key === 'award' ? ['暂无'] : []
  };
}

module.exports = { run, STEPS, buildHighlights, parseBasic, parseEducation, parseProject, parseSkills };