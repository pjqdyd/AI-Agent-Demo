import { MidwayConfig } from '@midwayjs/core';

/**
 * 本地开发环境配置：MySQL 连接信息（占位配置，未连接真实数据库）
 * 使用前请修改为实际连接信息，并先创建数据库：
 *   CREATE DATABASE ai_agent_demo DEFAULT CHARACTER SET utf8mb4;
 * 真实密码等敏感信息只应存在于本文件（建议加入 .gitignore，不提交到仓库）
 */
export default {
  typeorm: {
    dataSource: {
      default: {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: 'root',
        password: '123456',
        database: 'ai_agent_demo',
      },
    },
  },
} as MidwayConfig;
