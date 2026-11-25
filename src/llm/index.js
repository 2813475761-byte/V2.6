'use strict';

const config = require('../config');
const { resolveProvider } = require('../config');
const { openaiClient, LLMError } = require('./openai');
const { huaweiClient } = require('./huawei');

const CIRCUIT_COOLDOWN_MS = 60 * 1000;

const state = {
  lastError: '',
  failedAt: 0,
  lastEngine: 'rule'
};

function circuitOpen() {
  return state.failedAt > 0 && Date.now() - state.failedAt < CIRCUIT_COOLDOWN_MS;
}

function runtimeInfo() {
  const provider = resolveProvider();
  return {
    provider: provider.name,
    mode: provider.mode,
    model: provider.model || '',
    reason: provider.reason,
    degraded: circuitOpen(),
    lastError: state.lastError
  };
}

async function chat(messages, options = {}) {
  const provider = resolveProvider();
  if (provider.mode === 'rule') {
    state.lastEngine = 'rule';
    return { content: null, engine: 'rule', provider: provider.name, reason: provider.reason };
  }
  if (circuitOpen()) {
    state.lastEngine = 'rule';
    return {
      content: null,
      engine: 'rule',
      provider: provider.name,
      reason: `模型服务暂时不可用，已切换离线规则引擎（${Math.ceil((CIRCUIT_COOLDOWN_MS - (Date.now() - state.failedAt)) / 1000)} 秒后重试）`
    };
  }
  try {
    const content =
      provider.name === 'huawei'
        ? await huaweiClient.chat(messages, options)
        : await openaiClient.chat(messages, options);
    state.failedAt = 0;
    state.lastError = '';
    state.lastEngine = 'llm';
    return { content, engine: 'llm', provider: provider.name, model: provider.model || '' };
  } catch (error) {
    state.failedAt = Date.now();
    state.lastError = error instanceof LLMError ? error.message : String(error.message || error);
    state.lastEngine = 'rule';
    return {
      content: null,
      engine: 'rule',
      provider: provider.name,
      reason: `模型调用失败，已切换离线规则引擎：${state.lastError}`
    };
  }
}

function resetCircuit() {
  state.failedAt = 0;
  state.lastError = '';
}

module.exports = { chat, runtimeInfo, resetCircuit, state };