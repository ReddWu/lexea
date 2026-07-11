# Mia — Demo 脚本终稿(Beta Hack: Reinvented Education)

> 赛道:Autonomous Learning Agents · 全栈 Butterbase · 记忆 EverOS Cloud
> 演示地址:**https://mia.butterbase.dev**(全部真实数据、真实 LLM,无 mock)

## 开场白(15s)

> "Every conversation is a review session. **Mia knows what you're about to forget — and engineers the conversation so you meet it again.**"

> 背单词工具都死在同一个地方:flashcard 和真实语言是两个世界。Mia 把它们缝起来了——你读文章存的词,会出现在你和 AI 的每一次对话里,按你的遗忘曲线。

## Beat 1 — 划词采集(20s)

任意英文页,划一个生词 → **★ Save to Mia**
- 卡片瞬间弹出:**音标 0ms**(内置 12.6 万词 IPA 词典)+ 英文释义 + 点「中文」出翻译(ECDICT 5.7 万词,全本地)
- 台词:"每个词连着它的原句和出处存进词库——语境就是教材。变体自动归并,running 和 ran 是一个词。"
- ⚠️ 兜底:提前录的 GIF

## Beat 2 — Mia 开场(20s)

打开 /tutor(New session)。Mia 用记忆开场,例如:
> *"'Discourse' has escaped you four times — it's officially your white whale…"*

台词:"她不等指令。SM-2 遗忘曲线 + EverOS 长期记忆,**她自己规划这节课**。注意她提的都是我真实的学习历史。"

## Beat 3 — 绿词 + 隐形测评(45s,高潮)

正常聊一个话题(startup 相关最稳)。看三件事:
1. **流式**:字实时打出(TTFB ~2s)
2. **绿色的词**:她的每句话是设计过的教材——**二年级英语做底色,我的生词是句子里唯一的山峰**,还都可以点击(音标+中文+🔊 即弹)
3. **右侧栏闪烁**:我自然用出一个词的瞬间,它被静默打分、强度条变绿、复习日期推后——**"我刚被考了,但我毫无感觉。"**

顺手问一句 "what is [她刚用的某词]?" → 解释 + 词自动入库(侧栏多一行)。

## Beat 4 — 记忆复利(30s)

1. 点 **End session** → Mia 两句总结 + 最佳连胜 + 下节课预告(悬念)
2. 切到 **/memory** 页:"这是 Mia 的长期记忆,存在 EverOS 里——episodes 叙事 + 学习者画像,**带证据引用**:'Persistent Learner — struggled with discourse over multiple sessions but achieved instant recall… evidence: [ep5]'"
3. 台词:"**Learning compounds.** 第五节课的 Mia 和第一节课的 Mia 不是同一个老师——这正是本次 hackathon 问的问题。"

## 收尾(15s)

> "52 个词全部来自我过去两周真实阅读——我自己每天在用。Pedagogy 有据(spaced repetition + retrieval practice + i+1 可理解输入),全栈 Butterbase(DB + serverless fn + AI gateway + Edge SSR),记忆 EverOS。从校园到职场,你的词汇跟着你走。"

## Q&A 弹药

- **为什么不全用 LLM?** 词典够得着的地方用词典(0ms、免费、稳定),LLM 只出现在词典够不着的地方(语境化释义、对话、测评)。教育产品的正解和成本结构。
- **和 Duolingo 什么区别?** Duolingo 制造练习;Mia 寄生在你本来就要做的事上(阅读、和 AI 聊天)。零额外时间成本。
- **Mia 为什么不像别的 AI 一样无聊?** 有研究支撑的 persona 设计:声音用例句定义、幽默指向词不指向人、夸奖稀缺化、每轮重建 prompt 免疫 persona drift。
- **EverOS 集成体验?** 数据模型很好(episodes/profile/证据链)。发现一个坑:账户 settings 未初始化时提取管道静默休眠——已反馈。
- **Butterbase 体验?** MCP-first 很顺,一天全栈上线。3 个 bug 已在提交表单反馈(jsonb 数组、primary key DSL、云端构建)。

## 技术架构一页(评委追问)

```
Chrome 扩展(划词+原句+双词典 0ms)
   ↓ /api/sync
Butterbase:words 表 · mia-db serverless fn(SQL 写入)· AI gateway(Opus 4.7)
   ↓
Next.js Edge SSR(mia.butterbase.dev,流式 NDJSON)
Agent loop:get_weak_words / review_word / add_word(单程工具轮)
记忆:SM-2(定量)+ EverOS episodes/profile(定性,证据链)+ 会话蒸馏
```

## 演示前检查单

- [ ] 网络:手机热点备用
- [ ] chrome://extensions 扩展是最新版(绿按钮)
- [ ] mia.butterbase.dev 五个页面全 200
- [ ] 准备一篇有生词的英文文章标签页
- [ ] /tutor 点过 New session(别带着旧对话上台)
- [ ] 音量开(🔊 发音环节)
- [ ] 备用:采集 GIF、/memory 截图

## 已知坑(别现场踩)

- 首轮回复含记忆召回,首字 ~2-3s;后续轮更快——开场那一轮提前跑好再上台也行
- 说"我累了"之类的话 Mia 会收起活泼变安静(这是 feature,别在 demo 中途误触)
- quiz 打分只认词库里的词(全量 52 词)
