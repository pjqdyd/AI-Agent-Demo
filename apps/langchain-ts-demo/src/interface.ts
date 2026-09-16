/**
 * Ollama 本地模型配置：通过 HTTP API 访问本地 Ollama 服务
 * 对应 src/config/config.default.ts 中的 ollama 配置段
 */
export interface OllamaConfig {
  /** Ollama 服务地址 */
  baseUrl: string;
  /** 对话模型（Agent 主模型） */
  chatModel: string;
  /** RAG 向量化模型 */
  embeddingModel: string;
}

/**
 * SSE 流式事件的数据结构
 * 协议与 web-chat-demo 中 antdx XRequest 的消费方式对齐：
 * 统一走 event: message + JSON data，用 type 字段区分消息类型
 */
export interface ChatStreamData {
  /** 消息类型：chunk 为增量内容，done 为结束标记，error 为错误 */
  type: 'chunk' | 'done' | 'error';
  /** 所属会话 ID */
  sessionId: number;
  /** 增量文本内容（type=chunk 时有值） */
  content?: string;
  /** 错误信息（type=error 时有值） */
  message?: string;
}
