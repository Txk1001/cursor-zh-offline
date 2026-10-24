# cursor-zh-offline · Cursor 简体中文离线集成

复用社区语言包，为 Cursor 提供简体中文界面，并用本机离线模型显示历史会话的中文译文。支持随时查看原文；不改写聊天数据库。

**当前源码为 1.1.2 候选版；最近公开版本为 [1.1.1 预览版](https://github.com/Txk1001/cursor-zh-offline/releases/tag/v1.1.1)。**开源仓库：[Txk1001/cursor-zh-offline](https://github.com/Txk1001/cursor-zh-offline)。候选包不等于已发布产品，实际验证状态统一见[验收状态](docs/VALIDATION.md)。当前未发布扩展市场。使用独立扩展标识 `cursor-zh-offline-local.cursor-language-pack`，不继承上游发布账号或权限。默认仅构建简体中文。

## 适配范围

| 环境 | 范围与状态 |
| --- | --- |
| Windows x64 / Cursor 3.27.6、3.27.12 / Code OSS 1.128.0 | 当前完整补丁准入范围；此前版本有本机安装和界面记录，1.1.1 的测试结果需结合交付验收记录查看 |
| 其他 Cursor 版本 | 安装器拒绝完整补丁，需先完成版本适配 |
| macOS、Linux、Windows ARM64 | 完整补丁未开放；语言包源码可供移植，不构成已支持承诺 |
| 远端 GitHub Actions | 1.1.1 与文档门禁已有成功记录；1.1.2 须按本次提交重新检查 |
| 独立 Windows 环境 | 尚未提供，保留为公开预览验收阻断项 |

界面译文、正文自动翻译和第三方内容的覆盖范围不同。图片中的文字、未加载的会话、第三方扩展或网页不保证覆盖；模型自动译文仍可能出错，界面会标注“未校对”。技术内容与原文可随时核对。详见 [验收清单](docs/VALIDATION.md)。

## 选择下载内容

| 文件 | 用途 |
| --- | --- |
| `cursor-zh-offline-1.1.1-Windows-x64-offline.zip` | 普通用户安装：VSIX、安装脚本、Python、模型、锁定依赖与许可齐全 |
| `cursor-zh-offline-1.1.1-source.zip` | 开发者源码：不含构建产物、模型、运行时、下载缓存或个人状态；首次构建需要联网 |
| `cursor-language-pack-1.1.1.vsix` | 标准界面语言包与维护扩展；单独安装不包含硬编码界面补丁或离线模型 |
| `SHA256SUMS` / ZIP 旁的 `.sha256` | 发布文件校验值；ZIP 内另有逐文件 `MANIFEST.sha256` |

图标是源码所需的项目素材，包含在源码包中。此项目不分发 Cursor 原始程序资源。校验哈希可发现损坏，但不能替代可信发布者签名。

## 安装

1. 解压完整离线包，保留目录结构。
2. 完全退出 Cursor 所有窗口，等待自动更新完成。
3. 双击 `安装离线汉化.cmd`。如只需界面中文，双击 `安装汉化.cmd`。
4. 重新打开 Cursor。在历史页点击“启用离线翻译”，选择安装器提示的 `~/.cursor/cursor-language-pack/offline/connection.json` 完成首次本机配对。

完整包不需要系统 Python、显卡或在线翻译账号。优先使用系统 Node.js；没有 Node 时尝试 Cursor 自带运行时。维护工具最低 Node.js 22，CI 使用 Node.js 22、Python 3.12.10；归档使用 PowerShell 7。普通用户无系统 Node/Python 的真实环境仍待独立验收。自定义安装目录或多安装时执行：

```powershell
node scripts/portable-install.mjs --dir="D:\Apps\Cursor" --with-offline
```

目录应包含 `resources/app`。安装器在修改前检查版本、运行进程、原始资源与备份；权限不足会报错。更多用法见 [安装与回滚](README-通用安装.md)。

## 历史会话与隐私

- 已加载的会话标题、正文和支持的界面状态可显示中文；原始数据库不变，通过“查看原文”切回。
- 本机推理采用 Argos Translate 模型与 CTranslate2 CPU 引擎；运行翻译不调用外部服务。首次源码安装的资产下载需要联网。
- 翻译服务仅监听 `127.0.0.1`，要求本机访问令牌。连接文件含令牌，不应共享。
- 翻译缓存保存在当前用户状态目录的 `offline/translations.sqlite3`，包含待译原文与译文，属于个人数据。
- 自动译文由模型生成，不能视为人工精校。可用 [示例词典](templates/history-translations.example.json) 导入人工修订，覆盖模型结果。
- 公共术语在 `offline/terms.default.json`，个人覆盖在状态目录的 `terms.user.json`。代码块、变量、路径等受保护；仍应核对原文后使用译文中的技术指令。

默认状态目录为 `~/.cursor/cursor-language-pack`；便携或派生安装以安装器提示为准。连接文件、个人词典、缓存、安装备份均不进入公共源码或安装包。

## 更新与回滚

Cursor 更新会覆盖本地补丁。先检测新版本、检查资源差异、补齐译文并完成验收，才能加入安装准入列表；不能只修改版本号绕过检查。

退出 Cursor 后恢复当前版本的原始资源：

```powershell
node scripts/translate-install.mjs --undo --dir="D:\Apps\Cursor"
```

备份位于状态目录的 `backup/<Cursor commit>/`，改写记录为 `rewrite.json`。回滚按安装位置、commit 与哈希核对；失败时保留恢复信息，不能用其他版本备份覆盖。回滚保留个人词典和缓存。完整停用及故障处理见 [安装与回滚](README-通用安装.md)。

## 从源码构建

```powershell
npm ci
npm test
npm run test:protection
npm run lint:md
npm run sync -- --strategy=api
npm run verify
npm run package -- --skip-build
```

上游资源按 `config.json` 的 commit 固定，`metadata/community-sources.json` 是必须提交的公共来源记录。其余本机提取元数据与下载缓存不提交。默认构建配置为 `public`，不会读取本机元数据；只有显式 `npm run build -- --profile=local` 才执行本机过滤和诊断，不可将该产物作为公共发行包。`npm run coverage` 统计语言资源键，不是代码执行覆盖率。

```powershell
# 纯源码包，不要求已构建 VSIX
pwsh -File scripts/build-public-archive.ps1 -SourceOnly -OutputPath "release/cursor-zh-offline-1.1.1-source.zip"

# 在隔离状态目录准备、测试离线运行时，然后制作完整包
node scripts/setup-offline.mjs --download --state=".tmp-offline-validation"
npm run test:offline -- --state=".tmp-offline-validation"
pwsh -File scripts/build-public-archive.ps1 -WithOffline -OutputPath "release/cursor-zh-offline-1.1.1-Windows-x64-offline.zip"
```

构建与测试不要求上传 GitHub；源码包可解压为独立仓库。详细说明见 [贡献指南](CONTRIBUTING.md)、[维护与发布](docs/publishing.zh-CN.md)、[架构](docs/architecture.zh-CN.md)、[术语表](docs/TERMINOLOGY-zh-CN.md)、[安全与隐私](SECURITY.md)、[变更记录](CHANGELOG.md)。

## 来源与许可

| 项目 | 复用内容 | 许可 |
| --- | --- | --- |
| [polang233/cursor-language-pack](https://github.com/polang233/cursor-language-pack) | 工程与语言包构建、安装基础 | MIT |
| [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc) | 编辑器与内置扩展中文资源 | MIT |
| [ggbdpq/cursor-loc](https://github.com/ggbdpq/cursor-loc) | 部分术语、排除规则和增量调度参考 | MIT |
| [argosopentech/argos-translate](https://github.com/argosopentech/argos-translate) | 模型包与分词接口 | MIT |
| [OpenNMT/CTranslate2](https://github.com/OpenNMT/CTranslate2) | CPU 推理 | MIT |
| [google/sentencepiece](https://github.com/google/sentencepiece) | 分词运行时 | Apache-2.0 |
| Argos en→zh 1.9 / OPUS-MT | 未修改的英译中模型 | CC BY 4.0 |

保留上游版权，项目改动遵循 [MIT](LICENSE)。模型、第三方软件遵循各自许可；来源与署名见 [NOTICE](NOTICE)、[离线依赖说明](offline/THIRD-PARTY.md) 和 [资产清单](offline/assets.json)。本项目与 Cursor 官方无隶属关系。

问题反馈请使用[本项目 Issues](https://github.com/Txk1001/cursor-zh-offline/issues)，提交前按模板移除账号、令牌、私人对话和用户路径。上游来源与许可见 NOTICE；本项目的问题由本仓库跟踪。

其他系统的适配步骤见[扩大系统覆盖范围](docs/CROSS-PLATFORM.md)。
