'use strict';

const { interviewSystem } = require('../prompts');
const rule = require('../rule/interview');

module.exports = {
  name: 'interview',
  title: '模拟面试官',
  description: '基于最新简历草稿出题并逐轮追问，结束后评分',
  system: interviewSystem,
  fallback: rule.run
};