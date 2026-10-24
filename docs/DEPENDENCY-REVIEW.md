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
| [#2](https://github.com/Txk1001/cursor-zh-offline/pull/2) | checkout v4 → v7 | 本轮固定现用 v4 的实际 commit；升级另审 runner 要求 |
| [#3](https://github.com/Txk1001/cursor-zh-offline/pull/3) | setup-node v4 → v7 | 同上，另审缓存与 Node 条件 |
| [#5](https://github.com/Txk1001/cursor-zh-offline/pull/5) | upload-artifact v4 → v7 | 同上，另验下载、文件名和 SHA-256 |
| [#1](https://github.com/Txk1001/cursor-zh-offline/pull/1) | action-gh-release v2 → v3 | 本轮候选流程移除自动公开步骤，不需要该 Action；不冒充已审并合并该 PR |

此表记录原审查快照中的升级范围和本轮处置，不宣称外部 PR 当前已更新、合并或完成独立审核。任何后续合并都需要实际 CI 与维护者人工确认；真实审阅发生时再留证，不制造虚假评论。

## 固定构建步骤

现用 checkout v4、setup-node v4、setup-python v5、upload-artifact v4 均按官方仓库标签查询得到的完整 commit 固定，并保留版本注释。Dependabot 用于提醒更新。构建权限为只读，资产哈希用于完整性检查，不是发布者签名。
