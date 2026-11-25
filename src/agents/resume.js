'use strict';

const { resumeSystem } = require('../prompts');
const rule = require('../rule/resume');

module.exports = {
  name: 'resume',
  title: '简历顾问',
  description: '面向大三，一次一问挖掘经历并生成可编辑简历草稿',
  system: resumeSystem,
  fallback: rule.run
};