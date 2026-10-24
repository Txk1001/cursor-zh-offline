# 验收状态与证据边界

核对日期：2026-10-24。源码 1.1.2 是候选版；公开 Release 最新为 1.1.1 预览。自动测试、旧版实机记录与当前实机验收提供不同证据，不能相互替代。本页是当前状态入口，历史报告保留原日期和结论。

| 范围 | 已有证据与当前限制 |
| --- | --- |
| 1.1.1 远端 CI | [CI 40084459155](https://github.com/Txk1001/cursor-zh-offline/actions/runs/40084459155) 的 Ubuntu/Windows 成功，Windows 含真实离线模型；对应实现提交 9be4e59 |
| 1.1.1 发布 | [预览 Release](https://github.com/Txk1001/cursor-zh-offline/releases/tag/v1.1.1) 与 [发布流程](https://github.com/Txk1001/cursor-zh-offline/actions/runs/40084808114) 已完成；不能推出本轮实机通过 |
| 文档门禁 | [PR #9](https://github.com/Txk1001/cursor-zh-offline/pull/9) 已合并；[格式反例](https://github.com/Txk1001/cursor-zh-offline/actions/runs/40098300994) 阻断，[修正后两系统](https://github.com/Txk1001/cursor-zh-offline/actions/runs/40098502872) 成功 |
| main 流程 | main-pr-and-ci 已启用，要求 PR 与两项 CI，禁止强推/删除；单维护者人工确认，不虚设第二位审批人 |
| 1.1.2 安装恢复 | 新增锁完整发布、损坏旧锁诊断、死 PID/复用 PID、文件系统失败和双进程测试；本机隔离测试通过，不能代替实机安装 |
| 1.1.2 技术保护 | 8 项独立 Python 规则本机通过并接入 CI；真实模型、原文切换与 UI 须分别记录 |
| 1.1.2 汉化 | 维护扩展命令与设置已使用标准中文清单资源；历史日期/大写时间单位已补齐；需当前 Cursor 窗口复核 |
| 1.1.2 公共构建 | 默认 public 配置，不读取本机元数据或私人词典；结构检查通过；构建和归档记录来源、参数与哈希 |
| 1.1.2 远端 CI | [CI 40103796905](https://github.com/Txk1001/cursor-zh-offline/actions/runs/40103796905) 对 e7dbe8d 的 Windows 与 Linux 检查成功；[候选流程 40103901333](https://github.com/Txk1001/cursor-zh-offline/actions/runs/40103901333) 成功。后续提交以 [PR #11 检查](https://github.com/Txk1001/cursor-zh-offline/pull/11/checks) 为准 |
| 当前电脑 | Cursor 3.27.12 / Code OSS 1.128.0，commit df132ffba90dfc15a12e6b8f020ba4e5d026c4b0；开发过程快照曾安装并还原；最终候选重装与 UI 核对因用户办公暂停，不能计为最终实机通过 |
| 独立 Windows | 用户本轮暂无法提供，明确待验收；无系统 Node/Python 的真实用户环境未通过 |
| macOS/Linux/ARM64 | 完整补丁不开放，不从语言资源覆盖推断支持 |
| 安全上报 | 私密漏洞报告已启用并核实；npm 已知告警与依赖处置见 [依赖审查](DEPENDENCY-REVIEW.md) |

## 发布硬门槛

安装、重复安装、中断恢复、原文完整性、技术内容保护和核心界面必须通过。复杂正文可以明确标注未译并保留原文；任意正文达到人工精校水平不是自动模型的保证。实际环境按 [Windows 验收表](WINDOWS-ACCEPTANCE.md) 留证，包含版本、commit、架构、候选来源、SHA-256、操作、期望、实际、脱敏截图及失败项。

以下不能作为通过依据：文件存在、命令退出成功、配置里允许该版本、模拟 DOM 测试、旧版本截图、只有 CI 配置而没有远端运行。1.0.8 的 [历史修复记录](REPAIR-1.0.8.md) 仅限当时环境。未完成独立环境验收前不标记“可靠公开预览验收通过”。

## 原文与性能核对

使用公开人工样例，不上传私人聊天。对中文/英文混排、长段落、流式变化、节点复用、暂停/重连、查看原文/返回中文逐项核对。代码、命令、变量、路径、链接及快捷键应保持原样。记录真实窗口耗时；模拟长会话的无关变动不扫描大祖先，只证明对应测试条件。

## 候选与公开发布

新工作流只产出候选文件，不自动公开 Release。候选源码提交、构建记录、文件清单和哈希必须一致，实机记录完成后由所有者人工确认公开，详见 [维护流程](publishing.zh-CN.md)。保持预览标识，不承诺全版本、全系统。
