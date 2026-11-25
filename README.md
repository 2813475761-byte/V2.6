# 职途罗盘 · CareerCompass

面向高职 / 应用型本科学生的**简历成长与求职导航 AI Agent**，由三个协作 Agent 组成：

- **成长教练**：服务大一大二，对照真实岗位能力图谱诊断差距，生成 12 周可执行提升计划。
- **简历顾问**：服务大三，一次一问挖掘经历，生成结构化、可编辑、可版本回溯的简历草稿，缺失项标「待补充」。
- **模拟面试官**：读取最新简历草稿出题，根据上一轮回答继续追问，结束后给出四维评分。

三条主线共享同一份会话上下文（画像、目标岗位、已确认经历、最新草稿），形成「认知岗位 → 补齐能力 → 打磨简历 → 面试验证」的完整闭环。

## 亮点

| 赛题加分项 | 本作品做法 |
|---|---|
| 多 Agent 协作 | 三个独立角色（提示词、状态、落库隔离）+ 共享画像与草稿上下文 |
| 真实可用 | 无账号即可使用，画像一次填写，数据服务端持久化，支持草稿版本回溯 |
| 部署上线 | 单进程、零构建，提供 Dockerfile，可在华为云 ECS / 沙箱直接运行 |
| 真实用户验证 | 内置 1-5 星反馈与建议收集，带口令的使用统计接口 |
| 稳定性 | 未配置密钥或模型异常时自动切换离线规则引擎，断网也能完整演示 |
| 双模型通道 | OpenAI 兼容协议 + 华为云（MaaS API Key / AK-SK 签名）双通道切换 |

## 快速开始

环境要求：Node.js 18.17+（推荐 20 或 22）。

```bash
npm install
cp .env.example .env      # 可选：不配置密钥也能以离线规则引擎运行
npm start
```

打开 http://localhost:3000 ，首次进入填写年级、专业、目标岗位即可开始。

开发模式（文件变更自动重启）：

```bash
npm run dev
```

## 模型配置

通过环境变量选择通道，密钥只存在于服务端，接口永不返回。

### 方式一：OpenAI 兼容协议（推荐先跑通）

DeepSeek、通义、vLLM、ModelArts Studio MaaS 等支持 `/chat/completions` 的服务均可：

```env
LLM_PROVIDER=openai
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=your-key
OPENAI_MODEL=deepseek-chat
```

### 方式二：华为云 MaaS（API Key）

```env
LLM_PROVIDER=huawei
HUAWEI_API_KEY=your-key
HUAWEI_BASE_URL=https://api.modelarts-maas.com/v1
HUAWEI_MODEL=your-model
```

### 方式三：华为云 AK/SK 签名调用

```env
LLM_PROVIDER=huawei
HUAWEI_AK=your-ak
HUAWEI_SK=your-sk
HUAWEI_PROJECT_ID=your-project-id
HUAWEI_ENDPOINT=https://pangu.cn-north-4.myhuaweicloud.com
HUAWEI_PATH=/v1/{project_id}/your-api-path
HUAWEI_MODEL=your-model
```

签名遵循华为云 APIG `SDK-HMAC-SHA256` 规范，`HUAWEI_PATH` 以控制台接口文档为准。

### 方式四：离线规则引擎

```env
LLM_PROVIDER=rule
```

或不配置任何密钥（`auto` 模式会自动选择）。规则引擎提供确定性的三套对话流程，适合课堂演示与断网场景。

## 目录结构

```
server.js                   服务入口（静态托管 + API + 错误处理）
src/config.js               环境变量与模型通道判定
src/middleware/session.js   HttpOnly Cookie 会话
src/routes/index.js         REST API
src/agents/                 三个 Agent + 岗位匹配 + 编排器
src/llm/                    OpenAI 兼容 / 华为云签名 / 降级调度
src/prompts/index.js        三套系统提示词
src/rule/                   离线规则引擎
src/repo/                   SQLite 建表、仓储、草稿合并
data/job-catalog.json       10 个岗位的能力图谱
public/                     原生单页前端（无构建）
tests/                      单元与接口测试
docs/superpowers/           设计与实现计划
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/session` | 创建 / 复用会话 |
| GET | `/api/state` | 当前会话全量状态 |
| PUT | `/api/profile` | 保存画像 |
| POST | `/api/chat` | `{ agent, message }`，返回回复、下一问、最新状态 |
| PATCH | `/api/resume` | 保存手工编辑后的草稿（生成新版本） |
| PATCH | `/api/plan` | 保存计划任务勾选状态 |
| POST | `/api/resume/reset` | 清空草稿 |
| POST | `/api/interview/finish` | 提前结束面试并评分 |
| POST | `/api/interview/restart` | 关闭当前面试，准备新一轮 |
| POST | `/api/feedback` | 提交 1-5 星反馈 |
| GET | `/api/meta` | 岗位图谱、Agent 列表、模型通道 |
| GET | `/api/stats?token=` | 使用统计（需 `ADMIN_TOKEN`） |
| GET | `/api/health` | 健康检查 |

## 测试

```bash
npm test           # 48 项：仓储、草稿合并、签名、解析、规则引擎、接口链路
npm run test:api   # 只跑接口测试
```

接口测试覆盖：会话 → 画像 → 成长 4 轮生成计划 → 简历 7 轮生成草稿 → 编辑保存 → 计划勾选 → 面试 6 轮评分 → 反馈 → 权限校验。

## 部署

### Docker

```bash
docker build -t career-compass .
docker run -d --name career-compass -p 3000:3000 \
  -e LLM_PROVIDER=openai -e OPENAI_API_KEY=your-key \
  -v $(pwd)/data:/app/data career-compass
```

### 华为云 ECS / 沙箱

1. 安装 Node.js 20+；
2. 上传代码，`npm ci --omit=dev`；
3. 通过环境变量注入模型密钥；
4. `node server.js` 启动，安全组放行 3000 端口（或使用 Nginx 反向代理）。

数据库默认落在 `data/app.db`，挂载该目录即可持久化。

## 5 分钟演示脚本

1. 打开首页，填写画像：大二 / 软件技术 / 前端开发工程师 / Vue。
2. 进入「成长规划」，回答 4 个问题，右侧生成 12 周计划，勾选一项任务。
3. 切到「简历导航」，依次发送 7 段信息（每轮一个格式提示），观察右侧草稿实时生成、缺失项高亮。
4. 在右侧直接把「意向城市」改成上海，草稿自动保存并生成新版本。
5. 切到「模拟面试」，回答 6 轮，查看评分与分维度点评。
6. 点击「反馈」提交 5 星，说明真实验证闭环。

## 安全与隐私

- 模型密钥仅存在服务端环境变量，任何接口都不返回。
- 会话使用 HttpOnly + SameSite=Lax Cookie，数据按 `session_id` 隔离。
- 所有 SQL 使用参数化查询；请求体限制 256KB，单条消息限制 2000 字。
- 未捕获异常统一返回 JSON，不向客户端泄露堆栈。
- 未接入账号体系，清除浏览器 Cookie 即开始新会话；生产环境建议叠加登录与 HTTPS。

## 常见问题

**Q：没有模型密钥能演示吗？**
能。系统自动使用离线规则引擎，三条主线全部可跑通，页面顶部会有「离线演示模式」提示。

**Q：模型返回格式不对怎么办？**
后端对输出做代码块与前后文本容错解析，解析失败自动用规则引擎完成本轮，不中断对话。

**Q：面试用的哪份简历？**
始终读取该会话最新版本草稿，右侧手工编辑保存后立即生效。

**Q：如何切换目标岗位？**
右上角「我的画像」修改，或在成长规划中直接告诉教练想了解的方向。