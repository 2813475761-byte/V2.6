'use strict';

const repo = require('../repo');
const llm = require('../llm');
const catalog = require('./catalog');
const { getAgent } = require('./index');
const { parseAgentJson, normalizeResult } = require('./parse');
const { mergeResume, normalizeResume, completeness, missingFields } = require('../repo/resume');
const { scoreInterview } = require('../rule/interview');

const HISTORY_LIMIT = 24;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function buildLlmMessages(ctx, agent, history) {
  const messages = [{ role: 'system', content: agent.system(ctx) }];
  for (const item of history.slice(-HISTORY_LIMIT)) {
    if (item.role === 'assistant') {
      const next = item.meta && item.meta.nextQuestion;
      messages.push({
        role: 'assistant',
        content: next ? `${item.content}\n\n【我的提问】${next}` : item.content
      });
    } else if (item.role === 'user') {
      messages.push({ role: 'user', content: item.content });
    }
  }
  if (!messages.some((item) => item.role === 'user')) {
    messages.push({ role: 'user', content: '我们开始吧。' });
  }
  return messages;
}

function hasKeys(value) {
  return value && typeof value === 'object' && Object.keys(value).length > 0;
}

function applyDraft(sessionId, currentResume, patch) {
  if (!hasKeys(patch)) return null;
  return repo.saveResume(sessionId, mergeResume(currentResume, patch));
}

function doneTaskTexts(plan) {
  const texts = new Set();
  for (const phase of (plan && Array.isArray(plan.phases) ? plan.phases : [])) {
    const tasks = phase && Array.isArray(phase.tasks) ? phase.tasks : [];
    for (const task of tasks) {
      if (task && task.done) texts.add(String(task.text || '').trim());
    }
  }
  return texts;
}

function mergePlan(currentPlan, patch) {
  const merged = { ...(currentPlan || {}), ...patch };
  if (!Array.isArray(merged.phases)) merged.phases = currentPlan ? currentPlan.phases || [] : [];
  if (!Array.isArray(merged.dimensions)) merged.dimensions = currentPlan ? currentPlan.dimensions || [] : [];
  if (Array.isArray(patch.phases)) {
    const done = doneTaskTexts(currentPlan);
    merged.phases = merged.phases.map((phase) => {
      const tasks = phase && Array.isArray(phase.tasks) ? phase.tasks : [];
      return {
        ...phase,
        tasks: tasks.map((task) =>
          task && !task.done && done.has(String(task.text || '').trim()) ? { ...task, done: true } : task
        )
      };
    });
  }
  merged.updatedAt = new Date().toISOString();
  return merged;
}

function applyPlan(sessionId, currentPlan, patch) {
  if (!hasKeys(patch)) return null;
  return repo.savePlan(sessionId, mergePlan(currentPlan, patch));
}

const PLAN_ADJUST_RE = /(调整|修改|改一下|改下|改成|改为|重新生成|重做|重排|重新制定|更换|替换|增加|添加|删掉|删除|去掉|减少|压缩|延长|缩短)/;

function shouldAcceptPlanPatch(plan, userMessage) {
  if (!plan || !Array.isArray(plan.phases) || plan.phases.length === 0) return true;
  return PLAN_ADJUST_RE.test(String(userMessage || ''));
}

function applyInterview(interview, result, userMessage, nextQuestion) {
  if (!interview) return null;
  const patch = result.interviewPatch || {};
  const currentRounds = Array.isArray(interview.rounds) ? interview.rounds : [];
  let rounds;
  if (Array.isArray(patch.rounds) && patch.rounds.length >= currentRounds.length) {
    rounds = patch.rounds;
  } else {
    rounds = currentRounds.map((round) => ({ ...round }));
    if (userMessage) {
      const last = rounds[rounds.length - 1];
      if (last && !String(last.answer || '').trim()) {
        last.answer = userMessage;
      } else {
        rounds.push({ question: '', answer: userMessage, feedback: '' });
      }
    }
    if (nextQuestion) {
      rounds.push({ question: nextQuestion, answer: '', feedback: '' });
    }
  }
  const score = patch.score || result.score || null;
  const finished =
    patch.status === 'finished' || Boolean(result.progress && result.progress.done) || Boolean(score);
  if (finished) {
    return repo.finishInterview(
      interview.id,
      { rounds, score, status: 'finished' },
      score && score.overall ? score.overall : null
    );
  }
  return repo.updateInterview(interview.id, { rounds, score: null }, { status: 'active' });
}

function buildState(sessionId) {
  const profile = repo.getProfile(sessionId);
  const latest = repo.getLatestResume(sessionId);
  const plan = repo.getPlan(sessionId);
  const interview = repo.getActiveInterview(sessionId) || repo.getLatestInterview(sessionId);
  const job = catalog.recommendJob(profile);
  return {
    sessionId,
    profile,
    job: {
      id: job.id,
      name: job.name,
      summary: job.summary,
      skills: job.skills,
      projects: job.projects,
      interviewFocus: job.interviewFocus
    },
    resume: {
      version: latest.version,
      data: latest.resume,
      updatedAt: latest.updatedAt,
      completeness: completeness(latest.resume),
      missing: missingFields(latest.resume)
    },
    plan,
    interview: interview
      ? {
          id: interview.id,
          status: interview.status,
          targetJob: interview.targetJob,
          rounds: interview.rounds || [],
          score: interview.score || null,
          createdAt: interview.createdAt
        }
      : null,
    messages: repo.listAllMessages(sessionId, 200),
    llm: llm.runtimeInfo()
  };
}

async function handleChat(sessionId, agentName, userMessage) {
  const agent = getAgent(agentName);
  if (!agent) throw httpError(400, '未知的对话角色');
  const text = String(userMessage || '').trim().slice(0, 2000);

  repo.ensureSession(sessionId);
  const profile = repo.getProfile(sessionId);
  const job = catalog.recommendJob(profile);

  if (text) repo.addMessage(sessionId, agentName, 'user', text);

  const latest = repo.getLatestResume(sessionId);
  const plan = repo.getPlan(sessionId);
  let interview = repo.getActiveInterview(sessionId);
  if (agentName === 'interview' && !interview) {
    interview = repo.createInterview(sessionId, job.name);
  }

  const history = repo.listMessages(sessionId, agentName, HISTORY_LIMIT + 6);
  const ctx = {
    sessionId,
    profile,
    job,
    resume: latest.resume,
    plan,
    interview,
    messages: history,
    userMessage: text
  };

  let result = null;
  let engine = 'rule';
  let notice = '';
  const info = llm.runtimeInfo();

  if (info.mode === 'llm') {
    const response = await llm.chat(buildLlmMessages(ctx, agent, history), {
      temperature: agentName === 'interview' ? 0.6 : 0.45
    });
    if (response.content) {
      const parsed = normalizeResult(parseAgentJson(response.content));
      if (parsed) {
        result = parsed;
        engine = 'llm';
      } else {
        notice = '模型输出格式异常，已切换到离线规则引擎完成本轮。';
      }
    } else {
      notice = response.reason || '模型暂时不可用，已切换到离线规则引擎完成本轮。';
    }
  }

  if (!result) {
    const fallback = normalizeResult(agent.fallback(ctx));
    result = fallback || {
      reply: '我在，我们继续。',
      nextQuestion: '',
      suggestions: [],
      progress: {}
    };
    engine = 'rule';
  }

  applyDraft(sessionId, latest.resume, result.draftPatch);
  applyPlan(sessionId, plan, shouldAcceptPlanPatch(plan, text) ? result.planPatch : null);
  if (interview) applyInterview(interview, result, text, result.nextQuestion);

  repo.addMessage(sessionId, agentName, 'assistant', result.reply, {
    nextQuestion: result.nextQuestion,
    engine,
    suggestions: result.suggestions,
    progress: result.progress
  });

  return {
    reply: result.reply,
    nextQuestion: result.nextQuestion,
    suggestions: result.suggestions,
    progress: result.progress,
    engine,
    notice,
    state: buildState(sessionId)
  };
}

function patchResume(sessionId, payload) {
  repo.ensureSession(sessionId);
  const source = payload && payload.resume ? payload.resume : payload;
  const saved = repo.saveResume(sessionId, normalizeResume(source));
  return { version: saved.version, state: buildState(sessionId) };
}

function resetResume(sessionId) {
  repo.ensureSession(sessionId);
  repo.saveResume(sessionId, normalizeResume({}));
  return buildState(sessionId);
}

function patchPlan(sessionId, plan) {
  repo.ensureSession(sessionId);
  const saved = repo.savePlan(sessionId, plan && typeof plan === 'object' ? plan : {});
  return { plan: saved, state: buildState(sessionId) };
}

function restartInterview(sessionId) {
  const active = repo.getActiveInterview(sessionId);
  if (active) {
    repo.updateInterview(active.id, {}, { status: 'finished', score: null });
  }
  return buildState(sessionId);
}

function finishInterview(sessionId) {
  const interview = repo.getActiveInterview(sessionId);
  if (!interview) throw httpError(404, '当前没有进行中的模拟面试');
  const profile = repo.getProfile(sessionId);
  const job = catalog.recommendJob(profile);
  const latest = repo.getLatestResume(sessionId);
  const score = scoreInterview(interview.rounds || [], latest.resume, job);
  repo.finishInterview(interview.id, { rounds: interview.rounds || [], score }, score.overall);
  return buildState(sessionId);
}

module.exports = {
  handleChat,
  buildState,
  patchResume,
  resetResume,
  patchPlan,
  restartInterview,
  finishInterview,
  applyInterview,
  mergePlan,
  shouldAcceptPlanPatch,
  httpError
};