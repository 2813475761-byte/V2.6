'use strict';

const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function absolute(value, fallback) {
  const raw = trim(value) || fallback;
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function stripSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

const config = {
  root: ROOT,
  publicDir: path.join(ROOT, 'public'),
  dataDir: path.join(ROOT, 'data'),
  jobCatalogPath: path.join(ROOT, 'data', 'job-catalog.json'),
  port: Number(trim(process.env.PORT) || 3000),
  dbPath: absolute(process.env.DB_PATH, 'data/app.db'),
  adminToken: trim(process.env.ADMIN_TOKEN),
  maxMessageLength: 2000,
  llm: {
    provider: (trim(process.env.LLM_PROVIDER) || 'auto').toLowerCase(),
    timeoutMs: Number(trim(process.env.LLM_TIMEOUT_MS) || 60000),
    openai: {
      baseUrl: stripSlash(trim(process.env.OPENAI_BASE_URL) || 'https://api.deepseek.com/v1'),
      apiKey: trim(process.env.OPENAI_API_KEY),
      model: trim(process.env.OPENAI_MODEL) || 'deepseek-chat'
    },
    huawei: {
      apiKey: trim(process.env.HUAWEI_API_KEY),
      baseUrl: stripSlash(trim(process.env.HUAWEI_BASE_URL) || 'https://api.modelarts-maas.com/v1'),
      model: trim(process.env.HUAWEI_MODEL) || 'pangu-chat',
      ak: trim(process.env.HUAWEI_AK),
      sk: trim(process.env.HUAWEI_SK),
      projectId: trim(process.env.HUAWEI_PROJECT_ID),
      endpoint: stripSlash(trim(process.env.HUAWEI_ENDPOINT)),
      path: trim(process.env.HUAWEI_PATH),
      region: trim(process.env.HUAWEI_REGION) || 'cn-north-4'
    }
  }
};

function resolveProvider() {
  const llm = config.llm;
  if (llm.provider === 'rule') {
    return { name: 'rule', mode: 'rule', reason: '已通过 LLM_PROVIDER 指定离线规则引擎' };
  }
  if (llm.provider === 'openai') {
    if (llm.openai.apiKey) {
      return { name: 'openai', mode: 'llm', model: llm.openai.model, reason: '已配置 OpenAI 兼容协议' };
    }
    return { name: 'rule', mode: 'rule', reason: '缺少 OPENAI_API_KEY，已自动切换离线规则引擎' };
  }
  if (llm.provider === 'huawei') {
    if (llm.huawei.apiKey) {
      return { name: 'huawei', mode: 'llm', model: llm.huawei.model, reason: '已配置华为云 MaaS API Key' };
    }
    if (llm.huawei.ak && llm.huawei.sk && llm.huawei.endpoint && llm.huawei.path) {
      return { name: 'huawei', mode: 'llm', model: llm.huawei.model, reason: '已配置华为云 AK/SK 签名调用' };
    }
    return { name: 'rule', mode: 'rule', reason: '华为云配置不完整，已自动切换离线规则引擎' };
  }
  if (llm.openai.apiKey) {
    return { name: 'openai', mode: 'llm', model: llm.openai.model, reason: '检测到 OPENAI_API_KEY' };
  }
  if (llm.huawei.apiKey) {
    return { name: 'huawei', mode: 'llm', model: llm.huawei.model, reason: '检测到 HUAWEI_API_KEY' };
  }
  if (llm.huawei.ak && llm.huawei.sk && llm.huawei.endpoint && llm.huawei.path) {
    return { name: 'huawei', mode: 'llm', model: llm.huawei.model, reason: '检测到华为云 AK/SK' };
  }
  return { name: 'rule', mode: 'rule', reason: '未配置模型密钥，使用离线规则引擎' };
}

module.exports = config;
module.exports.resolveProvider = resolveProvider;