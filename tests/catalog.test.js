'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../src/agents/catalog');

test('所有岗位资源都带 https 链接', () => {
  const { jobs } = catalog.loadCatalog();
  assert.ok(jobs.length >= 10);
  for (const job of jobs) {
    assert.ok(job.resources.length > 0, job.id);
    for (const item of job.resources) {
      assert.match(item.url, /^https:\/\//, `${job.id}:${item.name}`);
    }
  }
});

test('官方文档资源使用官网链接而非搜索页', () => {
  const job = catalog.findJob('前端开发工程师');
  const mdn = job.resources.find((item) => item.name === 'MDN Web Docs');
  assert.equal(mdn.url, 'https://developer.mozilla.org/zh-CN/docs/Learn');
});

test('视频类资源回退到 B 站搜索链接并编码关键词', () => {
  const job = catalog.recommendJob({ targetJob: '机械设计工程师', major: '机械' });
  const item = job.resources.find((r) => r.url.includes('search.bilibili.com'));
  assert.ok(item, '机械岗位应至少有一条 B 站检索链接');
  assert.ok(item.url.startsWith('https://search.bilibili.com/all?keyword='));
  assert.ok(!item.url.includes(' '));
});