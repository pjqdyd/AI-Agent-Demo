# @pjqdyd/langchain-ts-demo

LangChain.js Agent 最佳实践示例服务。基于 midway(egg) + typeorm 构建的多轮对话 Agent，通过 Ollama API 调用本地大模型，支持系统提示词、会话上下文、工具调用（Tools）与 RAG 知识库检索；SSE 流式接口的协议设计可直接对接 `apps/web-chat-demo` 中的 antdx（@ant-design/x）前端。

## 技术栈

| 层 | 技术 |
|---|---|
| Web 框架 | midway 3 + `@midwayjs/web`（egg 场景） |
| ORM | `typeorm` + `mysql2`（synchronize 自动建表） |
| Agent 编排 | `@langchain/langgraph` 的 `createReactAgent`（ReAct 模式） |
| 模型接入 | `@langchain/ollama` 的 `ChatOllama` / `OllamaEmbeddings`（本地 Ollama HTTP API） |
| RAG | `langchain` 的 `MemoryVectorStore` + `@langchain/textsplitters` |
| 参数校验 | `zod`（工具入参 schema） |
| 工程化 | pnpm workspace + turborepo + TypeScript |

## 项目架构

```
apps/langchain-ts-demo/
├── bootstrap.js                # 启动入口（dev 与生产共用，加载 dist 产物）
├── src/
│   ├── configuration.ts        # midway 入口：注册 web(egg)/typeorm 组件 + 启动横幅
│   ├── interface.ts            # 类型定义（OllamaConfig、SSE 事件结构）
│   ├── config/
│   │   ├── config.default.ts   # 通用配置：端口、Ollama 模型、typeorm 实体
│   │   └── config.local.ts     # 本地环境：MySQL 连接信息（敏感信息不入库）
│   ├── entity/                 # typeorm 实体：会话表 / 消息表
│   ├── agent/
│   │   ├── agent.service.ts    # Agent 编排 + 同步/流式问答 + 思考内容剥离
│   │   ├── prompts.ts          # 系统提示词集中管理
│   │   ├── tools/              # calculator（计算器）、knowledge_search（RAG 检索）
│   │   └── rag/                # RAG 服务：分割 / 向量化 / 检索 + 示例知识文档
│   ├── service/
│   │   └── chatHistory.service.ts  # 会话与消息持久化、上下文组装
│   └── controller/
│       ├── chat.controller.ts      # 问答、SSE 流式、会话管理接口
│       └── knowledge.controller.ts # 知识库文档入库接口
└── doc/
    └── Project.md              # 架构与执行原理详解
```

## 环境要求

- Node.js >= 18、pnpm >= 12（monorepo 根目录已声明）
- MySQL >= 5.7（本地运行）
- Ollama（本地安装并已启动，默认 `http://127.0.0.1:11434`）

首次使用需拉取模型：

```bash
ollama pull qwen3.5:2b          # 对话模型
ollama pull nomic-embed-text    # RAG 向量化模型
```

创建数据库：

```sql
CREATE DATABASE ai_agent_demo DEFAULT CHARACTER SET utf8mb4;
```

修改本地配置 `src/config/config.local.ts` 中的 MySQL 连接信息（host/port/用户名/密码）。该文件只保留在本地，真实密码不要提交到仓库。

## 开发运行

在仓库根目录执行（turborepo 编排）：

```bash
pnpm install                # 安装依赖
pnpm --filter @pjqdyd/langchain-ts-demo dev
```

启动成功后控制台会打印服务地址与接口清单，服务监听 `http://127.0.0.1:6001`。`dev` 模式由 mwtsc 监听 `src` 变化：自动增量编译到 `dist` 并重启应用。

快速验证：

```bash
curl -X POST http://127.0.0.1:6001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"content": "你好，请简单介绍一下你自己"}'
```

## 打包发布运行

```bash
# 编译：TypeScript 产物输出到 dist/（根目录 turbo build 可编排整个 monorepo）
pnpm --filter @pjqdyd/langchain-ts-demo build

# 生产运行：NODE_ENV=production，加载 dist 编译产物
pnpm --filter @pjqdyd/langchain-ts-demo start
```

生产环境说明：

- `start` 脚本执行 `node bootstrap.js`，其中 `baseDir` 指向 `dist`，容器只扫描编译产物
- 生产读取 `config.default.ts`，不会加载 `config.local.ts`；MySQL 等环境相关配置应通过环境变量或独立的部署配置注入
- demo 阶段 typeorm 开启了 `synchronize: true` 自动建表，生产环境应改为 migration 管理表结构
- 部署机需能访问 MySQL 与 Ollama 服务（或通过环境变量/配置指向远端地址）

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/chat` | 同步问答：`{sessionId?, content}`，返回 `{sessionId, answer}` |
| POST | `/api/chat/stream` | SSE 流式问答，事件协议见下 |
| GET | `/api/sessions` | 会话列表（最近 50 条） |
| GET | `/api/sessions/:sessionId/messages` | 指定会话的历史消息 |
| POST | `/api/knowledge` | 知识库文档入库：`{title, content}`，返回切片数量 |

SSE 事件协议（与 antdx `XRequest` 消费方式对齐，`event` 统一为 `message`，用 `data.type` 区分）：

```
event: message
data: {"type":"chunk","sessionId":1,"content":"部分回答"}   # 增量内容，可多次

event: message
data: {"type":"done","sessionId":1}                        # 结束标记
```

## 与 web-chat-demo（antdx）对接

前端使用 `@ant-design/x` 的 `XRequest` 将 `baseUrl` 指向本服务（或经 umi proxy 转发 `/api`），`onMessage` 中按 `data.type` 分发：`chunk` 追加增量内容、`done` 结束、`error` 提示错误。首轮请求不传 `sessionId`，从响应中获得 `sessionId` 后带入后续请求即可维持多轮上下文。
