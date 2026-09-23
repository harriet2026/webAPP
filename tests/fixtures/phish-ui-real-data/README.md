# 邮件研判真实数据预览

Review 状态：未评审。此目录是独立开发数据集，既有 mock dispatcher 和数据保持不变。

原始素材来自 `/mnt/storage/osgateway_services/dev0907-deploy-20260909/deploy/tmp/phish-ui-real-data-20260909/`。`raw/` 保留原始 JSON；`raw/manifest.json` 是原素材的来源、散列与覆盖范围记录，其中 scope 描述的是素材采集阶段。

三个场景各自独立：

- 历史邮件 7：服务端置信度 0.88、租户风险等级 medium、策略 quarantine；报告超过预算。
- 历史邮件 8：服务端置信度 0.85、租户风险等级 medium、策略 quarantine；报告引用校验失败。
- 邮件 8 的另一次 CLI 复跑：11 条判断依据（6 条支持威胁、5 条限制确定性）、16 个来源、8 条缺口，另有 7 个省略来源和 2 个省略缺口。它没有完整服务端详情，不能拼接到历史邮件 8 上冒充成功结果。

`zh.ts` 仅翻译摘要、因素的观察/解释/限制、对象名称和缺口说明。保留原始 ID、引用关系、顺序、分值、枚举、处置状态、字节信息和散列；证据正文保持原始内容。中文文本是展示翻译，不重新分析模型结论，也不是可用于原文散列校验的序列化报告。原文校验必须使用 `raw/`。

用户已授权为 CLI 场景按接口格式补充定级和处置。`mock-detail.ts` 单独构造 `DetectionLogDetail`：沿用真实 CLI 的 0.88 分值，Mock 阈值为 40/70/90，对应中危、隔离策略、收件人已隔离。主题带有 `【Mock 定级/处置】`，业务标识另设，配置快照注明来源。这是“真实模型报告 + 模拟业务结果”，不修改或冒充两封历史服务端详情。

同一次 CLI 结果中的 1 个 `url_findings` 和 9 条 `steps` 也映射到抽屉原有区域：URL 数字风险按 protobuf 枚举转换到 `agent.risk_level`，原始 verdict 保持不变；日志消息翻译为中文，时间转换为 ISO 字符串，原始结构化数据保留在每步的 `data.cli_data` 中。链接检测、收件人处置、配置快照与运行日志均保留在判断依据下方。

列表的调查轮次补为 2；对应同次 CLI 运行 `reproduce-mail8-01/run-02/summary.json` 中的 `usage.model_call_count=2`，不将 9 条工具日志计作调查轮次。

邮件与 URL 的前端展示共用 `verdict-display.tsx` 和 `phishingDetection.verdict` 翻译字典：`phishing_suspected` 为“疑似钓鱼”，`suspicious` 为“可疑”，`safe` 为“安全”，`needs_review` 为“需要复核”。“安全”注明仅限本次检查范围。

历史 `phishing` 展示为“疑似钓鱼”，`benign/normal` 展示为“安全”，均标注历史兼容转换并可查看原值；`malicious` 显示“历史结果未映射”，`observed` 显示“缺少有效判定”，空值显示“未返回判断”，其他未知值显示“结果无法识别”。未映射、已观察与未知结果可以展开原值。匹配使用标准值和明确列出的历史值，不将任意大小写变体猜成有效判断。

该兼容处理仅用于前端展示，不修改 API 数据、租户风险分级或策略处置，也不根据 risk 推断 verdict 或威胁类型。Prompt、后端有效值校验和汇总统计尚未在本次前端修改中迁移到四值契约。

完整 webapp 使用 `dispatch.ts` 覆盖三个钓鱼检测读取接口（统计、列表、详情）。只有开发模式、显式预览环境开关、Mock 模式和演示会话同时开启才生效；其他接口和原有 mock 场景保持原行为。固定历史样本不按当前日期过滤，避免隔天无法预览；关键词、风险/处置/模式/状态筛选和分页生效。

在 `webapp/` 启动完整 webapp：

```sh
OSGATEWAY_PRODUCT_FORM_SWITCHER=1 NEXT_PUBLIC_PHISH_ASSESSMENT_PREVIEW=1 WEBAPP_DEV_ORIGINS=10.126.126.9,localhost,127.0.0.1 ./node_modules/.bin/next dev --hostname 10.126.126.9 --port 39092
```

访问 `http://10.126.126.9:39092/zh/login`，点击页面底部“进入演示环境”，然后打开 `/zh/agent-center/overview?agent=phishing`。第一行是 CLI 真实报告加 Mock 定级/处置；点击“详情”查看实际产品抽屉，其后两行是历史邮件 8、7。Mock 处置使用接口的 `recipient_dispositions.status=quarantined` 与 `display_statuses.status=quarantine_pending`，现有收件人组件显示为“隔离中”。

以下轻量组件预览仍可用于单独比较三个场景和深浅主题；实际验收以完整 webapp 为准。

在 `webapp/` 运行（本次用户已授权在 `10.126.126.9` 提供预览）：

```sh
./node_modules/.bin/vite --config tests/fixtures/phish-ui-real-data/preview.config.mts --host 10.126.126.9 --port 39091 --strictPort
```

该目录包含测试环境真实邮件内容，仅供内部开发验收。`raw/` 始终保留原始素材；新增模拟数据只存在于单独的 Mock 文件。
