'use strict';

const express = require('express');
const config = require('../config');
const repo = require('../repo');
const catalog = require('../agents/catalog');
const { listAgents } = require('../agents');
const llm = require('../llm');
const {
  buildState,
  patchResume,
  patchPlan,
  resetResume,
  restartInterview,
  finishInterview,
  httpError,
  handleChat
} = require('../agents/orchestrator');

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function text(value, maxLength = 200) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .slice(0, maxLength);
}

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), llm: llm.runtimeInfo() });
});

router.post('/session', (req, res) => {
  res.json({ state: buildState(req.sessionId) });
});

router.get('/state', (req, res) => {
  res.json({ state: buildState(req.sessionId) });
});

router.get('/meta', (req, res) => {
  res.json({
    jobs: catalog.listJobs(),
    agents: listAgents(),
    llm: llm.runtimeInfo()
  });
});

router.get('/jobs/:id', (req, res) => {
  const job = catalog.jobDetail(req.params.id);
  if (!job) throw httpError(404, '岗位不存在');
  res.json({ job });
});

router.post('/analyze', (req, res) => {
  const body = req.body || {};
  const skills = Array.isArray(body.skills) ? body.skills.slice(0, 30) : [];
  res.json({
    items: catalog.analyzeJobs({
      major: text(body.major, 40),
      grade: text(body.grade, 20),
      schoolType: text(body.schoolType, 8),
      skills
    })
  });
});

router.put('/profile', (req, res) => {
  const body = req.body || {};
  const skills = Array.isArray(body.skills) ? body.skills.slice(0, 30) : [];
  const profile = repo.saveProfile(req.sessionId, {
    schoolType: text(body.schoolType, 8),
    grade: text(body.grade, 20),
    major: text(body.major, 40),
    targetJob: text(body.targetJob, 40),
    skills
  });
  res.json({ profile, state: buildState(req.sessionId) });
});

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const agent = text(body.agent, 20);
    const message = text(body.message, config.maxMessageLength + 1);
    if (!agent) throw httpError(400, '缺少 agent 参数');
    if (message.length > config.maxMessageLength) {
      throw httpError(400, `单条消息不能超过 ${config.maxMessageLength} 字`);
    }
    const result = await handleChat(req.sessionId, agent, message);
    res.json(result);
  })
);

router.patch('/resume', (req, res) => {
  const body = req.body || {};
  const payload = body.resume || body.data || body;
  const result = patchResume(req.sessionId, payload);
  res.json(result);
});

router.patch('/plan', (req, res) => {
  const body = req.body || {};
  const plan = body.plan || body.data || body;
  res.json(patchPlan(req.sessionId, plan));
});

router.post('/resume/reset', (req, res) => {
  res.json({ state: resetResume(req.sessionId) });
});

router.post('/interview/finish', (req, res) => {
  res.json({ state: finishInterview(req.sessionId) });
});

router.post('/interview/restart', (req, res) => {
  res.json({ state: restartInterview(req.sessionId) });
});

router.post('/feedback', (req, res) => {
  const body = req.body || {};
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw httpError(400, '评分需为 1-5 的整数');
  }
  repo.addFeedback(req.sessionId, rating, text(body.comment, 1000));
  res.json({ ok: true });
});

router.get('/stats', (req, res) => {
  if (!config.adminToken || req.query.token !== config.adminToken) {
    throw httpError(403, '无权访问统计接口');
  }
  res.json({ stats: repo.getStats(), llm: llm.runtimeInfo() });
});

module.exports = router;
module.exports.asyncHandler = asyncHandler;