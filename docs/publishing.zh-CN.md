# 维护、构建与候选发布

源码仓库为 [Txk1001/cursor-zh-offline](https://github.com/Txk1001/cursor-zh-offline)。当前源码为 1.1.2 候选版，最近公开版本为 1.1.1 预览。验证事实集中在 [验收状态](VALIDATION.md)，不沿用历史版本的通过结论。扩展市场发布关闭。

## 干净源码构建

开发基准为 Node.js 22、Python 3.12.10、PowerShell 7；根清单最低 Node.js 22。完整离线运行时仅支持 Windows x64。

```powershell
npm ci
npm test
npm run test:protection
npm run lint:md
npm run check:repo
npm run sync -- --strategy=api
npm run verify
npm run package -- --skip-build
```

默认使用公共发行配置 public，无论 metadata/cursor.json 缺失、有效或损坏均不读取它，不执行本机过滤或占位符修复。固定上游、锁文件与手工覆盖组成公共输入。显式本机诊断使用 `npm run build -- --profile=local`，再运行 validate 与 coverage；该产物不能混入公共发行。coverage 统计语言资源键，不能作为代码执行覆盖率。

构建记录 dist/build-record.json 包含源码 commit、未提交改动标记、锁文件和配置哈希、上游 ref、平台、Node 及过滤参数。源码 ZIP 无 .git 时由 BUILD-INFO.json 记录来源。未声称 ZIP 或 VSIX 逐字节可复现。

## 制作归档

使用全新路径保留旧产物：

```powershell
pwsh -File scripts/build-public-archive.ps1 -SourceOnly -OutputPath "release/cursor-zh-offline-1.1.2-source.zip"
node scripts/setup-offline.mjs --download --state=".tmp-offline-validation"
npm run test:offline -- --state=".tmp-offline-validation"
pwsh -File scripts/build-public-archive.ps1 -WithOffline -OutputPath "release/cursor-zh-offline-1.1.2-Windows-x64-offline.zip"
pwsh -File scripts/verify-archive.ps1 -RequireOffline -ArchivePath "release/cursor-zh-offline-1.1.2-Windows-x64-offline.zip"
```

源码包不要求已有 VSIX；完整包要求当前 public 构建与 VSIX，包含 17 项固定离线资产及许可。两种 ZIP 都有 BUILD-INFO.json、逐文件 MANIFEST.sha256 与外部 .sha256。归档校验拒绝缺项、重复路径、私人状态及错误版本。默认不读取私人词典；确需额外本地排查时主动传入 -PrivateCatalogPath，该输入不上传、不输出原文。仍需人工内容检查。

## PR 与发布关口

main 已启用 PR、Windows/Ubuntu 必需检查及禁止强推/删除的规则。审批人数为 0，符合单维护者事实；维护者仍需人工确认内容，不能用机器人活动虚构独立审查。

[CI](../.github/workflows/ci.yml) 验证维护测试、8 项独立 Python 规则、文档、语言包与归档，Windows 另运行真实离线模型。[候选工作流](../.github/workflows/release.yml) 只有 contents: read 权限：推送 v 标签或手动选择分支/标签，均只生成 Actions 候选产物，不会创建或公开 Release。该行为从本次源码开始改变；旧 v1.1.1 标签仍保存旧版工作流，不能重跑旧工作流代替新流程。

1. 在修复 PR 中记录范围、结果、未验证项；CI 通过后由所有者人工确认合并。
2. 对候选提交运行工作流，下载候选产物；校对 RELEASE-CANDIDATE.json 的版本、commit、文件哈希与运行链接。
3. 从该候选包完成当前电脑与独立 Windows 的安装、重启、核心页面、原文完整性和回滚验收，填写 [验收表](WINDOWS-ACCEPTANCE.md)。候选清单默认 pending，自动测试不会替人填写通过。
4. 提供同一提交和产物的具体审阅结果，取得所有者明确公开确认后，再通过 GitHub Releases 创建预览。上传已经验收的文件，不临时重建另一份包。
5. 至少保留版本、候选 commit、产物清单、SHA-256、实机记录和确认依据；发布前复核标签仍指向候选 commit。未完成硬门槛就保留候选状态。

## Cursor 新版本维护

运行 detect、extract 与 check-upgrade，检查启动锚点、资源键、占位符、历史选择器、失败回滚和真实界面。verifiedCursorVersions 是标准资源核对，runtimeVerifiedCursorVersions 仅控制完整补丁准入，不能据此宣称任意版本已通过实机验收。未经适配不扩大版本列表。

安装资源中断由持久事务恢复；持锁记录先完整写入、刷新后原子发布。死进程按 PID 和启动身份判断；旧损坏锁保留诊断。不能确认时先退出所有安装进程、核对明确路径，再单独改名留存。不要同时运行旧安装器，不要批量清理状态目录。
