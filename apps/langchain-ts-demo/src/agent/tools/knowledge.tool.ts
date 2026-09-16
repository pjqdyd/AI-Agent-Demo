import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { RagService } from '../rag/rag.service';

/**
 * 知识库检索工具工厂：通过闭包注入 midway 容器中的 RagService，
 * 使 Agent 在需要内部知识时自动触发 RAG 检索（Agentic RAG 模式）
 */
export function createKnowledgeSearchTool(ragService: RagService) {
  return tool(
    async ({ query }) => {
      const documents = await ragService.search(query);
      if (documents.length === 0) {
        return '知识库中未检索到相关内容';
      }
      return documents.map(document => document.pageContent).join('\n---\n');
    },
    {
      name: 'knowledge_search',
      description: '检索内部知识库，获取公司制度、产品介绍等内部信息',
      schema: z.object({
        query: z.string().describe('检索关键词或问题'),
      }),
    }
  );
}
