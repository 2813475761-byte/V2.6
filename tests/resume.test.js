'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  emptyResume,
  normalizeResume,
  mergeResume,
  mergeSkills,
  missingFields,
  completeness,
  resumeToText
} = require('../src/repo/resume');

test('默认草稿结构完整', () => {
  const resume = emptyResume();
  assert.equal(resume.basic.name, '');
  assert.deepEqual(resume.skills, []);
  assert.equal(resume.projects.length, 1);
  assert.equal(resume.education.school, '');
});

test('深合并保留未修改字段并写入新值', () => {
  const base = emptyResume();
  const merged = mergeResume(base, {
    basic: { name: '李四' },
    education: { school: '某职业技术学院' }
  });
  assert.equal(merged.basic.name, '李四');
  assert.equal(merged.education.school, '某职业技术学院');
  assert.equal(merged.basic.phone, '');
});

test('空字符串不会覆盖已有值', () => {
  const base = mergeResume(emptyResume(), { basic: { name: '王五' } });
  const merged = mergeResume(base, { basic: { name: '' } });
  assert.equal(merged.basic.name, '王五');
});

test('项目数组按下标合并', () => {
  const base = mergeResume(emptyResume(), { projects: [{ name: '校园二手平台' }] });
  const merged = mergeResume(base, { projects: [{ role: '前端负责人' }] });
  assert.equal(merged.projects[0].name, '校园二手平台');
  assert.equal(merged.projects[0].role, '前端负责人');
});

test('技能按名称去重合并', () => {
  const skills = mergeSkills([{ name: 'Vue', level: '' }], [{ name: 'Vue', level: '熟练' }, 'Python']);
  assert.equal(skills.length, 2);
  assert.equal(skills[0].level, '熟练');
  assert.equal(skills[1].name, 'Python');
});

test('字符串数组自动去重', () => {
  const merged = mergeResume({ ...emptyResume(), education: { courses: ['数学'] } }, { education: { courses: ['数学', '英语'] } });
  assert.deepEqual(merged.education.courses, ['数学', '英语']);
});

test('缺失字段与完成度计算', () => {
  const empty = emptyResume();
  assert.ok(missingFields(empty).length > 5);
  assert.equal(completeness(empty), 0);

  const filled = mergeResume(empty, {
    basic: { name: '张三', phone: '13800000000', email: 'a@b.com', city: '杭州', targetJob: '前端开发工程师' },
    education: { school: '某学院', major: '软件技术', degree: '大专', startEnd: '2023-2026', gpa: '3.6' },
    skills: ['Vue', 'JavaScript', 'Git'],
    projects: [{ name: '校园平台', role: '前端', background: '课程项目', results: ['上线运行'] }],
    internships: [{ company: '某公司', role: '前端实习', results: ['完成 3 个页面'] }],
    awards: [{ name: '校级一等奖' }],
    selfEvaluation: '学习能力强'
  });
  assert.equal(completeness(filled), 100);
});

test('非法输入归一化为默认草稿', () => {
  assert.deepEqual(normalizeResume(null).basic, emptyResume().basic);
  assert.deepEqual(normalizeResume({ skills: 'not-array' }).skills, []);
});

test('简历文本包含关键信息', () => {
  const resume = mergeResume(emptyResume(), {
    basic: { name: '赵六', targetJob: '前端开发工程师' },
    skills: [{ name: 'Vue', level: '熟练' }],
    projects: [{ name: '校园平台', role: '前端', actions: ['实现登录页'], results: ['上线'] }]
  });
  const text = resumeToText(resume);
  assert.match(text, /赵六/);
  assert.match(text, /Vue（熟练）/);
  assert.match(text, /校园平台/);
});