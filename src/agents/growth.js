'use strict';

const { growthSystem } = require('../prompts');
const rule = require('../rule/growth');

module.exports = {
  name: 'growth',
  title: '成长教练',
  description: '面向大一大二，诊断岗位能力差距并生成阶段提升计划',
  system: growthSystem,
  fallback: rule.run
};