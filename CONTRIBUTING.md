# 贡献指南

欢迎通过 [本项目 Issues 与 Pull Requests](https://github.com/Txk1001/cursor-zh-offline) 提交漏译、错译、版本适配与稳定性改进。上游项目不能代收本集成版问题。

## 开发准备

开发基准为 Node.js 22、Python 3.12.10；Windows 打包使用 PowerShell 7。从干净源码开始：

```powershell
npm ci
npm test
npm run test:protection
npm run lint:md
npm run sync -- --strategy=api
npm run verify
npm run package -- --skip-build
```

同步下载使用 `config.json` 固定的上游 commit。要核对实际 Cursor 版本，另运行 `npm run detect`、`npm run extract`。本机提取结果不提交。

## 修改位置

| 内容 | 源文件 |
| --- | --- |
| 编辑器和 Cursor 标准界面 | `src/i18n/zh-cn/` |
| 硬编码界面 | `src/i18n/zh-cn/hardcoded.json`、`local-overrides.zh-cn.json` |
| 动态状态 | `runtime-overrides.zh-cn.json` |
| 历史显示与离线请求 | `scripts/lib/history-localization.mjs`、`scripts/lib/offline-client.mjs` |
| 默认术语、公共精校短句 | `offline/terms.default.json`、`offline/reviewed.zh-cn.json` |
| 安装与回滚 | `scripts/translate-install.mjs` 及其辅助模块 |
| 公共来源记录 | `metadata/community-sources.json` |
| 适配范围与版本 | `config.json`，版本同时更新 package 与 lockfile |

## 翻译要求

保留变量、占位符、命令、路径、链接、快捷键、代码与有效换行。区分 Agent“智能体”、编辑器标签页“标签页”和产品 Tab“代码补全”。遵循 [术语表](docs/TERMINOLOGY-zh-CN.md)，含糊语境标记待确认，不能凭字符串猜测技术含义。

界面短句优先人工校对；历史自动翻译允许保留原文并提示未校对。不得把用户私有消息加入公共词典。提交公开、人工构造的复现文本即可。

## 提交前

- 说明触发条件、旧行为、新行为及相关测试结果。
- 安装或回滚改动应覆盖写入中断、缺少备份、版本不匹配等失败情况。
- 翻译改动应覆盖变量保护、中文与英文混排、长文本、原文切换。
- 运行 `npm test`、`npm run check:repo`、`npm run verify`；涉及安装分发时再构建并验证归档。
- 文档改动运行 `npm run lint:md`。规则检查标题、列表、代码块等结构，中文长行不设硬性列宽；它不判断事实或译文是否正确。
- 检查范围包括维护中的根文档、`docs/`、PR 模板、离线许可说明与扩展说明；上游归档说明、依赖、构建产物和 `reports/` 不纳入仓库文档门禁。
- 工作流程为开发分支、PR、必需 CI 与维护者人工确认。只有一位维护者时不虚设独立双人审批，尚未通过的检查不能记作通过。
- 真实 Cursor 操作、干净用户或远端 CI 没做过就写“未验证”，不能用模拟用例代替。
- 不提交 `node_modules/`、`dist/`、`offline/assets/`、`upstream/`、`reports/` 或个人状态。

新版本适配须按 [发布流程](docs/publishing.zh-CN.md) 留下记录，不能只增加准入版本号。默认仅发布简体中文；新增语言需独立校对、测试和验收。

贡献按项目 MIT 许可提供，保留已有作者版权；引用外部内容时记录来源、许可、原始版本和必要署名。
