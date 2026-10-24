# Cursor 简体中文离线集成 · 1.1.1

这是 cursor-zh-offline 开源项目的集成语言包，复用 polang233/cursor-language-pack、Microsoft 中文资源和 Argos Translate。完整安装器适用于 Windows x64 / Cursor 3.27.6、3.27.12；默认启用简体，未知版本会停止写入并提示适配。该扩展使用独立标识，未发布到扩展市场。

VSIX 提供标准资源和离线服务管理命令。硬编码界面与历史翻译覆盖层需使用完整维护包手动安装；仅安装此 VSIX 不等于完成所有界面汉化。

安装器先校验备份，通过事务记录恢复中断的写入。历史显示支持原文切换、混排和长段落分段；离线译文保护代码、变量、路径和术语，仍需结合原文核对复杂语义。原始会话数据库不被汉化程序改写。完整包提供安装、恢复、维护、贡献和兼容性说明。

来源：polang233/cursor-language-pack、microsoft/vscode-loc、ggbdpq/cursor-loc、argosopentech/argos-translate、OpenNMT/CTranslate2。许可及补充材料随包提供。
