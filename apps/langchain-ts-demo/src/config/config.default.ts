import { MidwayConfig } from '@midwayjs/core';
import { ChatSessionEntity } from '../entity/ChatSessionEntity';
import { ChatMessageEntity } from '../entity/ChatMessageEntity';

/**
 * 通用配置：端口、Ollama 模型、typeorm 结构性配置
 * MySQL 连接信息在 config.local.ts 中维护（本地环境隔离）
 */
export default {
  // 会话安全密钥（egg cookie 签名用）
  keys: 'ai-agent-demo-session-keys',

  // HTTP 服务端口：egg 场景从 egg.port 读取监听端口
  // web-chat-demo 将来通过 umi proxy 转发到此端口
  egg: {
    port: 6001,
  },

  // Ollama 本地模型配置（通过 API 调用本地 Ollama 服务）
  // 首次使用需执行：ollama pull qwen3.5:2b 与 ollama pull nomic-embed-text
  ollama: {
    baseUrl: 'http://127.0.0.1:11434',
    chatModel: 'qwen3.5:2b',
    embeddingModel: 'nomic-embed-text',
  },

  // 关闭 egg-security 默认的 CSRF 校验：
  // 本项目是纯 JSON API 服务，POST 接口供 web-chat-demo（antdx）直接调用，不使用表单
  security: {
    csrf: {
      enable: false,
    },
  },

  typeorm: {
    dataSource: {
      default: {
        // 数据库类型：连接信息（host/port/账号密码）在 config.local.ts 中维护
        type: 'mysql',
        // 实体直接以类引用注册（比 glob 路径更可靠，避免 Windows 路径分隔符问题）
        entities: [ChatSessionEntity, ChatMessageEntity],
        // demo 阶段自动同步建表，生产环境应使用 migration 管理表结构
        synchronize: true,
      },
    },
  },
} as MidwayConfig;
