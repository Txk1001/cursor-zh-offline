# 独立 Windows 与 macOS 测试环境

核对日期：2026-10-25。本文提供环境准备步骤，不代表这些环境已经完成验收。项目当前源码为 1.1.2 候选版，完整补丁仅准入 Windows x64 / Cursor 3.27.6、3.27.12 / Code OSS 1.128.0；实时状态以 [验收状态](VALIDATION.md) 为准。

## 1. “独立 Windows”和“未访问页面”分别指什么

“独立 Windows”用于检查安装是否依赖维护电脑已有的开发工具、用户配置、翻译缓存或历史配对。不能把同一用户下换一个测试目录当作全新用户环境。

| 环境 | 可以验证什么 | 不能直接证明什么 |
| --- | --- | --- |
| 当前 Windows 中新建普通用户 | 首次用户配置、语言包、配对、缓存和偏好是否正常建立 | 系统和系统级安装仍共用；不等于没有 Node/Python 的全新系统 |
| 全新 Windows x64 虚拟机或备用机 | 无系统 Node/Python、无旧配置的完整包首次安装和恢复 | 虚拟机不能代表所有实体硬件；仍须记录虚拟化和图形环境 |
| Windows Sandbox | 一次性的干净安装与依赖初筛 | 关闭后软件和状态丢弃，不能替代跨会话的长期使用检查 |
| macOS 实机或 macOS 虚拟机 | 对应 Mac 系统、架构的语言包或移植检查 | 不会补齐 Windows x64 验收；当前不能验收 Windows 完整包 |

“未访问页面”包括没有实际打开过的页面，以及同一页面的空列表、报错、加载中、弹层、长文本、展开和折叠等状态。翻译词条存在、自动测试通过或某张截图正确，都不能证明这些状态的真实显示正确。

## 2. Windows 怎么准备

### 2.1 优先方案：全新 Windows x64 虚拟机或备用机

1. 准备 Windows x64 环境，记录 Windows 版本、系统构建号、CPU 架构、实体机或虚拟机类型。Apple 芯片 Mac 上的 Windows ARM64 虚拟机不属于本项目当前完整补丁验收范围。
2. 创建专用普通测试用户，不同步日常设置，不导入已有 Cursor 配置、扩展、聊天或翻译状态。先记录干净状态；不要为了测试破坏主用户资料。
3. 普通用户安装验收阶段不预装 Node.js、Python、Git 或其他开发工具。检查这些程序是否已在系统中可用并留证；发现已有工具时如实记录，不能将其写成“无开发工具环境”。
4. 从官方渠道安装目标版本 Cursor，打开“关于”记录完整版本、commit、Code OSS 版本和架构。不要将自动更新后的其他版本强行加入白名单。
5. 从公开候选入口下载同一候选提交的完整 ZIP 及校验值，核对外层 SHA-256 和包内清单。源码 ZIP 和 VSIX 都不能代替完整离线 ZIP。
6. 先做安装预览，再保存工作并完全退出测试环境内的 Cursor；确认原始应用资源已可恢复后，使用完整包入口安装。若无系统 Node，记录安装入口实际是否成功使用 Cursor 内置运行时。
7. 按 [Windows 实机验收表](WINDOWS-ACCEPTANCE.md) 检查首次启动、离线配对、核心页面、技术文本保护、原文切换、重复安装、回滚和再次安装。首次准备资产与真正断网后的运行测试分别记录。
8. 重启测试环境后再次核对状态和语言。重启、回滚及任何真实安装操作均须在相应任务已经授权时执行；本文本身不会触发这些操作。

推荐为测试虚拟机分配 4 个虚拟 CPU、8GB 内存、至少 40GB 可用磁盘，并为宿主机保留足够资源。这是本项目的测试建议，不是 Windows 或 Cursor 的官方最低配置。

### 2.2 Windows 家庭版怎么选

Windows Sandbox 的官方支持版本列有 Pro、Enterprise、Education 等，家庭版不在支持列表中。家庭版用户优先使用备用 Windows x64 电脑，或在宿主机和虚拟化软件支持的条件下新建完整的 Windows x64 虚拟机；不需要仅为本次验收先升级系统版本，也不要用非官方脚本强行补装 Sandbox。[Microsoft 官方说明](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/)

如果暂时只能新建同机普通用户，可以先补充“新用户首次使用”的证据，但“全新系统且无系统 Node/Python”仍保留待验收。不能在记录中把两者合并成通过。

### 2.3 已具备 Sandbox 时的补充检查

Microsoft 说明 Sandbox 不继承主机中安装的软件，每次启动提供新的环境；关闭窗口会丢弃软件、文件和状态。使用前应先将待保存的结果导出。它适合检查是否错误依赖宿主机 Node/Python，但仍需完整虚拟机或备用机补充跨会话、回滚及长期使用检查。

启用 Sandbox 需要系统版本及硬件虚拟化满足条件，属于系统配置改动，可能要求重启。本轮只提供配置方案，不自动启用该功能或重启电脑。[官方安装条件与步骤](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-install)

## 3. macOS 怎么准备

### 3.1 先明确测试边界

| 组成 | 当前可做的 Mac 工作 | 当前不能声称 |
| --- | --- | --- |
| 标准 VSIX 语言包及维护扩展 | 核对目标 Cursor 的 Code OSS 引擎版本是否满足 VSIX 的 `engines.vscode`，再进行基线安装测试 | VSIX 一定兼容所有 Cursor 版本，或 Mac 已有实机通过记录 |
| 硬编码界面与历史显示补丁 | 本轮不应用；仅记录后续移植需处理的资源、路径、签名和恢复差异 | 当前 Windows 安装器已支持写入 Mac 应用 |
| Argos 离线运行时与模型 | 本轮不运行；后续移植需为 macOS ARM64、x64 分别准备依赖和资产 | Windows Python、原生依赖或完整离线 ZIP 能直接在 Mac 使用 |

当前安装器保留非 Windows x64 拒绝保护；Mac 当前仅进行标准语言层评估，标准 VSIX 基线仍待真实设备核对。安装一个标准语言包，不会自动启用硬编码补丁、本机历史翻译或历史控制条。

### 3.2 推荐配置与安装步骤

1. 优先使用真实 Mac。在“关于本机”确认 Apple 芯片或 Intel：Apple 芯片使用 ARM64 包，Intel 使用 x64 包；即便使用 Universal 安装包，也要记录实际运行架构。两个架构独立验收。
2. 选择目标 Mac 支持的稳定 macOS，记录版本和构建号。Cursor 当前官方快速入门列出 macOS 12 及以上、支持 Apple 芯片与 Intel；具体下载版本仍需核对其实际运行要求。[Cursor 官方系统要求](https://cursor.com/docs/get-started/quickstart)
3. 建议准备 16GB 内存、至少 30GB 空闲磁盘，用于源码、依赖、样例和证据。此为本项目开发测试建议，不是 Cursor 官方最低配置。仅做标准语言包测试不需要先安装 Node 或 Python。
4. 在“系统设置 → 用户与群组 → 添加用户”创建专用“普通”测试用户，不使用访客用户，不同步日常配置，不导入私人会话。[Apple 官方用户设置](https://support.apple.com/zh-cn/guide/mac-help/mchl3e281fc9/mac)
5. 从 [Cursor 官方下载页](https://cursor.com/download) 选择对应架构，打开 DMG 并将 Cursor 拖入“应用程序”。首次打开后记录完整版本、commit 和 Code OSS 版本；不要直接执行 Windows ZIP 内的 `.cmd` 或 Python `.exe`。
6. 校验待测试 VSIX 的 SHA-256，读取 VSIX 中 `extension/package.json` 的 `engines.vscode`，对照目标 Cursor 的 Code OSS 版本。无法确认兼容时停止安装，先记录差异。
7. 通过命令面板的 `Extensions: Install from VSIX...` 选择已核验文件。执行 `Configure Display Language`，选择简体中文，保存工作后完全退出并重新打开测试 Cursor。已有语言包冲突应先记录并在测试用户内处理，不动日常用户配置。
8. 检查菜单、命令面板、设置、扩展页和重启后语言是否保留；分别记录原英文、实际中文、遗漏和布局。Cursor 专属 AI 页面及历史翻译不在此基线的通过范围。

### 3.3 后续完整移植需要另外完成的工作

开发测试基准沿用 Node.js 22、Python 3.12.10，并选择对应 Mac 架构的原生运行环境。它们用于开发与移植，不应预先安装到“无开发工具普通用户”验收环境来掩盖依赖问题。

后续需要为每个架构单独准备和校验 Python、Argos、CTranslate2 等依赖，补齐资产清单、启动入口、权限、原文保护、离线调用、重复安装与回滚。必须检查修改应用后的签名、完整性和启动行为；禁止关闭 Gatekeeper 或删除平台拒绝来制造通过结果。执行顺序见 [跨平台方法](CROSS-PLATFORM.md)。

如果需要干净且可恢复的 macOS 环境，可在实际 Apple 芯片 Mac 上按 Apple 的 Virtualization framework 示例创建 macOS 虚拟机。它提供该架构的隔离测试环境，不代表 Intel Mac 或 Windows x64。[Apple 官方 macOS 虚拟机示例](https://developer.apple.com/documentation/virtualization/running-macos-in-a-virtual-machine-on-apple-silicon)

## 4. 每轮必须保留的记录

- 系统版本与构建号、CPU 架构、实体机或虚拟机、普通用户或管理员、已有开发工具和旧配置。
- Cursor 完整版本、commit、Code OSS 版本，候选提交、下载来源、包名、SHA-256 和 VSIX 引擎兼容性。
- 操作步骤、期望结果、实际结果、日期、脱敏截图、失败项与仍未打开的页面状态。
- 首次安装、重启、重复安装和回滚分别留证；自动检查结果与真实界面结论分开填写。

Windows 历史控制条还须记录本次安装预设与已保存的本机布局是否一致。默认 `compact` / `top-right` 是没有匹配偏好时的预设，不是已应用到系统的设置；同一预设下可优先沿用此前保存的展开状态、四角位置与拖动坐标。测试首次默认状态前应记录已有偏好；需要回到当前安装预设时，使用面板内“恢复预设位置”，它会同时恢复预设展开状态并清除拖动坐标，不需要删除本机缓存。详细规则见 [手动与 Agent 配置](AGENT-SETUP.zh-CN.md)。

测试材料使用人工构造的公开样例。令牌、连接文件内容、私人词典、聊天数据库和缓存原文不进入公共证据。保留备份与旧产物，不自动批量清理；需要批量删除时交由用户手动处理。
