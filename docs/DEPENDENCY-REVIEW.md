# 依赖与安全审查

核对日期：2026-10-24。本轮不批量合并 Dependabot 大版本 PR。根依赖均为维护工具，VSIX 使用 --no-dependencies，完整包不包含 node_modules；源码用户安装开发依赖时仍受其安全状态影响。

## 本轮锁文件处置

按现有版本约束更新 brace-expansion、follow-redirects、markdown-it、qs、undici，以及 Azure 身份组件及相关间接项。npm audit 的已知告警从 7 项（6 high、1 moderate）降为 2 项 high。未采用强制跨主版本覆盖。

剩余两项来自 @azure/identity 和 @azure/msal-node 的同一 [MSAL 授权流程告警](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5)。当前 @azure/identity 的兼容约束仍引入受影响的 MSAL，直接覆盖至 7.1.0 涉及主版本契约，留待上游兼容修复或单独升级审查。

限制与缓解：这两个组件由维护工具的发布认证链引入，VSIX/完整安装包不分发这些 Node 依赖；当前公共构建只打包，不登录 Azure 或扩展市场，市场发布入口由 marketplaceEnabled=false 拒绝。不要启用该认证发布流程或处理不可信登录重定向。若未来启用市场发布，先解决此告警并单独验收；这不等于“全仓无漏洞”。GitHub Dependabot 告警 API 的权限不足状态不能当作没有告警。

## 已有升级 PR 的处理顺序

| PR | 内容 | 本轮处置与后续核对 |
| --- | --- | --- |
| [#7](https://github.com/Txk1001/cursor-zh-offline/pull/7) | opencc-js 1.4.1 → 1.4.2 | 补丁升级独立审查；繁体生成未开放为完整支持，需转换样例回归 |
| [#8](https://github.com/Txk1001/cursor-zh-offline/pull/8) | vsce 3.2.1 → 4.0.0 | 主版本暂缓；核对 Node 最低版本、打包结果和许可文件 |
| [#4](https://github.com/Txk1001/cursor-zh-offline/pull/4) | ovsx 0.10.1 → 1.3.0 | 发布工具暂缓；市场发布关闭，先审兼容与授权链 |
| [#6](https://github.com/Txk1001/cursor-zh-offline/pull/6) | jsdom 26.1 → 30.1.3 | 主版本暂缓；重跑历史/运行时 DOM 全套测试及 Node 条件 |
| [#2](https://github.com/Txk1001/cursor-zh-offline/pull/2) | checkout v4 → v7 | 已核对 v7.0.1，Node 24 与安全触发条件；在 PR #11 的独立构建提交更新，不合并该旧 PR |
| [#3](https://github.com/Txk1001/cursor-zh-offline/pull/3) | setup-node v4 → v7 | 已核对 v7.1.0，保留显式 npm 缓存；未设置 registry-url，不受移除虚构认证令牌影响 |
| [#5](https://github.com/Txk1001/cursor-zh-offline/pull/5) | upload-artifact v4 → v7 | 已核对 v7.0.2，Node 24；保持归档上传模式，重验候选资产和哈希 |
| [#1](https://github.com/Txk1001/cursor-zh-offline/pull/1) | action-gh-release v2 → v3 | 本轮候选流程移除自动公开步骤，不需要该 Action；不冒充已审并合并该 PR |

此表记录原审查快照中的升级范围和本轮处置，不宣称外部 PR 当前已更新、合并或完成独立审核。任何后续合并都需要实际 CI 与维护者人工确认；真实审阅发生时再留证，不制造虚假评论。

## 固定构建步骤

本次按用户提供的失败截图追加处理构建警告：checkout v7.0.1、setup-node v7.1.0、setup-python v7.1.0、upload-artifact v7.0.2 均从官方正式 Release 逐项核对并固定完整 SHA，来源见 [.github/actions-lock.json](../.github/actions-lock.json)。四个 Action 自身使用 Node 24；项目测试仍使用 Node 22，这两个版本用途不同。最低 runner 为 2.327.1；本项目使用 GitHub 托管 runner，不使用容器 Action 内的认证 Git 命令。checkout 的 fork 安全限制保持默认；workflow 不使用 pull_request_target 或 workflow_run，不启用不安全检出。

CI 仍固定 Linux 实机为 Ubuntu 24.04，以提供 Python 3.12.10；检查显示名沿用既有分支保护名称。matrix.fail-fast=false 让一个平台失败时另一个继续给出结果，任何失败仍会使检查失败。没有启用 continue-on-error 来掩盖失败。候选构建保持只读，不自动公开 Release。

这是对本轮 CI 问题的同类构建工具修复，未批量合并 Dependabot PR；其他运行时/发布工具的大版本升级仍独立审阅。更新 Action 时必须同步该锁记录和检查兼容条件。
