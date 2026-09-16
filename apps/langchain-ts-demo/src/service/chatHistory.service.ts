import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatSessionEntity } from '../entity/ChatSessionEntity';
import { ChatMessageEntity } from '../entity/ChatMessageEntity';

/** 每次请求加载的历史消息条数上限：防止超出模型上下文窗口 */
const MAX_HISTORY_MESSAGES = 20;

/**
 * 会话与消息服务：Agent 多轮上下文的持久化层
 * Singleton 作用域：无请求态依赖，且需被 Singleton 的 AgentService 注入
 */
@Provide()
@Scope(ScopeEnum.Singleton)
export class ChatHistoryService {
  @InjectEntityModel(ChatSessionEntity)
  sessionRepository: Repository<ChatSessionEntity>;

  @InjectEntityModel(ChatMessageEntity)
  messageRepository: Repository<ChatMessageEntity>;

  /**
   * 创建会话：标题取首条用户消息摘要
   */
  async createSession(title: string): Promise<ChatSessionEntity> {
    const session = this.sessionRepository.create({
      title: title.slice(0, 32),
    });
    return this.sessionRepository.save(session);
  }

  /**
   * 查询会话是否存在
   */
  async getSessionById(sessionId: number): Promise<ChatSessionEntity | null> {
    return this.sessionRepository.findOne({ where: { id: sessionId } });
  }

  /**
   * 保存一条消息（user / assistant）
   */
  async saveMessage(
    sessionId: number,
    role: 'user' | 'assistant',
    content: string
  ): Promise<ChatMessageEntity> {
    const message = this.messageRepository.create({
      sessionId,
      role,
      content,
    });
    return this.messageRepository.save(message);
  }

  /**
   * 加载会话最近的历史消息并转换为 langchain 消息（上下文组装）
   */
  async loadHistory(sessionId: number): Promise<BaseMessage[]> {
    const messages = await this.messageRepository.find({
      where: { sessionId },
      order: { id: 'DESC' },
      take: MAX_HISTORY_MESSAGES,
    });
    return messages
      .reverse()
      .map(message =>
        message.role === 'user'
          ? new HumanMessage(message.content)
          : new AIMessage(message.content)
      );
  }

  /**
   * 会话列表（最近创建的在前）
   */
  async listSessions(): Promise<ChatSessionEntity[]> {
    return this.sessionRepository.find({
      order: { id: 'DESC' },
      take: 50,
    });
  }

  /**
   * 指定会话的全部消息（按时间正序）
   */
  async listMessages(sessionId: number): Promise<ChatMessageEntity[]> {
    return this.messageRepository.find({
      where: { sessionId },
      order: { id: 'ASC' },
    });
  }
}
