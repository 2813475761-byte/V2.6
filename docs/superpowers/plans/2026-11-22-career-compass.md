# 职途罗盘 · 实现计划

**目标：** 交付可本地运行、可 Docker 部署的简历成长与求职导航 AI Agent（成长规划 / 简历导航 / 模拟面试三条主线）。

**技术栈：** Node.js 18+、Express 4、better-sqlite3、原生 HTML/CSS/JS、OpenAI 兼容协议 + 华为云双通道。

## 文件结构

| 路径 | 职责 |
|---|---|
| `server.js` | 启动、静态托管、路由挂载、错误处理 |
| `src/config.js` | 读取环境变量，判定模型通道 |
| `src/repo/db.js` | 建库建表、数据库单例 |
| `src/repo/index.js` | 会话/画像/消息/简历/计划/面试/反馈仓储 |
| `src/repo/resume.js` | 草稿默认值、深合并、缺失项处理 |
| `src/llm/openai.js` | OpenAI 兼容客户端 |
| `src/llm/huawei.js` | MaaS + AK/SK 签名客户端 |
| `src/llm/index.js` | 通道选择、超时、降级 |
| `src/prompts/*.js` | 三个 Agent 的系统提示词 |
| `src/agents/growth.js` | 成长规划 |
| `src/agents/resume.js` | 简历导航 |
| `src/agents/interview.js` | 模拟面试 |
| `src/agents/orchestrator.js` | 分发、输出解析、状态落库 |
| `src/rule/engine.js` | 离线规则引擎 |
| `src/routes/*.js` | HTTP 接口 |
| `data/job-catalog.json` | 岗位能力图谱 |
| `public/*` | 单页前端 |
| `tests/*.test.js` | 单元与接口测试 |

## 任务拆解

1. 配置与数据库：建表、仓储、草稿合并 —— 测试：仓储 CRUD、草稿深合并。
2. 模型层：OpenAI 兼容 + 华为云签名 + 降级 —— 测试：签名向量、解析、错误降级。
3. 规则引擎：成长/简历/面试三套确定性流程 —— 测试：三条主线状态推进。
4. Agent 编排：提示词、结构化输出解析、落库 —— 测试：输出解析容错。
5. 接口层：session/profile/chat/resume/interview/feedback/meta/stats。
6. 前端：画像、对话、简历编辑器、计划面板、面试面板、反馈。
7. 交付：README、.env.example、Dockerfile。
8. 验收：`npm test` + 启动服务跑通三条主线。

## 验收标准

- [ ] 无任何模型密钥时，三条主线可完整演示。
- [ ] 配置密钥后走真实模型，接口返回结构不变。
- [ ] 简历草稿可编辑保存并保留版本。
- [ ] 面试读取最新草稿并逐轮追问，结束有评分。
- [ ] 反馈落库，统计接口可用。
- [ ] `npm test` 全部通过。