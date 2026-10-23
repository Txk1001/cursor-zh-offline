# 离线翻译组件与许可

- Argos Translate 1.11.0：https://github.com/argosopentech/argos-translate ，MIT，Copyright (c) 2020 Argos Open Technologies, LLC。
- 英译中模型 1.9：来自 Argos 官方模型索引，https://argos-net.com/v1/translate-en_zh-1_9.argosmodel 。原始 OPUS-MT 模型作者为 Jörg Tiedemann 和 Santhosh Thottingal，依据模型包 README，采用 CC BY 4.0：https://creativecommons.org/licenses/by/4.0/ 。模型本体未修改。所用原始模型论文为 “OPUS-MT — Building open translation services for the World”，EAMT 2020，Lisbon, Portugal。
- CTranslate2：OpenNMT 项目，https://github.com/OpenNMT/CTranslate2 ，MIT。
- SentencePiece 0.2.1：Google，https://github.com/google/sentencepiece ，Apache-2.0，Copyright 2016 Google Inc.
- CPython Windows 嵌入式发行包：Python Software Foundation，https://www.python.org/ ，许可随原始运行时保留。

本集成使用 Argos 的模型包读取与分词器模块，通过 CTranslate2 在 CPU 上执行推理；不加载完整的 Stanza、PyTorch、在线 API 或模型自动下载管线。使用 `argostranslate --no-deps` 是这套精简集成的明确选择，不能用它替代需要完整 Argos 翻译管线的环境。

下载资产的来源、版本与 SHA-256 记录在 assets.json。CTranslate2 与 SentencePiece 的完整许可在 licenses/，来源、版本和正文校验值在 licenses/manifest.json；补充了原始 wheel 未附的独立许可文件，未改动 wheel。其他依赖保留原始包附带的许可材料，模型保留 README 与作者署名。安装和模型下载可联网；翻译推理使用本机模型，并对 Python connect/connect_ex 的非回环连接执行拒绝。

自动翻译是机器译文，不能保证达到人工精校水平。已校对的界面词典和用户导入的历史译文优先，自动译文按段缓存，原文随时可查看。
