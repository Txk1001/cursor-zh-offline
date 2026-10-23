# 安装、维护与回滚

版本与适配范围见 [项目首页](README.md)。以下步骤面向 Windows x64 已适配版本；先备份重要工作并完全退出 Cursor。

## 完整离线包

解压 `Windows-x64-offline.zip` 后双击 `安装离线汉化.cmd`。只需界面语言包与界面补丁时使用 `安装汉化.cmd`。首次离线配对时选择安装器显示的本机 `connection.json`；不要上传该文件或截图其中内容。

自定义目录：

```powershell
node scripts/portable-install.mjs --dir="D:\Apps\Cursor" --with-offline
```

只预览改动：

```powershell
node scripts/translate-install.mjs --dir="D:\Apps\Cursor" --preview
```

仅安装 VSIX 不能覆盖 Cursor 的全部硬编码界面，也不包含模型。源码 ZIP 需要先按 [构建说明](README.md#从源码构建) 生成 VSIX 并准备资产。不要从源码包直接运行安装入口。

## 译文和原文

“查看原文”切换历史标题与正文的显示；不更改原始聊天数据库。“离线翻译 · 已启用”可暂停新的自动翻译。自动译文可能有误，专业术语、变量、命令和代码使用前须核对原文。

人工修订可参考 `templates/history-translations.example.json`，通过“导入译文”导入。新的导入会替换显示词典；需要先合并时运行：

```powershell
node scripts/history-catalog.mjs --import="我的译文.json"
```

合并后的个人词典在状态目录中，已有词典先备份；再在界面导入合并文件。不要提交个人会话或私人词典到仓库。

## 状态与备份

默认状态目录为 `~/.cursor/cursor-language-pack`，实际位置以安装器输出为准：

| 路径 | 内容 |
| --- | --- |
| `backup/<Cursor commit>/` | 修改前的 Cursor 资源 |
| `rewrite.json` | 文件哈希和恢复记录 |
| `offline/connection.json` | 仅本机使用的连接令牌 |
| `offline/translations.sqlite3` | 原文与译文缓存，属于个人数据 |
| `offline/terms.user.json` | 个人术语覆盖 |
| `history-translations.zh-cn.json` | 个人历史译文 |

未知资源、版本不匹配、文件占用或权限不足时，先解决报错原因，不要删除备份或强行修改哈希记录。安装失败记录应保留用于恢复。

## 回滚和停用

完全退出 Cursor 后执行：

```powershell
node scripts/translate-install.mjs --undo --dir="D:\Apps\Cursor"
```

回滚只恢复相同安装和 commit 下匹配的资源。失败会保留未完成记录与备份；请保存错误信息，确认更新状态，勿跨版本复制备份。已成功回滚的原始备份也保留。

停用本机翻译服务：

```powershell
node scripts/offline-service.mjs --stop
```

如需恢复英文，通过 Cursor 的显示语言设置选择英文，并卸载标识为 `cursor-zh-offline-local.cursor-language-pack` 的扩展。回滚和卸载默认保留个人词典与缓存；用户可在确认无需保留后自行处理这些个人数据。

## 更新

Cursor 更新后，先运行 `npm run check-upgrade` 检测版本；未适配版本不能强制安装。汉化包更新时重新运行安装入口，旧版本备份按 commit 保留。新版本适配流程见 [维护与发布](docs/publishing.zh-CN.md)。

离线模型与运行时更新需同时核对 `offline/assets.json` 的官方地址、SHA-256 和许可。公共术语更新后运行 `node scripts/setup-offline.mjs` 更新引擎；缺少资产时可加 `--download`，翻译阶段仍使用本机模型。

## 问题反馈

提供 Cursor 完整版本、系统架构、汉化包版本、操作步骤、错误阶段和脱敏截图。不要上传连接令牌、聊天数据库、个人词典、程序原始资源或完整用户目录。当前本地交付可将脱敏问题交给维护者；公开仓库建立后使用本仓库的问题模板。

