'use strict';

const config = require('../config');

class LLMError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LLMError';
    this.status = options.status || 0;
    this.provider = options.provider || 'openai';
  }
}

function extractContent(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  const choice = data.choices && data.choices[0];
  if (choice) {
    if (choice.message && typeof choice.message.content === 'string') return choice.message.content;
    if (typeof choice.text === 'string') return choice.text;
  }
  const candidates = [data.result, data.response, data.answer, data.content, data.output_text];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) return item;
    if (item && typeof item.content === 'string' && item.content.trim()) return item.content;
    if (item && typeof item.text === 'string' && item.text.trim()) return item.text;
  }
  if (data.data && typeof data.data === 'object') {
    if (typeof data.data.content === 'string') return data.data.content;
    if (typeof data.data.result === 'string') return data.data.result;
  }
  return '';
}

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new LLMError(`模型服务连接失败：${error.message}`, { provider: options.provider });
  }
  const text = await response.text();
  if (!response.ok) {
    throw new LLMError(`模型服务返回 ${response.status}：${text.slice(0, 300)}`, {
      status: response.status,
      provider: options.provider
    });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new LLMError(`模型响应不是合法 JSON：${text.slice(0, 200)}`, { provider: options.provider });
  }
}

function openAICompatible(baseUrl, apiKey, model) {
  return async function chat(messages, { temperature = 0.4, maxTokens = 4000 } = {}) {
    const url = `${baseUrl}/chat/completions`;
    const data = await requestJson(url, {
      method: 'POST',
      provider: 'openai',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        stream: false
      }),
      signal: AbortSignal.timeout(config.llm.timeoutMs)
    });
    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    if (choice && choice.finish_reason === 'length') {
      throw new LLMError('模型输出达到长度上限被截断，无法保证 JSON 完整', { provider: 'openai' });
    }
    const content = extractContent(data);
    if (!content) throw new LLMError('模型返回内容为空', { provider: 'openai' });
    return content;
  };
}

const openaiClient = {
  get ready() {
    return Boolean(config.llm.openai.apiKey);
  },
  chat(messages, options) {
    return openAICompatible(
      config.llm.openai.baseUrl,
      config.llm.openai.apiKey,
      config.llm.openai.model
    )(messages, options);
  }
};

module.exports = { openaiClient, openAICompatible, extractContent, requestJson, LLMError };