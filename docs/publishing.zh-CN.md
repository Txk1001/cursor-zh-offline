# 维护、构建与发布

项目源码仓库为 [Txk1001/cursor-zh-offline](https://github.com/Txk1001/cursor-zh-offline)。本地 1.1.0 安装包已经交付；GitHub Release、远端 CI 和扩展市场的状态需分别核验，不从源码上传推断成功。当前市场发布关闭。

## 干净源码构建

环境：Node.js 22；归档使用 PowerShell 7。完整离线运行时只支持 Windows x64。源码不依赖本机 Cursor 的提取元数据，默认从固定 commit 同步公开上游资源：

```powershell
npm ci
npm test
npm run check:repo
npm run sync -- --strategy=api
npm run verify
npm run package -- --skip-build
```

`metadata/community-sources.json` 必须纳入仓库；其他 `metadata/` 文件不提交。`upstream/` 是可重新下载的缓存，不提交。无本机 Cursor 元数据时，构建使用完整公开语言键；这不意味着已完成所有界面与版本的实机验收。

## 归档产品

先选择全新的输出路径，避免覆盖先前交付包。源码包不要求预先构建 VSIX：

```powershell
pwsh -File scripts/build-public-archive.ps1 -SourceOnly -OutputPath "release/cursor-zh-offline-1.1.0-source.zip"
pwsh -File scripts/verify-archive.ps1 -SourceOnly -ArchivePath "release/cursor-zh-offline-1.1.0-source.zip"
```

它包含源码、测试、图标、公开来源记录、许可、GitHub 工作流与文档；排除 VSIX、模型、Python 运行时、下载缓存、依赖目录、个人元数据和报告。图标为必要源码素材。源码 ZIP 是可初始化的源码快照，不携带 `.git` 历史。

Windows 完整离线包另需准备并测试本机推理资产。测试状态目录应为专用临时目录，不能指向正在使用的个人状态：

```powershell
node scripts/setup-offline.mjs --download --state=".tmp-offline-validation"
npm run test:offline -- --state=".tmp-offline-validation"
pwsh -File scripts/build-public-archive.ps1 -WithOffline -OutputPath "release/cursor-zh-offline-1.1.0-Windows-x64-offline.zip"
pwsh -File scripts/verify-archive.ps1 -RequireOffline -ArchivePath "release/cursor-zh-offline-1.1.0-Windows-x64-offline.zip"
```

完整包包含匹配版本的 VSIX、安装脚本、上游中文资源与 17 项锁定资产；实际数量以资产清单为准。保留各项原始许可。默认无开关的归档为安装维护包，含 VSIX 但不含离线资产；旧 `build-maintenance-archive.ps1` 已转为同一公共白名单入口。

每个 ZIP 均生成逐文件 `MANIFEST.sha256` 和外部 `.sha256`。发布工作流额外生成涵盖两个 ZIP 与独立 VSIX 的 `SHA256SUMS`。归档校验拒绝缺项、损坏、私有状态路径和错误版本；个人数据还需通过发布前内容检查。

## GitHub 工作流

[CI](../.github/workflows/ci.yml) 在 Ubuntu 与 Windows 执行维护测试、构建、语言包与源码归档检查，Windows 另验证离线运行时和完整离线包。[Release](../.github/workflows/release.yml) 重新构建并产出源码 ZIP、Windows 离线 ZIP、VSIX 和 SHA256SUMS。

手动启动 Release 工作流只上传 Actions 构建产物。推送匹配 `config.json` 版本的 `v*` 标签才创建 GitHub **预发布**。该流程不调用 Open VSX 或 VS Marketplace，不需要它们的发布令牌。未经授权不推送标签；本机验证通过不能记作远端 CI 成功。

后续发布流程：

1. 核对仓库所有者及 `config.json` 中 repository、homepage、bugs，审查待发布提交；不得复用上游身份。
2. 推送源码，实际运行 CI，记录运行链接与结果。
3. 完成 [实机验收清单](VALIDATION.md)，确认版本与全部产物一致。
4. 经授权推送对应版本标签，工作流创建预发布；检查资产、校验值和说明。
5. 扩展市场发布属于另外的授权步骤，必须拥有独立 publisher 命名空间；不使用上游凭据。

## Cursor 新版本维护

在合法安装上运行 `npm run detect`、`npm run extract`、`npm run check-upgrade`。检查资源结构、启动入口、占位符、硬编码文字和历史页选择器；重新构建并验证失败回滚、原文切换及真实界面。

`verifiedCursorVersions` 只记录标准语言键核对，`runtimeVerifiedCursorVersions` 控制完整补丁准入。完成适配与实机记录后才允许增加后者。升级版本时同步 config、package、lockfile 根版本、变更记录和兼容性表。

个人翻译缓存、连接文件、聊天数据和原始 Cursor 资源不进入版本库或发布包。依赖或模型升级必须同时更新下载地址、SHA-256、许可与隔离安装验证。

