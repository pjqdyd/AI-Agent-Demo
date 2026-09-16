# Project.md — 架构与执行原理详解

本文档详细描述 `@pjqdyd/langchain-ts-demo` 的整体架构，以及一次对话请求从 HTTP 接口进入，经过 **上下文组装 → 提示词 → Tools → 模型（Ollama）** 的完整执行过程与原理。

## 1. 整体架构

```
                       ┌──────────────────────────────────────────────────┐
                       │                midway (egg) 应用                  │
                       │                                                  │
 HTTP 请求 ──────────▶ │  ChatController ──▶ ChatHistoryService ──▶ MySQL │
                       │       │                (上下文持久化/组装)          │
                       │       ▼                                          │
                       │  AgentService (Singleton)                        │
                       │   ├─ createReactAgent  ◀── prompts.ts (系统提示词) │
                       │   ├─ tools: calculator / knowledge_search        │
                       │   │                        │                     │
                       │   │                        ▼                     │
                       │   │              RagService                     │
                       │   │   (分割 → OllamaEmbeddings → MemoryVectorStore)│
                       │   ▼                                              │
                       │  ChatOllama ──── HTTP ────▶ Ollama (qwen3.5:2b)  │
                       └──────────────────────────────────────────────────┘
```

分层职责：

| 层 | 文件 | 职责 |
|---|---|---|
| 接口层 | `controller/*` | 参数校验、SSE 协议封装、会话保证 |
| 编排层 | `agent/agent.service.ts` | Agent 构建、上下文注入、流式输出处理 |
| 知识层 | `agent/rag/*` | 文档分割、向量化、相似度检索（MemoryVectorStore） |
| 工具层 | `agent/tools/*` | 以 zod schema 声明的可调用工具 |
| 持久层 | `service/chatHistory.service.ts` + `entity/*` | 会话/消息存取、langchain 消息转换 |
| 配置层 | `config/*` | 分环境配置（default/local） |

## 2. 一次同步问答的完整执行过程

以 `POST /api/chat {"content": "1 + 2 * 3 等于多少"}` 为例：

```
1. Controller 参数校验，ensureSession()
   ├─ 无 sessionId → 创建会话（标题取首条消息前 32 字）
   └─ 有 sessionId → 校验存在性
2. 用户消息落库 role=user                    （MySQL: chat_message）
3. AgentService.chat()
   ├─ loadHistory()：查最近 20 条消息，按时间正序转为 HumanMessage/AIMessage
   ├─ getAgent()：惰性构建 createReactAgent（首次请求才创建模型连接）
   ├─ agent.invoke({ messages: [...历史, new HumanMessage(content)] })
   │    │
   │    │  ReAct 循环（langgraph 驱动，以下为循环体）：
   │    ├─ ① 模型调用：ChatOllama 发送 [系统提示词, ...历史, 用户消息] 到 Ollama API
   │    ├─ ② 模型决策：返回文本 或 tool_calls
   │    ├─ ③ 若有 tool_calls → 执行工具（calculator / knowledge_search）
   │    │     工具结果作为 ToolMessage 追加进消息序列，回到 ① 继续调用模型
   │    └─ ④ 无 tool_calls → 循环结束，最终 AIMessage 即回答
   └─ stripThinkTags()：剥离 qwen3 思考内容
4. AI 回答落库 role=assistant                （MySQL: chat_message）
5. Controller 返回 { sessionId, answer }
```

要点：**上下文与工具结果的"记忆"都发生在消息序列里**——langgraph 的 ReAct 预置图维护一个 `messages` 数组状态，模型每轮看到的都是累积后的完整消息列表。

## 3. 关键机制与原理

### 3.1 提示词（Prompt）

系统提示词集中在 `src/agent/prompts.ts`，通过 `createReactAgent` 的 `prompt` 参数传入。langgraph 会把它作为第一条消息插入每轮模型调用，因此工具循环中提示词不会丢失：

```ts
// agent/agent.service.ts
this.agent = createReactAgent({
  llm: model,
  tools: [calculatorTool, createKnowledgeSearchTool(this.ragService)],
  prompt: AGENT_SYSTEM_PROMPT,
});
```

```ts
// agent/prompts.ts（节选）
export const AGENT_SYSTEM_PROMPT = `你是 AI-Agent-Demo 的智能助手，请遵守以下规则：
1. 使用中文回答用户问题，语气友好。
2. 遇到数学计算时，必须使用 calculator 工具计算，不要自己心算。
3. 当问题涉及公司制度、产品知识等内部信息时，使用 knowledge_search 工具检索知识库后再回答。`;
```

原理：`prompt` 规则 2/3 本质是给模型的**工具选择先验**——明确什么情况下该用哪个工具，能显著提升小参数模型工具触发的准确率。

### 3.2 上下文（Context）

上下文 = MySQL 中该会话最近 20 条消息。`ChatHistoryService.loadHistory()` 按时间正序查出并转为 langchain 消息对象：

```ts
// service/chatHistory.service.ts（节选）
const messages = await this.messageRepository.find({
  where: { sessionId },
  order: { id: 'DESC' },
  take: MAX_HISTORY_MESSAGES,   // 20 条，防止超出模型上下文窗口
});
return messages
  .reverse()
  .map(message =>
    message.role === 'user'
      ? new HumanMessage(message.content)
      : new AIMessage(message.content)
  );
```

原理：大模型无状态，"多轮对话"是客户端每次把历史重新拼进消息列表实现的。本项目的持久化方案让**跨请求、跨进程重启**的上下文成为可能（对比内存 chat history 的局限），`take: 20` 则是防止上下文超窗的滑动窗口策略。

### 3.3 Tools（工具调用）

工具用 `@langchain/core/tools` 的 `tool()` + zod schema 声明。langgraph 在构建 ReAct 图时会把工具的 `name/description/parameters` 转换成 Ollama 的 `tools` 参数随请求下发，由模型自主决定是否调用：

```ts
// agent/tools/calculator.tool.ts（节选）
export const calculatorTool = tool(
  async ({ expression }) => {
    // 白名单校验 + 安全求值
    if (!/^[\d+\-*/().\s]+$/.test(expression)) {
      return '表达式包含不支持的字符，仅支持数字与 + - * / ( )';
    }
    const result = new Function(`return (${expression})`)();
    return `计算结果：${result}`;
  },
  {
    name: 'calculator',
    description: '计算数学表达式，支持加减乘除与括号，例如 "1 + 2 * 3"',
    schema: z.object({
      expression: z.string().describe('待计算的数学表达式'),
    }),
  }
);
```

需要访问 midway 容器服务的工具（如 RAG 检索），使用**工厂 + 闭包注入**模式，而不是模块级导出：

```ts
// agent/tools/knowledge.tool.ts（节选）
export function createKnowledgeSearchTool(ragService: RagService) {
  return tool(
    async ({ query }) => {
      const documents = await ragService.search(query);
      return documents.map(document => document.pageContent).join('\n---\n');
    },
    {
      name: 'knowledge_search',
      description: '检索内部知识库，获取公司制度、产品介绍等内部信息',
      schema: z.object({ query: z.string().describe('检索关键词或问题') }),
    }
  );
}
```

原理：`description` 是模型判断"要不要用这个工具"的唯一依据，必须写清楚使用场景；工具返回的字符串会作为 `ToolMessage` 进入消息序列，模型基于它生成最终回答。

### 3.4 RAG（检索增强生成）

RAG 链路为经典的 **分割 → 向量化 → 存储 → 检索** 四步，接入方式是 **Agentic RAG**（检索作为工具由模型按需触发，而非每次请求强制检索）：

```ts
// agent/rag/rag.service.ts（节选）
// 分割：递归字符分割，500 字符一片，相邻片重叠 50 字符保证语义连续
const documents = await splitter.createDocuments([content], [{ title }]);
const vectorStore = await this.getVectorStore();
await vectorStore.addDocuments(documents);

// 检索：query 先经 embedding 模型转向量，再与库内向量做余弦相似度排序取 topK
async search(query: string, topK = 3): Promise<Document[]> {
  await this.ensureSeeded();                       // 首次检索自动写入示例知识
  const vectorStore = await this.getVectorStore();
  return vectorStore.similaritySearch(query, topK);
}
```

原理：

- **Embedding**：`OllamaEmbeddings`（`nomic-embed-text`）把文本映射为高维向量，语义相近的文本向量距离更近
- **MemoryVectorStore**：内存向量库，重启即失；`ingest` 接口可随时补充知识，生产可替换为 pgvector/Milvus 等持久化向量库（只需替换 VectorStore 实现，检索调用方不变）
- **chunkOverlap**：切分边界可能截断句子，相邻片段重叠可避免关键信息恰好被切在两片上
- **Agentic RAG**：模型看到"内部信息"类问题时自己发起 `knowledge_search` 调用，比固定管道（每次必检索）更省 token，也允许模型多轮检索

### 3.5 SSE 流式输出

流式接口走 langgraph 的 `streamMode: 'messages'`，以消息为粒度透出模型生成的每个 token 块：

```ts
// agent/agent.service.ts（节选）
const stream = await this.getAgent().stream(
  { messages: [...history, new HumanMessage(content)] },
  { streamMode: 'messages' }
);
for await (const [messageChunk] of stream) {
  if (!(messageChunk instanceof AIMessageChunk)) continue;      // 过滤工具过程
  if (messageChunk.tool_call_chunks?.length) continue;          // 过滤工具调用块
  if (typeof messageChunk.content !== 'string' || messageChunk.content === '') continue;
  const visibleText = thinkStripper.push(messageChunk.content); // 剥离思考内容
  if (visibleText) yield visibleText;
}
```

Controller 层将其封装为 SSE 事件流（协议与 antdx `XRequest` 对齐）：

```ts
// controller/chat.controller.ts（节选）
this.ctx.set('Content-Type', 'text/event-stream; charset=utf-8');
this.ctx.set('X-Accel-Buffering', 'no');   // 禁用代理缓冲，保证实时输出
for await (const chunk of this.agentService.chatStream(sessionId, content)) {
  send({ type: 'chunk', sessionId, content: chunk });
}
send({ type: 'done', sessionId });
```

原理：

- egg/koa 场景下不走 `ctx.body` 而直接 `res.write`，事件格式为 `event: message\ndata: {...}\n\n`
- `data.type` 区分 `chunk/done/error`，前端单一 `onMessage` 通道即可分发（antdx 不解析 SSE 的 event 字段，因此用 data 内字段做协议）
- 问答结束后由 Controller 把**完整答案**落库——流式过程中各 chunk 只送往前端，持久化以最终结果为准

### 3.6 思考内容剥离（qwen3 系列）

qwen3 系列模型会在回答前输出 `<think>...</think>` 思考内容。非流式用正则一次剥离；流式因标签可能被拆在多个 chunk 里，使用跨 chunk 状态机：

```ts
// agent/agent.service.ts（节选）
// 非流式：一次性剥离
const thinkPattern = new RegExp(`<think>[\\s\\S]*?</think>`, 'g');
return text.replace(thinkPattern, '').trim();

// 流式：状态机持有缓冲区，仅输出确认安全（不可能包含半截标签）的部分
const visibleText = thinkStripper.push(messageChunk.content);
```

状态机核心逻辑：输出方向上保留尾部可能与 `<think>` 成前缀的字符（如已收到 `<th`），确保不把半个标签泄漏给前端；思考模式下丢弃内容直至出现完整 `</think>`。

## 4. 数据模型

```
chat_session（会话）              chat_message（消息）
┌──────────────────────┐         ┌──────────────────────────┐
│ id          int PK   │ 1 ────▶ │ id          int PK       │
│ title      varchar   │         │ sessionId   int  (索引)  │
│ createdAt  datetime  │         │ role     varchar(16)     │  user / assistant
└──────────────────────┘         │ content  text            │
                                 │ createdAt  datetime      │
                                 └──────────────────────────┘
```

typeorm `synchronize: true` 自动建表（生产应换 migration）；消息表对 `sessionId` 建索引，保证上下文查询效率。

## 5. 配置分层与启动流程

midway 按 `NODE_ENV` 加载 `src/config/config.{env}.ts` 并与 `config.default.ts` 深合并：

- `config.default.ts`：端口（`egg.port: 6001`）、Ollama 模型名、typeorm 实体注册
- `config.local.ts`：仅 local 环境加载，存放 MySQL 连接信息（敏感配置隔离）

启动链路（`bootstrap.js` → `Bootstrap.configure` → `Bootstrap.run`）：

```js
// bootstrap.js（节选）
Bootstrap.configure({
  appDir: __dirname,
  baseDir: join(__dirname, 'dist'),          // 容器只扫描编译产物，避免误加载 src 源码
  configurationModule: require('./dist/configuration'),
});
Bootstrap.run();
```

`src/configuration.ts` 中注册 `web`（egg 场景）与 `typeorm` 两个组件，并在 `onServerReady` 钩子打印服务地址与接口清单。

## 6. 技术决策备忘

| 决策 | 原因 |
|---|---|
| `@midwayjs/web` 而非 `@midwayjs/egg` | 后者是 midway 1.x 旧包，midway 3 的 egg 场景实际包名为 `@midwayjs/web` |
| langchain 精确锁版本（core 0.3.44 等） | 0.3 末期版本移除 MemoryVectorStore、zod 3.25 触发 tool() 类型实例化爆炸（TS2589） |
| MemoryVectorStore 从 `langchain` 主包引入 | 该组件已从 `@langchain/community` 移除 |
| Agent 惰性构建（首次请求创建） | 应用启动不依赖 Ollama 在线，避免启动顺序耦合 |
| Singleton 的 RagService/AgentService | 向量库与 Agent 状态（vectorStore、agent 实例）需要跨请求复用 |
| SSE data 内嵌 `type` 字段 | antdx `XRequest` 不解析 SSE event 字段，data 内字段才能可靠分发 |
