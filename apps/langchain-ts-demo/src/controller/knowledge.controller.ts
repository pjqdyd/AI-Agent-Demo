import { Controller, Post, Inject, Body, httpError } from '@midwayjs/core';
import { RagService } from '../agent/rag/rag.service';

/**
 * 知识库接口层：RAG 文档入库
 */
@Controller('/api/knowledge')
export class KnowledgeController {
  @Inject()
  ragService: RagService;

  /**
   * 文档入库：分割、向量化后存入内存向量库，返回切片数量
   */
  @Post()
  async ingest(@Body() body: { title: string; content: string }) {
    const { title, content } = body;
    if (!title?.trim() || !content?.trim()) {
      throw new httpError.BadRequestError('title 与 content 不能为空');
    }
    const chunkCount = await this.ragService.ingest(title, content);
    return { chunkCount };
  }
}
