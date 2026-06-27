# vocab-app

一个以「个人单词库」为中心的英语学习系统,**本地优先**:装上浏览器扩展即用,零配置、零成本、隐私好。想跨设备 / 接 AI 时再开一个可选的云同步开关。

```
   选词(配合 Trancy 或任意网页)
            │
            ▼
   ┌──────────────────────────┐        可选开关
   │  浏览器本地 (chrome.storage) │ ───────────────►  InsForge words 表(云镜像)
   │  唯一数据源:词/原句context/  │                      │
   │  SRS熟练度/被AI用过次数 ...   │                      ▼
   └──────────────────────────┘            复习网站 · openclaw 读这张表
            │
            ├─ popup:看最近词 + 导出 CSV/JSON(离线可用)
            └─ (待建) 扩展内复习页:艾宾浩斯/SRS
```

- **默认**:所有单词存在浏览器本地。采集、查看、导出全部离线可用,不需要任何账号或后端。
- **可选云同步(InsForge)**:打开后,每次保存会把单词镜像到你自己的 InsForge 项目,供复习网站 / AI(openclaw)读取。

本仓库目前实现:**采集扩展(本地优先)** + **可选 InsForge 云镜像表**。

---

## 一、装扩展(Chrome / Edge)— 这一步人人都能用

1. 打开 `chrome://extensions` → 右上角开启 **开发者模式**。
2. 点 **加载已解压的扩展程序** → 选本仓库的 [`extension/`](extension/) 目录。
3. 完事。在任意网页**选中一个英文单词**就会自动存入(弹一个「✓ 已保存」小提示)。

### 怎么用

- **选词自动保存(默认开)**:选中**单个英文单词**即静默存入,不清除选区。所以你照常用 Trancy 选词看翻译,同一下选词就进了你的库 —— 体感即「用 Trancy 选词 = 自动入库」。只接受**真正的单词**(字母/连字符/撇号,2–40 长),`api_key`、代码、数字这类不会误存。
- 选中**词组/多词**时会冒出「★ 存入单词本」按钮,点了才存(避免误存整句)。
- 不想自动存?进**选项**关掉「选词自动保存」即可。
- 每次保存都会连同**所在整句原文(context)、来源网址、标题**一起记录。
- 点扩展图标:看全部词、**逐个删除(✕)**、**复制弱词给 ChatGPT**、**导出 CSV / JSON**(解决 Trancy 免费版导不出来的痛点)。删除会同时删本地和云端。

> ⚠️ Chrome 扩展之间互相隔离,本扩展**读不到 Trancy 内部的收藏动作或单词本**。它是独立监听你的"选词"动作来保存的,因此存的是你选中的所有(单个)词。重复词自动去重;不想要的词以后在复习页标记"已掌握"。

---

## 二、可选:开启云同步(InsForge)— 跨设备 / 接 AI 才需要

只有你想让**复习网站**或 **openclaw** 读到单词时才需要这步。

1. 建一个 InsForge 项目(免费):`npx @insforge/cli create`,或用现成项目。
2. 建库:在项目目录跑
   ```bash
   npx @insforge/cli db migrations up --all
   ```
   (迁移文件见 [`migrations/`](migrations/),建一张 `words` 表 + 权限,可重复运行)
3. 拿连接信息:看 `.insforge/project.json` 里的
   - `oss_host`(形如 `https://xxxx.us-east.insforge.app`)
   - **anon key**(以 `anon_` 开头;⚠️ 不要用 `ik_` 开头的 `api_key`,那是管理员密钥)
4. 扩展 → 选项 → 「② 云同步」→ 勾选开启、填入上面两项 → 点「测试连接」应成功 → 保存。

之后每次保存都会镜像到云端的 `words` 表;复习网站和 openclaw 直接读这张表。

> 自托管 / 想换后端? 云镜像走的是标准 PostgREST 风格接口
> (`{host}/api/database/records/words`,`Authorization: Bearer <anon>`),换地址即可。

---

## 数据模型(`words`)速览

| 字段 | 用途 |
|---|---|
| `word` / `lemma` | 词形 / 归一化去重键 |
| `context` / `contexts` | 最近一句原文 / 历史例句数组(每个词可攒多句) |
| `translation` | 释义(以后由词典或 AI 回填) |
| `source_url` / `source_title` | 来源 |
| `state` `due` `stability` `difficulty` `reps` `lapses` `last_review` | 间隔重复(FSRS/SM-2)状态 → 「哪些词不牢固」 |
| `times_used_in_chat` | openclaw 用过这个词的次数(云端由 AI 维护,采集不覆盖) |
| `status` | active / known / archived |

本地记录与云端表字段一致,方便镜像。SRS 字段一开始就带默认值(新词「立即到期」),复习与 AI 直接读用。

## 三、复习(扩展内,纯本地,人人可用)

点扩展图标 → **「▶ 开始复习」**(括号里是到期数量),会打开复习页:

- 正面只显示单词;按**空格**(或点按钮)显示答案。
- 背面显示:在线英文释义(免费 [dictionaryapi.dev](https://dictionaryapi.dev),best-effort)+ **你保存的原句(高亮目标词)**+ 来源。
- 四个评分:**1 忘了 / 2 难 / 3 会 / 4 简单**(键盘 1–4),用 **SM-2 间隔重复算法**(艾宾浩斯遗忘曲线的工程实现)算出下次复习时间。
- "忘了"的词会在**本次**复习里再次出现;其余按算出的天数到期再来。
- 评分会写回本地;若开了云同步,也镜像到 InsForge,供 openclaw 判断"哪些词不牢"。

## 四、让你的 AI 多用你的弱词

**A. ChatGPT 日常对话(推荐 · 日常化)** — 见 [`chatgpt/custom-instructions.md`](chatgpt/custom-instructions.md)。
弹窗里点 **「⧉ 复制弱词」**,把生成的指令粘进 ChatGPT **设置 → 个性化 → 自定义指令**。之后**每一次普通聊天**都会自然地用你的弱词,不用打开任何东西。静态文本,隔几天再点一次复制刷新即可。无需云同步。

**B. ChatGPT Custom GPT(实时自动更新)** — 见 [`chatgpt/`](chatgpt/)。
需开云同步。已部署受密钥保护的接口 `{oss_host}/functions/weak-words`;建一个 Custom GPT,把 [`chatgpt/instructions.md`](chatgpt/instructions.md) 设为指令、[`chatgpt/openapi.yaml`](chatgpt/openapi.yaml) 设为 Action,聊天时**实时拉最新弱词**。要单独打开/@这个 GPT。步骤见 `chatgpt/README.md`。

**C. 自建 agent / 脚本** — 见 [`openclaw/`](openclaw/)。
零依赖 Node 脚本:`weak-words.mjs`(输出可拼进 system prompt 的弱词清单)+ `mark-used.mjs`(回写使用次数)。

## 路线图

- [x] 采集扩展(本地优先):选词 + 原句 + 自动保存 + 导出
- [x] 可选 InsForge 云镜像表(PostgREST 接口,anon 可读写)
- [x] **扩展内复习页**(SM-2 间隔重复,纯本地):到期出卡,正面词、背面释义+原句,打分回写 SRS
- [x] **AI 接入**:ChatGPT 自定义指令(日常化)/ Custom GPT(实时,含 `addWord`)/ 自建 agent 脚本
- [x] **云复习网站**([`web/`](web/),Next.js + Vercel,读云端表):看板(到期/统计/7 天日程/单词管理)+ SRS 复习,跨设备
- [ ] FSRS 升级(替换 SM-2,用 `stability`/`difficulty` 字段)— 可选

## 隐私与安全

- 默认数据只在你本机浏览器里。
- 开启云同步后,数据进入**你自己的** InsForge 项目;anon key 只填进你自己的扩展、不提交到仓库。
- v1 为求简单,云表允许持有 anon key 的客户端直接读写(因为是你的私有项目)。要做公开多用户实例,见迁移文件里的 UPGRADE PATH:加 `user_id` + 登录,按 `auth.uid()` 隔离。
