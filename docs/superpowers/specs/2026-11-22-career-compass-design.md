# 职途罗盘 · 设计与实现说明

- 版本：v1.0（MVP）
- 日期：2026-11-22
- 赛题：华为云码道（CodeArts）编程智能体应用竞赛 · 开放命题

## 1. 背景与目标

大一大二学生对「专业对应什么岗位、需要哪些技能」缺乏认知；大三大四学生手握经历却不会在简历中呈现亮点，也不知道与目标岗位的差距。职途罗盘把两个阶段串成一条可执行的成长链路：

1. **成长规划**：画像 → 岗位能力诊断 → 分阶段提升计划。
2. **简历导航**：逐条挖掘经历 → 生成结构化、可编辑的简历草稿 → 岗位匹配亮点分析。
3. **模拟面试**：基于最新简历草稿出题，跟随回答继续追问，结束后给出评分与建议。

三条主线共享同一份会话上下文（画像、目标岗位、已确认经历、最新草稿），这是多 Agent 协作的基础，也是本作品的核心设计。

## 2. 用户与场景

- 目标用户：高职及应用型本科在校生。
- 使用方式：浏览器打开即用，无需注册；首次填写年级、专业、目标岗位（可跳过），会话由 HttpOnly Cookie 标识并在服务端持久化。
- 演示场景：教室投屏、评委现场操作，断网时自动降级为规则引擎，全流程仍可跑通。

## 3. 功能范围

| 模块 | 功能 |
|---|---|
| 画像 | 年级、专业、目标岗位、已有技能；可随时修改 |
| 成长规划 | 一次一问收集现状 → 岗位能力差距 → 3 阶段任务清单（可勾选） |
| 简历导航 | 一次一问收集信息 → 增量生成草稿 → 缺失项标「待补充」 → 右侧可直接编辑保存 |
| 岗位匹配 | 根据岗位图谱给出匹配度、亮点与待补能力 |
| 模拟面试 | 使用最新草稿出题 → 逐题追问 → 结束评分（完整度/结构/匹配度/表达） |
| 反馈 | 1-5 星 + 文字建议，落库供真实用户验证 |
| 运营 | 带口令的使用统计接口 |

## 4. 架构

```
浏览器（原生 HTML/CSS/JS 单页）
        │  fetch JSON（Cookie 会话）
        ▼
Express（server.js）
  ├─ routes/     session · profile · chat · resume · feedback · meta
  ├─ agents/     growth · resume · interview · orchestrator
  ├─ llm/        openai（兼容协议）· huawei（MaaS / AK/SK 签名）· selector
  ├─ rule/       离线规则引擎（模型不可用时兜底）
  └─ repo/       better-sqlite3 数据访问层
data/job-catalog.json   岗位能力图谱
```

设计原则：

- 单进程、零构建，`npm install && npm start` 即可运行。
- Agent 输出统一为结构化 JSON，前端不依赖模型自由文本解析。
- 模型层与业务层解耦：同一套 Agent 逻辑既能走大模型，也能走规则引擎。

## 5. 数据模型

SQLite 单文件（默认 `data/app.db`），表结构：

| 表 | 字段 |
|---|---|
| sessions | id TEXT PK, created_at |
| profiles | session_id PK, grade, major, target_job, skills TEXT(JSON), updated_at |
| messages | id INTEGER PK AUTOINCREMENT, session_id, agent, role, content, meta TEXT(JSON), created_at |
| resumes | session_id, version, json TEXT, updated_at, PK(session_id, version) |
| plans | session_id PK, json TEXT, updated_at |
| interviews | id TEXT PK, session_id, json TEXT, status, score REAL, created_at, finished_at |
| feedback | id INTEGER PK AUTOINCREMENT, session_id, rating, comment, created_at |

### 简历草稿结构

```json
{
  "basic": { "name": "", "gender": "", "phone": "", "email": "", "city": "", "targetJob": "" },
  "education": { "school": "", "major": "", "degree": "", "startEnd": "", "gpa": "", "courses": [] },
  "skills": [{ "name": "Vue", "level": "熟练" }],
  "projects": [{ "name": "", "role": "", "period": "", "background": "", "actions": [], "results": [], "tech": [] }],
  "internships": [{ "company": "", "role": "", "period": "", "actions": [], "results": [] }],
  "awards": [{ "name": "", "date": "", "level": "" }],
  "selfEvaluation": ""
}
```

缺失字段统一为 `""`，前端渲染为「待补充」。每次修改生成新版本，保留历史。

### 提升计划结构

```json
{
  "targetJob": "前端开发工程师",
  "matchScore": 62,
  "gapSummary": "……",
  "dimensions": [{ "name": "工程化能力", "target": "熟练使用 Vite/Webpack", "current": "未确认", "gap": 3, "advice": "……" }],
  "phases": [{ "title": "第 1 阶段 · 夯实基础（1-4 周）", "tasks": [{ "text": "……", "done": false }] }],
  "highlights": ["……"],
  "resources": [{ "name": "MDN Web Docs", "note": "系统补齐基础" }]
}
```

### 面试结构

```json
{
  "id": "uuid",
  "status": "active",
  "targetJob": "前端开发工程师",
  "rounds": [{ "question": "……", "answer": "……", "feedback": "……", "dimension": "项目经历" }],
  "score": { "overall": 78, "dimensions": [{ "name": "完整度", "score": 80, "comment": "……" }] }
}
```

## 6. 接口契约

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/session | 创建/复用会话，返回 state |
| GET | /api/state | 当前会话全量状态 |
| PUT | /api/profile | 保存画像 |
| POST | /api/chat | `{ agent, message }`，返回 reply / nextQuestion / state |
| PATCH | /api/resume | 保存手工编辑后的草稿（生成新版本） |
| PATCH | /api/plan | 保存计划任务勾选状态 |
| POST | /api/interview/finish | 提前结束面试并评分 |
| POST | /api/interview/restart | 关闭当前面试，准备新一轮 |
| POST | /api/resume/reset | 清空草稿重新开始 |
| POST | /api/feedback | 评分与建议 |
| GET | /api/meta | 岗位列表、模型模式（不含密钥） |
| GET | /api/stats?token= | 使用统计（需 ADMIN_TOKEN） |
| GET | /api/health | 健康检查 |

### Agent 输出协议

```json
{
  "reply": "给学生看的回复",
  "nextQuestion": "本轮唯一追问，结束为空字符串",
  "draftPatch": { "projects": [] },
  "planPatch": { "dimensions": [] },
  "progress": { "stage": "collecting", "done": false },
  "suggestions": ["快捷回复 1", "快捷回复 2"]
}
```

后端对模型输出做容错解析（兼容 ```json 代码块、前后多余文本），解析失败自动降级规则引擎。

## 7. 模型接入与降级

- `LLM_PROVIDER=auto`：存在 `OPENAI_API_KEY` → openai；存在 `HUAWEI_API_KEY` 或 `HUAWEI_AK/HUAWEI_SK` → huawei；否则 rule。
- OpenAI 兼容：`POST {OPENAI_BASE_URL}/chat/completions`。
- 华为云：
  - API Key 模式：走 ModelArts Studio MaaS 的 OpenAI 兼容端点。
  - AK/SK 模式：按华为云 APIG `SDK-HMAC-SHA256` 规范签名，请求 `HUAWEI_ENDPOINT + HUAWEI_PATH`。
- 超时、网络错误、限流、JSON 解析失败：自动回退规则引擎，并在响应 `engine` 字段中标注，前端顶部提示「已切换离线演示模式」，不打断流程。

## 8. 安全与异常

- 模型密钥仅存在于服务端环境变量，接口永不返回。
- 会话按 HttpOnly Cookie 隔离，所有读写均校验 `session_id`。
- 输入限制：单条消息 ≤ 2000 字，请求体 ≤ 256KB。
- 所有 SQL 使用参数化查询。
- 未捕获异常统一返回 JSON 错误，不泄露堆栈。

## 9. 验证方案

- `npm test`：仓储读写、草稿合并、模型输出解析、华为云签名、规则引擎三条主线、接口链路。
- 手工验收：浏览器完整走一遍成长 → 简历 → 面试 → 反馈。

## 10. 部署

- 本地：`npm install && npm start`。
- Docker：`docker build -t career-compass . && docker run -p 3000:3000 --env-file .env career-compass`。
- 华为云 ECS / 沙箱：Node 22 环境直接运行，或用 Dockerfile。