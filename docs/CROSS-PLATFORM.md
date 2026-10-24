# 扩大系统覆盖范围的操作方法

先区分三项验收：维护代码自动检查、完整离线运行环境、实际 Cursor 安装与界面。只有三项均有证据的平台才可列为完整支持。

## 1. 扩大自动检查

在 `.github/workflows/ci.yml` 的 `strategy.matrix.os` 中增加 macOS runner。Windows、Ubuntu、macOS 分别运行 `npm test`、`npm run check:repo`、`npm run sync -- --strategy=api`、`npm run verify` 和源码归档检查。没有 Cursor 元数据时只检查构建和结构，不能填写版本键覆盖率或实机通过。

Node.js、CPU 架构也应分别列出，避免把 macOS Intel 和 Apple 芯片、Windows x64 和 ARM64 混成一项。选择有对应依赖的运行环境后再添加矩阵项。

## 2. 适配完整离线运行环境

当前 `offline/assets.json` 只锁定 Windows x64 的 Python 与原生依赖。为每个目标系统/架构建立独立资产清单，记录官方来源、版本、SHA-256、许可和依赖组合；适配 `scripts/setup-offline.mjs` 的解压、Python 启动和平台选择。不得让其他系统误用现有 Windows 二进制包。

在隔离状态目录执行 `node scripts/setup-offline.mjs --state="隔离目录"` 和 `npm run test:offline -- --state="隔离目录"`。运行时准备脚本当前会拒绝其他平台，必须先完成对应实现。检查技术片段保护、混排中文、中文路径、离线请求、授权校验、缓存和原文恢复。状态目录与本机日常会话目录分开。

## 3. 适配安装与恢复

从合法安装的目标版本提取资料：`npm run detect`、`npm run extract`、`npm run check-upgrade`。核对 `scripts/lib/cursor-paths.mjs`、`scripts/translate-install.mjs` 中的路径、启动入口、进程检查、缓存与校验信息处理。

Linux 还需核对不同发行版、安装包格式和目录权限。macOS 还需核对 Intel/Apple 芯片和修改应用后签名、完整性检查及启动行为；不能通过取消系统安全措施来掩盖适配失败。Windows ARM64 需分别验证原生依赖和运行架构。

完成适配前保留平台拒绝保护。不能只删除平台判断或把新版本写入白名单。

## 4. 做真实用户验收

每个平台至少覆盖：新用户首次安装、中文及空格安装路径、已有语言包冲突、失败写入恢复、重复安装、更新后重新适配和卸载恢复。对菜单、设置、AI 面板、历史标题和正文逐页核对，检查代码/变量/命令保护与中英文原文切换。

自动测试和模拟 DOM 通过后，仍应实际启动 Cursor；记录系统、CPU、Cursor 版本与 commit、测试日期、截图和失败项。没有对应设备或可交互虚拟机时，将该项标为待验证。

## 5. 按范围交付

通过验收后再更新 `runtimeVerifiedCursorVersions` 及平台支持配置，分别制作目标平台的离线包。同步版本、安装说明、许可、回滚步骤和 `SHA256SUMS`。不要发布一个名称模糊的“全系统通用完整包”。

当前优先顺序：补齐 Windows 新用户与多路径实机验收；增加 macOS 的基础维护代码检查；随后分别推进 Linux、macOS 的完整运行时和实际安装适配，Windows ARM64 单独验证。

测试和构建保留临时目录与旧产物，不自动批量删除；需要清理时由用户手动处理。
