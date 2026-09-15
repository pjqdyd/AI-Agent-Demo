### AI-Agent-Demo AI智能体案例项目

<div align="center" 
     style="
        width: 100%; 
        height: 50px; 
        display: flex; 
        flex-direction:column; 
        justify-content: center; 
        align-items: center;">
            <h1 style="display: inline-block; font-size: 20px; line-height: 20px; font-weight: bold;">
                <b>AI-Agent-Demo</b>
            </h1>
</div>

<p align="middle">
    <a href="https://github.com/pjqdyd/AI-Agent-Demo" target="_blank">
        <img src="https://badgen.net/badge/version/v1.0.0"/>
    </a>
    <img src="https://badgen.net/badge/language/antdx/cyan"/>
    <img src="https://badgen.net/badge/language/langchain/blue"/>
    <img src="https://badgen.net/badge/language/typescript/cyan"/>
    <img src="https://badgen.net/badge/package/pnpm/blue"/>
    <img src="https://badgen.net/badge/license/monorepo/green"/>
    <img src="https://badgen.net/badge/contributors/1/blue"/>
</p>

#### 项目实现:

> 1. Ollama本地部署模型
> 2. WebChat功能实现
> 3. LangChain使用
> 4. MCP功能实现：[MCP-TS-DEMO](https://github.com/pjqdyd/mcp-ts-demo)

#### 技术选型：
 - 环境：Node18+、TypeScript
 - 构建工具：pnpm、monorepo、webpack
 - AI Agent SDK: LangChain.JS
 - 前端框架：Umi、React18、AntDesign
 - WebChat组件: AntDesignX、X-SDK

#### 项目目录:

```
 ├─apps                 apps项目
    ├─web-chat-demo     webchat项目
    └─langchain-ts-demo langchain agent项目     
 ├─packages             子包目录
 ├─package.json         package配置
 ├─tsconfig.json        ts配置文件
 ├─pnpm-workspace.yaml  monorepo配置文件
 ├─README.md            README.md文件
 └─.gitignore           .gitignore文件             
```
#### 如何运行：

 - 本地启动Ollama：例如`ollama run qwen3.5:0.8b`
 - 通过交互式CLI命令行访问
 - 通过配置项目的BASE_URL: `http://localhost:11434/v1/chat/completions`接入访问
 - 进入web-chat-demo项目：运行`pnpm run dev`启动应用，访问页面/chat-sdk

#### 总结
 
 AI Agent 相关技术

