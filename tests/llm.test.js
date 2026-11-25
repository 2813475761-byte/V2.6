'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSignature, sdkDate } = require('../src/llm/huawei');
const { extractContent, openAICompatible } = require('../src/llm/openai');
const { parseAgentJson, normalizeResult } = require('../src/agents/parse');

test('华为云签名结果稳定且格式正确', () => {
  const date = new Date('2026-11-22T06:30:00.000Z');
  const options = {
    method: 'POST',
    url: 'https://pangu.example.com/v1/chat?b=2&a=1',
    body: '{"messages":[]}',
    ak: 'AKIDEXAMPLE',
    sk: 'SECRETEXAMPLE',
    date
  };
  const first = buildSignature(options);
  const second = buildSignature(options);
  assert.equal(first.signature, second.signature);
  assert.match(first.authorization, /^SDK-HMAC-SHA256 Access=AKIDEXAMPLE, SignedHeaders=/);
  assert.match(first.signedHeaders, /host/);
  assert.match(first.signedHeaders, /x-sdk-date/);
  assert.equal(first.timestamp, '20261122T063000Z');
  assert.match(first.canonicalRequest, /\na=1&b=2\n/);
});

test('sdkDate 输出标准格式', () => {
  assert.equal(sdkDate(new Date('2026-01-02T03:04:05.678Z')), '20260102T030405Z');
});

test('extractContent 兼容多种响应结构', () => {
  assert.equal(extractContent({ choices: [{ message: { content: 'A' } }] }), 'A');
  assert.equal(extractContent({ result: 'B' }), 'B');
  assert.equal(extractContent({ data: { content: 'C' } }), 'C');
  assert.equal(extractContent({}), '');
});

test('OpenAI 兼容客户端在缺少密钥时抛出可读错误', async () => {
  const chat = openAICompatible('http://127.0.0.1:1/v1', '', 'demo');
  await assert.rejects(() => chat([{ role: 'user', content: 'hi' }]), /连接失败/);
});

test('解析模型输出：纯 JSON', () => {
  const value = parseAgentJson('{"reply":"你好","nextQuestion":"问题"}');
  assert.equal(value.reply, '你好');
});

test('解析模型输出：代码块包裹', () => {
  const value = parseAgentJson('```json\n{"reply":"你好"}\n```');
  assert.equal(value.reply, '你好');
});

test('解析模型输出：前后有说明文字', () => {
  const value = parseAgentJson('这是我的回复：{"reply":"你好","nextQuestion":"继续吗"} 以上。');
  assert.equal(value.nextQuestion, '继续吗');
});

test('解析模型输出：非法内容返回 null', () => {
  assert.equal(parseAgentJson('完全不是 JSON'), null);
  assert.equal(parseAgentJson(''), null);
});

test('归一化结果补全默认字段', () => {
  const result = normalizeResult({ reply: '好的', suggestions: ['a', 'b', 'c', 'd', 'e'] });
  assert.equal(result.reply, '好的');
  assert.equal(result.nextQuestion, '');
  assert.equal(result.suggestions.length, 4);
});

test('归一化结果对空内容返回 null', () => {
  assert.equal(normalizeResult({}), null);
  assert.equal(normalizeResult({ reply: '   ' }), null);
});
test('OpenAI 兼容客户端请求 JSON 模式与更大的输出上限', async () => {
  const bodies = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"reply":"ok"}' }, finish_reason: 'stop' }] }),
      { status: 200 }
    );
  };
  try {
    const chat = openAICompatible('http://example.com/v1', 'key', 'demo');
    assert.equal(await chat([{ role: 'user', content: 'hi' }]), '{"reply":"ok"}');
    assert.deepEqual(bodies[0].response_format, { type: 'json_object' });
    assert.equal(bodies[0].max_tokens, 4000);
  } finally {
    global.fetch = original;
  }
});

test('OpenAI 兼容客户端把截断响应当作失败', async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: '{"reply":"被截断' }, finish_reason: 'length' }] }),
      { status: 200 }
    );
  try {
    const chat = openAICompatible('http://example.com/v1', 'key', 'demo');
    await assert.rejects(() => chat([{ role: 'user', content: 'hi' }]), /截断/);
  } finally {
    global.fetch = original;
  }
});