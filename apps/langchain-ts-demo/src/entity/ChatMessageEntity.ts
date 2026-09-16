import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * 消息实体：按会话持久化的对话消息，是 Agent 多轮上下文的数据源
 */
@Entity('chat_message')
@Index('idx_chat_message_session_id', ['sessionId'])
export class ChatMessageEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', comment: '所属会话 ID' })
  sessionId: number;

  @Column({ length: 16, comment: '消息角色：user / assistant' })
  role: string;

  @Column({ type: 'text', comment: '消息内容' })
  content: string;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;
}
