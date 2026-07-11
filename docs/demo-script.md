# Mia — 2 分钟 Demo 脚本(Beta Hack: Reinvented Education)

> 赛道:Autonomous Learning Agents · 后端/AI 全部 Butterbase(DB + serverless fn + AI gateway)

## 一句话开场(10s)

> "Every conversation is a review session. **Mia knows what you're about to forget — and engineers the conversation so you meet it again.**"

> 这不是又一个 flashcard app。捕捉 + 间隔重复是红海(Anki、Trancy);没人做的是最后一步:**把你的遗忘曲线接进你每天都在聊的 AI**。

## Beat 1 — 采集(20s)

- 打开任意英文文章(备好一篇),划一个生词 → **★ Save to Mia**
- 卡片弹出:音标 + plain-English 释义(按原句语境)+ 点「中文」才显示翻译(desirable difficulty)
- 台词:"每个词都带着你遇到它的原句存进词库——这就是它的教学语境。"
- ⚠️ 翻车预案:提前录好的 10 秒 GIF

## Beat 2 — Mia 开场规划(20s)

- 打开 /tutor,Mia 主动开场(真实数据):
  - "60 words due… discourse 你忘了 3 次… 上次你想聊 indie hacking——继续?"
- 台词:"它不等指令。它看着 SM-2 遗忘曲线和跨会话记忆,**自己规划这节课**。"

## Beat 3 — 隐形测评(40s,高潮)

- 自然回复一句用上弱词(如 discourse)
- **指右侧面板:** 该词强度条变绿闪烁、due 日期推后 —— "我刚刚被考了,但我毫无感觉。"
- Mia 的回复里织进另外 2-3 个弱词(deprivation / regimes / white-knuckle,全来自我存的文章)
- 台词:"assessment 消失在对话里。每一次交谈都在更新我的遗忘曲线——这是 Adaptive Evaluation,但学习者感觉只是在聊天。"

## Beat 4 — 记忆闭环(20s)

- 点 End session → Mia 两句总结:"今天巩固了 discourse,下次我会突袭 deprivation"
- 台词:"会话结束,Mia 把定性观察蒸馏进学习者画像(Butterbase 里的 learner_profile)——下一节课从这里长出来。**Learning compounds.**"

## 收尾(10s)

> "62 个词是我过去两周真实读文章存下的——这是我天天在用的产品。Pedagogy 是有文献的(spaced repetition + retrieval practice + contextual learning),平台是 Butterbase 全家桶,愿景是它跟着你从校园到职场。"

## 技术架构(评委追问用)

```
Chrome 扩展(划词+原句) → Next.js API → Butterbase
  - words 表(SM-2 状态,62 真实词条)
  - mia-db serverless fn(参数化 SQL:SRS 写入 + learner_profile)
  - AI gateway(Claude Opus 4.7 tutor / Haiku define,OpenAI 兼容)
Agent loop:get_weak_words / review_word / add_word(隐形调用)
记忆:定量 = SM-2 遗忘曲线;定性 = 会话蒸馏画像 → 开场注入
```

## 已知坑(别现场踩)

- dev server 在 **:3002**(3000/3001 被占)
- 扩展默认后端 `localhost:3002`(chrome.storage `miaBase` 可改)
- JWT 1h 过期:后端自动重登,无需操心
- 若 LLM 慢(Opus 4.7 一轮 5-15s):demo 时提前把开场跑好再上台
