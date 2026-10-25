# 手动配置与 Agent 配置

核对日期：2026-10-25。手动配置和 Agent 配置使用同一个安装器、同一套版本限制、哈希校验和回滚规则；区别是由用户逐步执行，还是由 Agent 在已授权范围内执行。它们不是两套汉化实现。

本文中的历史控制条参数面向 1.1.2 候选源码。使用其他版本前先确认对应安装器确实支持这些参数，不能将候选行为写成已发布版本功能。当前完整补丁范围及验收状态见 [VALIDATION.md](VALIDATION.md)，环境准备见 [TEST-ENVIRONMENTS.zh-CN.md](TEST-ENVIRONMENTS.zh-CN.md)。

需要将任务交给其他 Agent 时，可复制 [Agent 配置任务提示词模板](../templates/agent-setup.zh-CN.md)。模板要求先只读报告目标、校验与计划，再按本轮已有授权继续；不会扩大操作范围，也不要求对已授权步骤重复许可。

## 1. 两条路径共同遵守的规则

1. 先确定系统、CPU 架构、Cursor 完整版本、commit、Code OSS 版本和唯一安装目录；记录是日常用户、专用新用户还是干净虚拟机，以及有无系统 Node/Python、旧语言包、翻译状态和历史配对。
2. 确定要测试的候选提交和下载入口，核对包的 SHA-256、包内清单、版本及许可。源码 ZIP、VSIX 和 Windows x64 完整离线 ZIP 用途不同，不可互相代替。
3. 完整补丁仅用于允许的 Windows x64 与 Cursor 版本。macOS 当前只做标准 VSIX 语言包基线，并核对 VSIX 引擎版本兼容；这部分仍待 Mac 实机验收。其他平台或版本不能靠删限制绕过。
4. 应用前先预览，检查目标与改写范围；保存工作、退出目标 Cursor，确认进程停止，并确认原件备份、安装账本和恢复入口可用后才应用。预览成功不等于真实界面验收通过。
5. 首次准备离线资产需要网络；下载齐全和校验通过后，另行检查断网情况下的本机翻译。标准 VSIX 自身不包含硬编码补丁或完整离线模型。
6. 不复制令牌、连接文件内容、私人会话、翻译词典或原文缓存到报告。不批量删除文件、缓存、备份或旧产物。

## 2. 手动配置路径

### 2.1 Windows 完整补丁

普通用户优先按已校验完整包内的说明使用安装入口。命令行示例在候选包或对应源码根目录执行，要求可用的 Node.js 22 或经确认可用的 Cursor 内置运行时；不要为了“无系统 Node/Python”验收临时安装系统开发工具。

先预览紧凑、右上角的安装预设。这里只读检查；不修改 Cursor 程序资源或系统设置，也不提前改变当前窗口中的本机偏好：

```powershell
node scripts/translate-install.mjs --preview --history-controls=compact --history-position=top-right
```

核对系统、版本、目标目录与预览结果后，保存工作并完全退出 Cursor。确认原始资源备份与恢复方式，再执行：

```powershell
node scripts/translate-install.mjs --history-controls=compact --history-position=top-right
```

如果本轮需要启用离线运行时，安装入口支持附加 `--with-offline`：

```powershell
node scripts/translate-install.mjs --history-controls=compact --history-position=top-right --with-offline
```

首次资产准备需要联网。准备和校验完成后再配对、检查翻译与原文，不把准备时联网说成运行时调用在线翻译。多个 Cursor 安装或非默认路径时，预览和正式应用均补充同一个明确的 `--dir="安装目录"`。

重新打开 Cursor 后，按 [Windows 实机验收表](WINDOWS-ACCEPTANCE.md) 检查。回滚时先保存工作并退出 Cursor，再按该候选版本说明执行 `node scripts/translate-install.mjs --undo`；自定义目录须附加原来的 `--dir`。核对同一安装和 commit 的资源恢复哈希，保留原件与安装记录。

### 2.2 macOS 标准语言包基线

1. 在专用普通测试用户中安装对应 ARM64 或 x64 的官方 Cursor，记录系统、架构、完整版本、commit 和 Code OSS 版本。
2. 核对 VSIX 来源、SHA-256 以及 `extension/package.json` 中的 `engines.vscode`；未确认引擎兼容时不继续安装。
3. 用 `Extensions: Install from VSIX...` 安装，执行 `Configure Display Language` 选择简体中文，保存后完全退出再打开测试 Cursor。
4. 检查标准菜单、命令面板、设置与语言持久性，并如实保留 Mac 实机尚未覆盖的条目。

Mac 不执行本节的 Windows 完整补丁命令，不安装 Windows 二进制离线运行时，不承诺历史控制条或离线正文翻译已经可用。禁止删除平台拒绝、关闭 Gatekeeper，或用关闭系统完整性措施代替适配。

## 3. Agent 自动配置路径

Agent 应先给出可核对的目标与检查结果，再在本次任务已授权的范围内继续。仅要求方案、文档或只读检查，不表示用户授权启用系统功能、退出或重启应用、修改真实程序资源。

### 3.1 只读探测

- 确认操作系统及版本、CPU 架构、当前用户权限、所有 Cursor 安装位置及运行状态。
- 从真实安装中读取 Cursor 版本、commit 和 Code OSS，不能根据目录名、ZIP 名或旧截图判断。
- 检查系统 Node/Python 是否可用，记录旧语言包、配置、离线资产与配对是否存在；不要读取或输出连接令牌、聊天正文及私人词典。
- 判断这是“同机新用户”还是“全新系统”，保留 [测试环境说明](TEST-ENVIRONMENTS.zh-CN.md) 中对应的证据限制。

### 3.2 校验与分流

- 确定候选提交、文件来源和 SHA-256；检查包内清单、版本一致性和 VSIX 引擎兼容性。哈希不符或来源不明时停止安装。
- Windows x64 且版本在准入表中：进入完整补丁流程。若缺少可用安装运行时，记录失败，不擅自安装系统开发工具来冒充无依赖通过。
- macOS：只进入标准 VSIX 语言包基线，记录 Apple 芯片或 Intel 架构与尚未实机验收范围；不执行完整补丁。
- 其他系统、架构或 Cursor 版本：列出差异与后续适配项，保留平台和版本拒绝，不修改白名单绕过。

### 3.3 预览、备份、应用

1. 对 Windows 目标执行 `node scripts/translate-install.mjs --preview --history-controls=compact --history-position=top-right`；有自定义目录时附加明确的 `--dir`。
2. 检查预览输出的安装位置、版本、预计改写资源、备份与恢复信息。遇到未知修改、资源不匹配、冲突或非唯一安装时，先诊断，不强制覆盖。
3. 只有真实安装操作已获授权时，保存用户工作并退出指定 Cursor，核对进程停止、原始资源备份和恢复入口；不结束无关程序。
4. 使用预览时相同的目标与历史控制条参数，去掉 `--preview` 正式应用；需要离线运行时且已纳入本次任务时才加 `--with-offline`，首次准备资产需网络。
5. 在已授权时重新启动目标 Cursor；核对真实界面、原文完整性、技术片段、重复安装和回滚。只记录实际完成的范围，未访问页面和独立环境继续标记待验收。

macOS 的对应流程是先核对 VSIX 内容与引擎、记录已有语言包并保留恢复方式，再在测试用户安装 VSIX；不调用 Windows 完整补丁预览或应用命令。

## 4. 历史控制条参数与本机偏好

| 参数 | 允许值 | 默认值 |
| --- | --- | --- |
| `--history-controls` | `compact`、`expanded` | `compact` |
| `--history-position` | `top-right`、`top-left`、`bottom-right`、`bottom-left` | `top-right` |

上表定义安装预设：未传参数时为 `compact` / `top-right`。没有与当前安装预设匹配的已保存偏好时，`compact` 显示窗口内的“译文”小按钮，点击展开控制条；`expanded` 则初始展开。展开后可用位置下拉选择四角，或使用拖动手柄移动；选择下拉位置会清除已有拖动坐标。点击控件外部或按 `Escape` 会收起面板。

界面把展开状态、四角位置和拖动坐标保存在当前用户对应界面的本机 `localStorage`，键为 `cursor.zh.history.controls.v1`。保存记录中的 `defaultsKey` 必须与本次安装的“模式|位置”一致，才优先沿用保存的偏好。例如同样使用 `compact|top-right` 重新安装后，之前保存的展开状态或拖动位置仍可能保留；改用不同的安装预设时，旧记录不再优先，先使用新的安装预设。因此不能仅根据安装参数推断打开后的实际位置与展开状态。

面板中的“恢复预设位置”会清除拖动坐标，同时恢复本次安装预设的位置及展开/收起状态，并保存结果。例如当前预设为 `compact` / `top-right` 时，点击后回到右上角并收起。它不会删除翻译缓存、改写聊天数据库或重装补丁。

上述偏好不自动同步到其他电脑，也不写入公共源码。控件预设和布局偏好不启用系统功能、不更改 Windows 或 macOS 系统设置；正式应用完整补丁仍会按前述流程修改指定的 Cursor 程序资源，不能把预览或文档中列出的默认值当作本轮已经应用的设置。

这些选项调整历史控制条的布局，不扩大翻译范围，也不使尚未支持的系统获得完整补丁。手动配置与 Agent 配置都使用上表允许值，遇到其他值应停止并提示修正。

## 5. 资料依据

- 项目现状与边界：[验收状态](VALIDATION.md)、[跨平台方法](CROSS-PLATFORM.md)、[Windows 实机验收表](WINDOWS-ACCEPTANCE.md)、[贡献指南](../CONTRIBUTING.md)。
- Cursor 安装：[官方安装说明](https://prod.cursor.com/help/getting-started/install)、[官方下载页](https://cursor.com/download)。
- Mac 测试用户：[Apple 官方说明](https://support.apple.com/zh-cn/guide/mac-help/mchl3e281fc9/mac)。
- Windows 干净环境：[Microsoft Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/)。

本文仅描述规则与执行入口，没有启用系统功能、修改真实 Cursor 安装、重启应用或完成对应设备的实机验收。
