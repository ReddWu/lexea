# Echowords 一个月变现方案(含市场调研)

> 2026-07-07 · 目标:30 天内验证"有人愿意为 Echowords 付钱",而不是做完美产品。

---

## 一、市场调研结论

### 竞品格局

| 产品 | 做什么 | 定价 | 与 Echowords 的关系 |
|---|---|---|---|
| [Trancy](https://www.trancy.org/pricing) | 双语字幕+划词翻译+生词本+SRS 闪卡+AI 例句+Anki 同步,30 万+ 用户,Chrome 4.7 星 | 免费档 + Premium $3.49–5.99/月($27.99/年) | 采集+SRS 与你完全重叠;无开放 API |
| [Language Reactor](https://www.languagereactor.com/pro-mode) | Netflix/YouTube 学习,词库+CSV 导出 | Pro $5/月($28/年) | 产品停滞(roadmap 2022 年后未更新),用户在流失 |
| Relingo / Burning Vocabulary | 网页生词高亮+SRS | 免费+订阅 | 采集+复习赛道拥挤的又一证明 |
| [Langua](https://languatalk.com/try-langua) | AI 口语教练,会把你存的词织进它自己的 AI 对话和故事 | 订阅制 | **最接近你的差异点**,但只在它自己的 App 内 |
| [墨墨背单词](https://www.maimemo.com/shop) | 国内 SRS 背单词,卖"单词上限"(600 免费,8–163 元加量) | 买断式加量 | 证明中文用户愿为"记住单词"付钱,且接受非订阅模式 |

**结论 1:采集 + SRS 是红海,零溢价。** Trancy 一家就把这层做完了。Echowords 唯一值钱的是闭环最后一步:**你的弱词流进你日常用的 AI,越记不牢出现越多**。目前没有跨平台产品做这层(Langua 只在自家 App 内做)。

**结论 2:不要做"依托 Trancy"的产品。** 理由:
- Trancy 无开放 API/插件生态。你只是监听浏览器划词事件,它改交互你就失配,且拿不到任何官方分发;
- 它本身是竞品(生词本+SRS 都有),依附它 = 给竞品做卫星;
- 它的用户已在它体系内复习,你能撬动的是"对 Trancy 复习不满意 / 想在 AI 里用词"的那部分人。

**正确姿势:兼容不依附。** 定位语从"配合 Trancy"改成"**配合你正在用的任何阅读/翻译工具**——Trancy、沉浸式翻译、Relingo 都行,词库归你,AI 里见"。Trancy/沉浸式翻译用户社区只是获客渠道,不是产品地基。

**结论 3:不做 GPTs 是对的,MCP 是现成的替代。** 截至 2026 年 4 月,[ChatGPT(Plus 及以上)、Claude、Perplexity、Grok、Le Chat 均支持 MCP 连接器](https://truthifi.com/education/mcp-connection-guide)。一个 Echowords MCP server 同时服务所有主流 AI:
- 对冲平台风险(ChatGPT 记忆功能再强,也不会跨到 Claude/Grok);
- "数据归你、词库跟着你去任何 AI"成为真护城河;
- 免费兜底方案保留"一键复制弱词 → 粘贴进 Custom Instructions"。

### 定价锚点

同类订阅集中在 **$3–6/月、$28/年**;墨墨证明买断/加量制在中文市场可行。Echowords 服务端成本(托管同步 + MCP + AI 释义)与订阅天然对齐。

---

## 二、产品与付费设计

**一句话定位:** 你读到的生词,出现在你和 AI 的每一次对话里。(The words you save show up in your AI chats.)

| | Free | Pro($4/月 或 $30/年,早鸟买断 $29) |
|---|---|---|
| 划词采集 + 本地 SRS 复习 + 导出 | ✅ 无限 | ✅ |
| 云同步 + 跨设备复习站 | 200 词 | 无限 |
| 手动复制弱词 → 贴进 AI | ✅ | ✅ |
| **托管 MCP server(接 ChatGPT/Claude/Perplexity/Grok)** | ❌ | ✅ |
| AI 自动释义/例句、FSRS | ❌ | ✅ |

原则:**付费功能全在服务端**(同步、MCP、AI 调用),开源扩展照常 MIT——open core,抄不走。支付用 Lemon Squeezy / Paddle(merchant of record,个人开发者免税务麻烦)。

---

## 三、四周计划

### 第 1 周:验证需求(不写产品代码)
- Landing page + waitlist(一晚上的事):主打"你的生词,在你的 AI 对话里复活",放 30 秒演示 GIF,收邮箱 + 一个问题"你现在用什么存生词?"
- 发帖:即刻、少数派、V2EX、小红书(英语学习话题)、r/languagelearning、r/EnglishLearning、Hacker News (Show HN,挂 GitHub 链接)
- 约 8–10 个 waitlist 用户 15 分钟语音,问三件事:现在怎么复习?愿不愿为"AI 用回你的词"付 $4/月?用哪个 AI?
- **周末决策门:waitlist < 100 且访谈无付费意愿 → 停下重新定位,不进入第 2 周开发**

### 第 2 周:多租户 + 付费基建
- migrations 里已有 UPGRADE PATH:补 user_id + auth + RLS,做成注册即用的托管后端(告别用户自建 InsForge)
- 扩展登录态 + 免费档 200 词限额
- 接 Lemon Squeezy:订阅 + 早鸟买断两个 SKU

### 第 3 周:MCP server(核心差异点)
- 把 functions/(weak-words、add-word)改造成 MCP server:工具 = `get_weak_words` / `add_word` / `mark_used`,openclaw/ 的脚本逻辑可直接复用
- 写四份接入指引:ChatGPT / Claude / Perplexity / Grok,各配一张 30 秒 GIF
- Chrome Web Store 正式上架(名称、截图、宣传图)
- 免费兜底:popup"复制弱词"文案针对 Custom Instructions 优化

### 第 4 周:发布 + 收钱
- Product Hunt 发布(周二/周三);同步二发第 1 周的所有渠道:"上次你们说想要,现在能用了"
- 早鸟 lifetime $29 限 100 名(制造紧迫感,快速验证付费)
- 每天看数据,周末复盘

### 30 天验收指标

| 指标 | 及格线 |
|---|---|
| Waitlist | ≥ 200 |
| 安装量 | ≥ 300 |
| 激活(首周存 ≥10 词) | ≥ 30% |
| 连接过 MCP/复制过弱词 | ≥ 15%(这是差异点是否成立的直接信号) |
| 付费用户 | ≥ 10 人(约 $300) |

付费 ≥10 → 继续做订阅增长;激活高但没人付 → 降价或转买断;激活就低 → 问题在留存不在定价,回去改产品。

---

## 四、风险

- **AI 平台记忆功能收编**:ChatGPT 记忆已很强。对策:跨 AI(MCP)+ 数据归属用户 + "遗忘曲线加权注入"是记忆功能不会做的专业逻辑。
- **Langua 类产品反向做扩展**:它有 AI 对话织词但没有浏览器采集。窗口期存在但不会太久,所以是"一个月"而不是"一个季度"。
- **单人维护面太宽**:本月内冻结 web 复习站新功能,只做 auth;扩展只加登录和限额,不加新交互。

---

## 调研来源

- [Trancy 定价](https://www.trancy.org/pricing) · [Trancy 功能与用户数(AIbase)](https://top.aibase.com/tool/trancy) · [Trancy vs Language Reactor](https://www.trancy.org/blog/language-reactor-pro-vs-trancy-2026-which-is-better-for-language-learners-31f9d225200580a48aa8c5f28602a2b3)
- [Language Reactor 评测(TubeVocab)](https://www.tubevocab.com/blog/en/language-reactor-review) · [Language Reactor Pro](https://www.languagereactor.com/pro-mode)
- [Langua](https://languatalk.com/try-langua) · [2026 AI 语言学习 App 综述](https://languatalk.com/blog/whats-the-best-ai-for-language-learning/)
- [Relingo](https://chromewebstore.google.com/detail/relingo-master-vocabulary/dpphkcfmnbkdpmgneljgdhfnccnhmfig) · [Burning Vocabulary 定价](https://burningvocabulary.com/price)
- [墨墨背单词商业模式分析(人人都是产品经理)](https://www.woshipm.com/evaluating/5683354.html) · [墨墨商店](https://www.maimemo.com/shop)
- [各家 AI 的 MCP 支持情况](https://truthifi.com/education/mcp-connection-guide) · [ChatGPT Memory FAQ](https://help.openai.com/en/articles/8590148-memory-faq)
