import { Configuration, App, Config } from '@midwayjs/core';
import * as web from '@midwayjs/web';
import * as typeorm from '@midwayjs/typeorm';
import { join } from 'path';
import { OllamaConfig } from './interface';

/**
 * midway 应用入口：注册 web（egg 场景，提供 HTTP 服务能力）
 * 与 typeorm（ORM，提供会话/消息持久化能力）组件
 */
@Configuration({
  imports: [
    web,
    typeorm,
  ],
  importConfigs: [join(__dirname, './config')],
})
export class MainConfiguration {
  @App()
  app: web.Application;

  @Config('egg')
  eggConfig: { port?: number };

  @Config('ollama')
  ollamaConfig: OllamaConfig;

  async onReady() {
    // 应用就绪钩子：预留扩展点（如预热连接、健康检查上报等）
  }

  /**
   * HTTP 服务监听完成后打印启动信息（地址、端口、模型、接口清单）
   */
  async onServerReady() {
    const port = process.env.MIDWAY_HTTP_PORT || this.eggConfig?.port;
    console.log('');
    console.log('==================================== langchain-ts-demo Agent 服务已启动');
    console.log(`  - 服务地址: http://127.0.0.1:${port}`);
    console.log(`  - 对话模型: ${this.ollamaConfig.chatModel}（Ollama: ${this.ollamaConfig.baseUrl}）`);
    console.log(`  - 向量模型: ${this.ollamaConfig.embeddingModel}`);
    console.log('  - 接口清单:');
    console.log('      POST /api/chat                          同步问答');
    console.log('      POST /api/chat/stream                   流式问答（SSE）');
    console.log('      GET  /api/sessions                      会话列表');
    console.log('      GET  /api/sessions/:sessionId/messages  会话历史消息');
    console.log('      POST /api/knowledge                     知识库文档入库');
    console.log('=======================================================================================');
  }
}
