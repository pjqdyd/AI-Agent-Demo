import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * 会话实体：一次独立的多轮对话上下文
 */
@Entity('chat_session')
export class ChatSessionEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ length: 128, comment: '会话标题（取首条用户消息摘要）' })
  title: string;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;
}
