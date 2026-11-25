'use strict';

const crypto = require('crypto');
const config = require('../config');
const { openAICompatible, extractContent, requestJson, LLMError } = require('./openai');

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

function sdkDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalQuery(searchParams) {
  return [...searchParams.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function buildSignature({ method, url, body, ak, sk, extraHeaders = {}, date = new Date() }) {
  const parsed = new URL(url);
  const timestamp = sdkDate(date);
  const headers = {
    'content-type': 'application/json',
    host: parsed.host,
    'x-sdk-date': timestamp
  };
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers[key.toLowerCase()] = String(value);
  }
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${String(headers[name]).trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const signedHeaders = names.join(';');
  const payloadHash = sha256Hex(body || '');
  const canonicalRequest = [
    String(method || 'POST').toUpperCase(),
    parsed.pathname || '/',
    canonicalQuery(parsed.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  const stringToSign = ['SDK-HMAC-SHA256', timestamp, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmacHex(sk, stringToSign);
  return {
    timestamp,
    canonicalRequest,
    stringToSign,
    signedHeaders,
    signature,
    authorization: `SDK-HMAC-SHA256 Access=${ak}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    headers: {
      'Content-Type': 'application/json',
      'X-Sdk-Date': timestamp,
      Authorization: `SDK-HMAC-SHA256 Access=${ak}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
  };
}

const huaweiClient = {
  get mode() {
    const hw = config.llm.huawei;
    if (hw.apiKey) return 'maas';
    if (hw.ak && hw.sk && hw.endpoint && hw.path) return 'aksk';
    return 'none';
  },
  get ready() {
    return this.mode !== 'none';
  },
  chat(messages, options = {}) {
    if (this.mode === 'maas') {
      return openAICompatible(
        config.llm.huawei.baseUrl,
        config.llm.huawei.apiKey,
        config.llm.huawei.model
      )(messages, options);
    }
    if (this.mode === 'aksk') {
      return chatWithAksk(messages, options);
    }
    throw new LLMError('华为云配置不完整', { provider: 'huawei' });
  }
};

async function chatWithAksk(messages, { temperature = 0.4, maxTokens = 1400 } = {}) {
  const hw = config.llm.huawei;
  const path = hw.path.replace('{project_id}', encodeURIComponent(hw.projectId || ''));
  const url = `${hw.endpoint}${path.startsWith('/') ? '' : '/'}${path}`;
  const body = JSON.stringify({
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false
  });
  const signed = buildSignature({
    method: 'POST',
    url,
    body,
    ak: hw.ak,
    sk: hw.sk
  });
  const data = await requestJson(url, {
    method: 'POST',
    provider: 'huawei',
    headers: signed.headers,
    body,
    signal: AbortSignal.timeout(config.llm.timeoutMs)
  });
  const content = extractContent(data);
  if (!content) throw new LLMError('华为云返回内容为空', { provider: 'huawei' });
  return content;
}

module.exports = { huaweiClient, buildSignature, sdkDate, chatWithAksk };