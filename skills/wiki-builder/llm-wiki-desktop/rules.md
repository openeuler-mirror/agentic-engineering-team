---
name: llm-wiki-desktop
description: >-
  Option 4: Use the nashsu/llm_wiki desktop application to build a long-term maintained personal Wiki from a local document folder.
  Suitable for multi-format materials including PDF, DOCX, PPTX, Excel, Markdown, images, web clippings, and more.
  With this solution, the desktop application handles import, ingestion, search, knowledge graph, and Q&A, while the Agent is primarily responsible for installation guidance, project creation guidance, and usage guidance.
---

# Option 4: Desktop Application-Based LLM Wiki

> Use the `nashsu/llm_wiki` desktop application to turn a local document folder into a long-term maintained personal Wiki.

Open-source project: <https://github.com/nashsu/llm_wiki>

This option differs from a pure skill‑based approach. Instead of generating all Wiki files directly in the current workspace, the Agent guides the user to install and use the LLM Wiki desktop application to build the knowledge base.

## Applicable Scenarios

This option is preferred when the user provides a **local document folder**, intends to create a long‑term maintained knowledge base, and prefers a desktop application approach.

Typical input: 

```text
帮我把 /Users/me/Documents/papers 做成 Wiki
把 D:\资料\行业研究 建成知识库
这个文件夹里都是 PDF 和笔记，帮我整理成可检索 Wiki
```

Suitable document types include:

- PDF
- DOCX
- PPTX
- Excel
- Markdown
- TXT
- Images
- Web clippings
- Audio and video materials

Suitable user goals include: 

- Long-term maintenance of a personal knowledge base.
- Importing entire folders.
- Organizing multi-format materials.
- Browsing the Wiki via a desktop application.
- Using the knowledge graph to understand relationships among materials.
- Performing search and Q&A based on the materials.
- Incrementally updating the knowledge base as new materials are added later.

## Non‑Applicable Scenarios

Do not prioritize this option in the following cases: 

- The user only wants a one‑time summary of a small amount of text.
- The user explicitly states they do not want to install a desktop application.
- The user expects the Agent to generate Markdown Wiki files directly in the current directory.

## Core Workflow

The workflow for Option 4 is:

```text
Local document folder
→ Install / open the LLM Wiki desktop application
→ Create a project
→ Configure the model
→ Use Folder Import to import the folder
→ Automatic ingestion
→ Use Wiki / Search / Graph / Chat
```

## Security Rules

1. Do not download, install, or launch the desktop application without user confirmation.
2. Do not ask the user to send an API Key in the conversation.
3. The API Key should be filled in by the user themselves on the Settings page of the LLM Wiki desktop application.
4. The API Key should be filled in by the user themselves on the Settings page of the LLM Wiki desktop application.
5. If the current environment does not support GUI applications, provide the user with manual installation steps.
6. Do not fake release download URLs; always use the GitHub Releases page for downloading.

## Starting from Scratch

### 1. Install the Desktop Application

If the user's objectives align with this solution, guide them to select and download the appropriate installer, and clearly indicate the installation source.

```text
我将引导您从 GitHub Releases 下载 LLM Wiki：
https://github.com/nashsu/llm_wiki/releases

请根据您的系统选择安装包：
- macOS：.dmg
- Windows：.msi
- Linux：.deb 或 .AppImage

安装完成后，您需要在桌面应用 Settings 中自行配置 LLM Provider、API Key 和模型。
请不要在对话中发送 API Key。
```

If the current environment supports downloading and opening the installer, you must first ask the user:

```text
是否允许我继续下载并打开安装程序？
A. 是，继续
B. 否，我手动安装
```

- If the user chooses to have you help download and open the installer, then: 
  - Automatically download the latest installer that matches the user's system for them.
  - Always try the official GitHub Releases download first. If it fails due to network issues, you may use `gh-proxy.com` as a mirror, but **must** display a security warning to the user and obtain explicit confirmation before downloading from it.
  - After the installer download is complete, directly execute the installation process.

  If you encounter unresolvable issues such as download failure, download timeout, or insufficient permissions, interrupt the automatic installation process and prompt the user with the following message:

  ```text
  由于xxx问题（问题根据实际情况填写），自动安装流程已中止。建议您手动完成以下步骤：

  1. 打开 https://github.com/nashsu/llm_wiki/releases。
  2. 下载与您系统匹配的安装包。
  3. 安装并启动 LLM Wiki。
  4. 安装完成后告诉我“已安装”，我会继续引导您创建项目和导入文件夹。
  ```

- If the user opts for manual installation, output the following:

  ```text
  请手动完成以下步骤：

  1. 打开 https://github.com/nashsu/llm_wiki/releases。
  2. 下载与您系统匹配的安装包。
  3. 安装并启动 LLM Wiki。
  4. 安装完成后告诉我“已安装”，我会继续引导您创建项目和导入文件夹。
  ```

### 2. Complete Guidance After Installation

Once the user confirms that they have installed and opened LLM Wiki, or if the Agent has helped them open the application, do not ask step‑by‑step whether each step has been completed. 

Instead, provide a complete set of operation instructions at once, covering the following:

此时应一次性给出完整操作指引，内容包括：

1. Creating a project.
2. Recommended template.
3. Settings configuration.
4. Suggested content for `purpose.md` .
5. Folder Import to import the folder.
6. Observing the ingestion progress.
7. How to use the system after import is complete.
8. Subsequent incremental update methods.
9. Common troubleshooting.

When outputting, automatically generate the following based on the local folder path provided by the user:

- Project name.
- Recommended template.
- Draft of `purpose.md` .
- Folder Import path.
- Suggested questions for first‑time use.

Do not ask the user to send the API Key in the conversation. The API Key must be filled in by the user themselves on the Settings page of the LLM Wiki desktop application.

The recommended output format is as follows:

```text
下面是安装完成后的完整操作指引。您可以按顺序在 LLM Wiki 桌面应用里完成。

一、创建项目

在启动 LLM Wiki 桌面应用后，请先按需创建您的知识库项目。

项目名称：<项目名>
推荐模板：<模板名>

模板选择建议：
- 论文、研究报告、技术资料：Research
- 书籍、文章、读书笔记：Reading
- 商业资料、行业分析、竞品资料：Business
- 个人成长、课程、学习笔记：Personal Growth
- 混合资料或不确定类型：General

二、初始配置

创建完项目后，请打开 LLM Wiki 的 Settings 页面进行初始配置。以下是具体配置项及说明：

必选配置：LLM Models（配置 LLM Models 是让 LLM Wiki 正常工作的核心前提，因为它是整个应用的“大脑”。如果不配置，应用将无法进行任何智能分析、生成或回答）

LLM Models中具体需要设置的参数有：
1. LLM Provider（选择您要使用的 AI 模型服务商，例如 OpenAI、Anthropic 或 Ollama。这决定了应用与哪个后端服务通信）
2. API Mode（API 的兼容模式，决定了软件该用哪种“语言”和您的模型供应商对话）
3. Endpoint / Base URL（模型服务的 API 地址。默认为官方地址，当您使用代理或第三方兼容接口（如 One API）时，需要修改此地址）
4. API Key（用于验证您访问模型服务身份的凭证。这通常需要从您的模型供应商账户中获取。）
5. Model（指定您要使用的具体模型，例如 gpt-4o 或 claude-3-opus。不同模型的能力和成本各不相同。）
6. Context Window（设置模型在一次对话或任务中能“记住”的最大文本长度。这决定了它能一次性处理的信息量，对处理长文档和复杂任务至关重要。）

可选配置：
1. Embeddings：决定是否启用基于向量（语义）的搜索功能。开启后，系统会在导入新内容时自动为其生成向量，搜索时会结合关键词和向量进行“混合检索”，从而更准确地理解您的问题意图，而不仅仅是匹配关键词。
2. Deep Research：决定是否启用主动的“深度研究”能力。开启并配置好搜索服务后，当系统发现知识库存在空白时，您可以一键触发深度研究。它会自动规划搜索方案、联网获取信息，并将结果写回知识库，相当于拥有一个能自动帮您做研究的助手。
3. Output Preferences：主要用来定制 AI 的“表达方式”。您可以在这里设置 AI 回答使用的语言，以及控制对话的“记忆”长度。调整“对话历史长度”可以让 AI 更好地结合上下文进行回答。

请不要把 API Key 发给我，直接在桌面应用 Settings 页面填写即可。

三、填写 purpose.md

创建项目后，请在项目的 purpose.md 中填写下面内容。您也可以后续在应用界面中继续修改它。purpose.md文件所在位置：点击应用左侧菜单栏的Wiki图标（文件logo）->点击Files->purpose.md。

<purpose.md 内容>

四、导入文件夹

点击应用左侧菜单栏的Sources图标（文件夹logo），再点击Import（或Folder）进行对知识库源文件（或整个源文件夹）的导入。

具体的导入进度可查看左下方的Activity Panel状态。导入的步骤主要分为两步：

1. 源文件分析。
2. Wiki页面生成。

注意：如果文件数量很多，首次 ingest 可能需要较长时间。建议先导入一个子文件夹试跑，确认模型、格式解析和生成效果正常后，再导入完整目录。

五、导入完成后如何使用

导入完成后，您可以使用这些功能：

- Chat：基于当前 Wiki 进行问答。
- Wiki：在 Knowledge 下浏览生成的知识页面结构，包括项目概述、实体、概念、源文件等；在 Files 下浏览导入的源文件、生成的Wiki文件以及purpose.md和schema.md等。
- Sources：查看/导入/刷新源文件。
- Search：搜索关键词、文件、概念、人物或组织。
- Graph：查看知识图谱和主题关联。
- Lint：知识库健康检查与质量维护。
- Review：处理需要人工判断的内容。
- Deep Research：针对知识缺口补充外部资料。
- Skills：扫描并启用本地的 SKILL.md 文件夹，让 AI 助手（Agent）能按需读取技能指令。

建议您先在 Chat 中问：

1. 这个知识库目前有哪些核心主题？
2. 请总结已导入资料的主要内容。
3. 哪些概念、人物、组织、方法或事件最重要？
4. 哪些资料之间关联最强？
5. 当前知识库有哪些明显缺口？
6. 哪些内容值得沉淀为长期 Wiki 页面？

六、后续增量更新

如果您之后新增了文件：

- 如果新文件放在原来的 source 文件夹下，可以等待应用自动检测，或手动触发 rescan / re-ingest（Import/Folder左侧的刷新图标）。
- 如果新文件在新的文件夹中，请再次使用 Folder 导入。
- 导入后等待 Activity Panel 中的 ingest 队列完成。
- 完成后检查 Wiki / Search / Graph / Review / Chat 是否已经更新。

七、新建项目和项目切换

如果您想新建项目，或者切换本地已经创建的其他项目，请点击桌面应用左下侧的Switch Project功能（切换logo）。在该功能下，可以选择新建项目，或切换至本地的其他项目。

八、常见问题排查

如果 ingest 失败，请优先检查：

- API Key 是否正确。
- 模型名称是否正确。
- Endpoint / Base URL 是否正确。
- 网络是否正常。
- 本地模型服务是否已经启动。
- 文件是否过大。
- 文件格式是否异常。
- 是否需要分批导入。
- 是否需要换用更长上下文模型。

如果您不想使用在线模型，可以使用 Ollama 或其他本地 OpenAI-compatible 服务。请先启动本地模型服务，然后在 LLM Wiki Settings 中配置 base URL 和模型名。
```

## Project Name Generation Rules

Generate the project name based on the folder path provided by the user.

For example:

```text
/Users/alice/Documents/AI-papers
```

The suggested project name is:

```text
AI-papers
```

If the end of the path is a generic name, for example:

```text
/Users/alice/Documents/data
/Users/alice/Desktop/docs
D:\资料\文档
```

then generate a more meaningful project name based on the parent directory or the user's description.

For example:

```text
D:\资料\行业研究
```

The suggested project name is:

```text
行业研究
```

## Template Recommendation Rules

Recommend a template based on the type of materials.

| Material Type | Recommended Template |
|---|---|
| Academic, research‑oriented deep studies | Research |
| Books, articles, reading notes | Reading |
| Business materials, industry analysis, competitive intelligence | Business |
| Personal growth, courses, study notes | Personal Growth |
| Mixed materials or uncertain type | General |

If the material type cannot be determined, the default recommendation is:

```text
General
```

## `purpose.md` Generation Rules

In the complete guidance after installation, you must help the user generate a brief `purpose.md` suggestion.

The following should be explained:

- `purpose.md` is used to define the goal, scope, key questions, and evolving arguments of this Wiki.
- LLM Wiki reads it as context during ingestion and querying.
- Users can edit `purpose.md` directly in the application interface.
- `purpose.md` can be continuously updated as understanding of the project deepens.

Default template: 

```markdown
# Purpose — <Project Name>

## Goal

This Wiki is intended to organize materials from the `<Folder Name>` folder into a sustainable, searchable, and queryable personal knowledge base.

## Scope

- Source materials are from the local folder: `<User Path>`.
- Keep the original materials as sources.
- Wiki content generated must be based on the original materials and must not be fabricated.
- Concept pages, entity pages, source summary pages, and comprehensive analysis pages will be generated by the LLM.
- When new materials are added or existing ones are modified, incrementally update the Wiki accordingly.

## Key Questions

- What are the main topics covered by these materials?
- Which concepts, people, organizations, methods, or events are most important?
- What relationships exist among the different materials?
- Where are the knowledge gaps?
- What content is worth distilling into long‑term Wiki pages?
```

If the user has already specified clear goals, make those goals more concrete.

For example, if the user says:

```text
帮我把这个行业研究文件夹做成竞品分析知识库
```

Then `purpose.md` should be revised to better align with the business objectives:

```markdown
# Purpose — Industry Research

## Goal

This Wiki is intended to organize industry research, competitive intelligence, and market analysis documents into a sustainable knowledge base for competitor analysis and industry insights.

## Scope

- Source materials are from the local folder: `<User Path>`.
- Focus on organizing industry trends, major companies, product capabilities, business models, market size, user needs, and competitive landscape.
- Keep the original materials as sources.
- Wiki content generated must be based on the original materials and must not be fabricated.
- When new reports, news, interviews, or analytical materials are added, incrementally update the Wiki accordingly.

## Key Questions

- What are the core trends in the current industry?
- Who are the main competitors?
- What are the differences in product capabilities, business models, and target users among competitors?
- Which companies, technologies, policies, or events are influencing industry changes?
- What information gaps exist in the current materials?
- Which conclusions are worth distilling into long‑term Wiki pages?
```

It is recommended that the user first ask:

```text
1. 这个知识库目前有哪些核心主题？
2. 请总结已导入资料的主要内容。
3. 哪些概念最重要？
4. 哪些资料之间关联最强？
5. 当前知识库有哪些明显缺口？
6. 哪些内容值得沉淀为长期 Wiki 页面？
```

## Incremental Updates

When the user says:

```text
我加了新文件，帮我更新 wiki
重新扫描这个文件夹
把新增资料导进去
```

Handling approach: 

```text
请打开 LLM Wiki 中的对应项目。

如果新文件已经放在原来的 source folder 下，可以等待应用自动检测，或手动触发 rescan / re-ingest。

如果是一个新的文件夹，请再次使用 Folder Import 导入。

导入后等待 Activity Panel 中的 ingest 队列完成。

完成后建议检查：
- Wiki / Knowledge Tree 是否新增或更新页面。
- Sources / File Tree 是否包含新增资料。
- Search 是否能搜到新增内容。
- Graph 是否出现新的主题或实体关系。
- Review 是否有需要人工判断的项目。
- Chat 是否能基于新增资料回答问题。
```

## Query

When the user asks questions based on the Wiki created with Option 4, prioritize guiding them to use the Chat feature of the LLM Wiki desktop application.

```text
请在 LLM Wiki 的 Chat 中输入您的问题。
应用会基于当前 Wiki、索引、图谱关联和可选向量检索组织上下文，并显示引用来源。
```

如果当前 Agent 能访问本地 HTTP API / MCP Server，可以协同查询。

但如果连接失败，不要假装已查询成功，应改为引导用户在桌面应用中操作。

## Existing Wiki Updates

If the user provides an existing LLM Wiki project directory, first identify whether it is an Option 4 project.

Common characteristics:

```text
purpose.md
schema.md
index.md
overview.md
log.md
raw/sources/
wiki/
.llm-wiki/
.obsidian/
```

If any of the following combinations exists, it can be identified as Option 4:

```text
purpose.md + schema.md + raw/sources/
```

or: 

```text
.llm-wiki/
```

or: 

```text
purpose.md + index.md + wiki/ + raw/sources/
```

The update process does not require step‑by‑step interaction; a complete set of instructions should be provided at once:

```text
请在 LLM Wiki 桌面应用中完成：

1. 打开已有项目
2. 确认 Settings 中的模型配置仍然可用
3. 如果新增文件已经放在原来的 source folder 下，可以等待自动检测，或手动触发 rescan / re-ingest
4. 如果新增文件来自新的文件夹，请使用 Folder Import 导入
5. 在 Activity Panel 中等待 ingest 完成
6. 完成后检查 Wiki / Search / Graph / Review / Chat 是否已经更新
```

## Error Handling

### The Current Environment Cannot Install GUI Applications

```text
当前环境可能无法直接安装或启动桌面应用。
请手动安装：

1. 打开 https://github.com/nashsu/llm_wiki/releases
2. 下载对应系统安装包
3. 安装并启动 LLM Wiki
4. 安装完成后告诉我“已安装”

安装完成后，我会一次性给您后续完整操作指引，包括模型配置、项目创建、purpose.md、文件夹导入、ingest 观察和使用方式。
```

### Ingestion Failure

User Prefers Not to Use Online Models: 

- Whether the API Key is correct.
- Whether the model name is correct.
- Whether the Endpoint / Base URL is correct.
- Whether the network is working properly.
- Whether the local model service is running.
- Whether the file is too large or has an abnormal format.
- Whether batch import is needed.
- Whether to switch to a model with a longer context.

### User Prefers Not to Use Online Models

```text
如果您不想使用在线模型，可以使用 Ollama 或其他本地 OpenAI-compatible 服务。

请先启动本地模型服务，然后在 LLM Wiki Settings 中配置：

- Provider：OpenAI-compatible 或对应本地服务类型。
- Base URL：本地服务地址，例如 http://localhost:11434/v1。
- API Key：如本地服务不需要，可按应用要求填写占位值。
- Model：本地模型名称。
- Context Window：根据模型能力填写。
```

## Minimum Success Criteria

For a successful execution of Option 4, at least the following conditions must be met:

1. The user has explicitly agreed to use the LLM Wiki desktop application.
2. The user has installed or opened LLM Wiki.
3. The Agent has provided a complete set of post‑installation guidance at once.
4. The guidance includes instructions for model configuration, with a clear statement that the user should not send the API Key in the conversation.
5. The guidance includes a suggested project name.
6. The guidance includes a template recommendation.
7. The guidance includes a draft of `purpose.md`.
8. The guidance includes the Folder Import path and steps.
9. The guidance explains how to check the ingestion progress in the Activity Panel.
10. The guidance explains how to use Wiki / Search / Graph / Review / Chat after ingestion is complete.
11. The guidance explains how to perform incremental updates later on.