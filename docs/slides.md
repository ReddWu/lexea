# Mia — 3-Slide Deck + 2-min Video Script (Beta Hack Demo Format)

> 粘贴用文案全英文;每页附布局建议。视频分镜在最后。

---

## Slide 1: Team Introduction

**标题:** Redd Wu — solo builder

**正文(三行式):**

> **Redd Wu** · Indie hacker & solo founder
> Ships AI products end-to-end — recent: DarwinSaaS (agent-native SaaS experiments)
>
> **Learner Card 5 (wildcard) — I brought my own learner: me.** I'm a Chinese native speaker who reads English tech articles every day and keeps forgetting the same words. Every word in this demo — all 52 — came from my own reading, and weeks of past sessions are seeded in EverOS per the Card 5 rule.

**布局建议:** 左侧你的头像/LinkedIn 截图,右侧三行文案。最后一句加粗——"I am the user" 是评委记住你的钩子。

---

## Slide 2: Product Overview

**标题(一句话价值主张,选一):**

> **Mia — the words you save show up in every conversation.**

备选:
- *Every conversation is a review session.*
- *An AI companion who happens to know exactly which words you're about to forget.*

**Pain(两行):**

> Vocab apps end at the flashcard. You memorize words in one app, then never meet them again in real life — so they fade. Capture + spaced repetition is a red ocean (Anki, Duolingo, Trancy); **the missing piece is where words come back to you.**

**Solution(三个箭头):**

> 🖍 **Save while you read** — browser extension captures any word *with the sentence you found it in* (phonetic + 中文 in 0ms, from bundled dictionaries)
>
> 💬 **Chat with Mia** — an adorable AI companion who speaks second-grade English *except* for your saved words, which she weaves in — highlighted green, clickable, invisibly graded on your forgetting curve (SM-2)
>
> 🧠 **Learning compounds** — EverOS long-term memory: session 5's Mia knows your white whale, your interests, your streak — session 1's Mia didn't

**底部板块:Sponsor tools 在产品中的角色(必写,占页面下 1/3,双栏)**

> ### Powered by
>
> **🧈 Butterbase — Mia's entire backend & brain.**
> - **Database**: the `words` table IS the product — 52 words, full SM-2 state, every context sentence
> - **Serverless functions**: all spaced-repetition writes run as SQL in a Butterbase fn (`mia-db`)
> - **AI Gateway**: *every single LLM token* Mia generates — chat, grading, definitions, memory distillation — flows through Butterbase's gateway (Claude Opus 4.7 + GPT-4o-mini)
> - **Edge SSR hosting**: the app you're seeing lives at **mia.butterbase.dev**, deployed via Butterbase's Cloudflare pipeline
> - Built MCP-first in one day; filed 3 platform bug reports along the way
>
> **🧠 EverOS (EverMind) — why Mia gets better every session.**
> - Every conversation streams into EverOS; it distills **episodes** ("redd forgets 'discourse' despite saving it") and an **evidence-cited learner profile** ("Persistent Learner — achieved instant recall in [ep5]")
> - That memory is injected into every session opening — **it's the difference between session 1's Mia and session 5's Mia**, which is exactly this hackathon's question
> - Fully visible to the user at `/memory` ("What Mia remembers")
> - Found & reported an undocumented activation issue (settings init) to the EverMind team

---

## Slide 3: Video Demo(嵌入视频)

页面上只放:视频 + 一行字幕:

> **2 minutes. Real account, real words, no mocks.** → mia.butterbase.dev

---

## 🎬 2 分钟视频分镜脚本(录屏用)

**准备:** Chrome 缩放 125-150%(录屏可读性)· 关通知 · 备好一篇英文文章标签页 · /tutor 先点 New session 清场 · 建议工具:QuickTime 或 Screen Studio(自动缩放更佳)· **加字幕**(很多评委静音看)

| 时间 | 画面 | 字幕(烧进视频) |
|---|---|---|
| 0:00–0:10 | 英文文章页,划选一个生词 → 点 **★ Save to Mia** → 卡片弹出(音标瞬间出现,点「中文」) | "Save any word while reading — with its sentence. Phonetic & 中文 in 0ms (offline dictionaries)." |
| 0:10–0:20 | 切到 mia.butterbase.dev,Library 页快速滚动(52 词 + 真实原句) | "52 words, all from my real reading. Each with the sentence I met it in." |
| 0:20–0:45 | /tutor,New session(💬 Chat 模式)。Mia 流式打出开场——用记忆 callback("your white whale 'discourse'…")。你回一句日常话题 | "**Because she remembered** I failed 'discourse' 4 times across sessions, **this time she** opens by hunting it. Session 1's Mia couldn't do this." |
| 0:45–1:15 | **高潮**:你的回复里自然用出一个词 → 右侧栏该词闪绿、due 日期跳变;Mia 回复中**绿色单词**流式出现 → 点击一个绿词 → 音标+中文+🔊 弹卡 | "I just used my word — invisibly graded, schedule updated. Her words: 2nd-grade English EXCEPT my saved words — green, clickable. **Assessment disappears into conversation.**" |
| 1:15–1:30 | 切 📚 Focus 模式 → "quiz me" → 答对,Mia 报连胜;问 "what is X?" → 侧栏实时多出新词 | "Focus mode: quizzes, streaks. Ask about any word — saved automatically." |
| 1:30–1:40 | **Self-evolving 时刻**:打 "honestly I'm bored of this" → Mia 立刻收起游戏、换策略(变短变暖/换话题) | "Mid-demo I change: 'I'm bored.' **She adapts from what she knows about me** — drops the games, switches approach. No reset, no prompt." |
| 1:40–1:52 | End session → Mia 两句总结+下次预告 → 切 /memory 页,滚动 episodes + 画像(镜头停在 "Persistent Learner… evidence: [ep5]") | "Every session distills into **EverOS** memory — episodes + an evidence-cited learner profile. **Session 5's Mia ≠ session 1's Mia.**" |
| 1:52–2:00 | 收尾定格:Library 页 + 一行大字 | "Learning compounds. — Every byte on **Butterbase** (DB · fns · AI gateway · hosting) · every memory in **EverOS** · mia.butterbase.dev" |

**录制小抄:**
- 一镜到底难就分段录再拼(QuickTime → iMovie/CapCut 拼接加字幕)
- Mia 首轮开场 2-3 秒首字——录制时正常等,流式打字本身就是画面
- 高潮段(0:45)提前想好要用的词:侧栏顶部随便挑一个(如 deprivation),句子提前打好草稿
- "what is X?" 段选一个她刚用的词,保证侧栏能看到新增行
- 导出 1080p,视频拖进 Google Slides(插入 → 视频 → 上传)

**三个 EverMind bounty 与视频段落对照(评委勾选无摩擦):**
- Best Cross-Session Moment → 0:20 段("because she remembered X, this time she did Y" 原句式)
- Best Self-Evolving Memory → 1:30 段(mid-demo 说 bored,Mia 现场适应)
- Best Memory Reveal → 1:40 段(/memory 页证据链画像)

**3 分钟口播分配:** Slide 1 讲 30s(自我介绍+I am the user)→ Slide 2 讲 30s(痛点+方案三箭头)→ 视频 2 分钟(可静场让视频说话,或跟着字幕补充)。
