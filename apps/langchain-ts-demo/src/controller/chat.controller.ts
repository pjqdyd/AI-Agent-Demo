import {
  Controller,
  Post,
  Get,
  Inject,
  Body,
  Param,
  httpError,
} from '@midwayjs/core';
import { Context } from '@midwayjs/web';
import { AgentService } from '../agent/agent.service';
import { ChatHistoryService } from '../service/chatHistory.service';
import type { ChatStreamData } from '../interface';

/**
 * 对话接口层：同步问答、SSE 流式问答与会话管理
 * SSE 协议与 web-chat-demo 中 antdx XRequest 的消费方式对齐：
 * event 统一为 message，data 内用 type 字段区分 chunk / done / error
 */
@Controller('/api')
export class ChatController {
  @Inject()
  ctx: Context;

  @Inject()
  agentService: AgentService;

  @Inject()
  chatHistoryService: ChatHistoryService;

  /**
   * 同步问答：等待完整回答后返回
   */
  @Post('/chat')
  async chat(@Body() body: { sessionId?: number; content: string }) {
    const { content } = body;
    if (!content?.trim()) {
      throw new httpError.BadRequestError('content 不能为空');
    }
    const sessionId = await this.ensureSession(body.sessionId, content);
    await this.chatHistoryService.saveMessage(sessionId, 'user', content);

    const answer = await this.agentService.chat(sessionId, content);

    await this.chatHistoryService.saveMessage(sessionId, 'assistant', answer);
    return { sessionId, answer };
  }

  /**
   * 流式问答：SSE 逐 chunk 输出，结束时落库并推送 done 事件
   */
  @Post('/chat/stream')
  async chatStream(@Body() body: { sessionId?: number; content: string }) {
    const { content } = body;
    if (!content?.trim()) {
      throw new httpError.BadRequestError('content 不能为空');
    }
    const sessionId = await this.ensureSession(body.sessionId, content);
    await this.chatHistoryService.saveMessage(sessionId, 'user', content);

    // SSE 响应头：禁用缓存与代理缓冲，保证 token 级实时输出
    this.ctx.set('Content-Type', 'text/event-stream; charset=utf-8');
    this.ctx.set('Cache-Control', 'no-cache');
    this.ctx.set('Connection', 'keep-alive');
    this.ctx.set('X-Accel-Buffering', 'no');
    this.ctx.res.flushHeaders?.();

    const send = (data: ChatStreamData) => {
      this.ctx.res.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let fullAnswer = '';
    try {
      for await (const chunk of this.agentService.chatStream(
        sessionId,
        content
      )) {
        fullAnswer += chunk;
        send({ type: 'chunk', sessionId, content: chunk });
      }
      if (fullAnswer) {
        await this.chatHistoryService.saveMessage(
          sessionId,
          'assistant',
          fullAnswer
        );
      }
      send({ type: 'done', sessionId });
    } catch (error) {
      // 出错时也保证完整的 SSE 事件序列，便于前端统一收口
      send({ type: 'error', sessionId, message: String(error) });
    } finally {
      this.ctx.res.end();
    }
  }

  /**
   * 会话列表
   */
  @Get('/sessions')
  async listSessions() {
    return this.chatHistoryService.listSessions();
  }

  /**
   * 指定会话的历史消息
   */
  @Get('/sessions/:sessionId/messages')
  async listMessages(@Param() params: { sessionId: string }) {
    const sessionId = Number(params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new httpError.BadRequestError('sessionId 无效');
    }
    return this.chatHistoryService.listMessages(sessionId);
  }

  /**
   * 确保会话存在：无 sessionId 时创建新会话（标题取首条消息摘要），无效时抛错
   */
  private async ensureSession(
    sessionId: number | undefined,
    firstContent: string
  ): Promise<number> {
    if (sessionId === undefined) {
      const session = await this.chatHistoryService.createSession(firstContent);
      return session.id;
    }
    const session = await this.chatHistoryService.getSessionById(sessionId);
    if (!session) {
      throw new httpError.BadRequestError('会话不存在');
    }
    return sessionId;
  }
}
