# openclaw 接入套件

让你自己的 AI agent(openclaw)**尽量用你单词表里的词跟你聊天**,并且**多用你记不牢的词**。

> 前提:扩展里的**云同步要开着**(选项 → ② 云同步),这样单词才会进 InsForge,这里的脚本才读得到。

## 环境变量

```bash
export INSFORGE_URL=https://YOUR-PROJECT.us-east.insforge.app   # 你的 oss_host(见 .insforge/project.json)
export INSFORGE_ANON_KEY=anon_xxxxxxxx                       # anon key(不是 ik_ 那把)
```

## 1. 开聊时:把"弱词"注入 system prompt

```bash
node weak-words.mjs 30          # 取最弱的 30 个词,输出一段可直接拼进 system prompt 的文字
node weak-words.mjs 30 --json   # 想自己处理就输出 JSON
```

排序综合了:是否到期、是否在重新学(relearning)、忘记次数(lapses)、复习次数、难度、以及已经在聊天里用过几次 —— 越弱越靠前。

把它的输出**追加到你 agent 的 system prompt** 即可。伪代码:

```js
import { execSync } from "node:child_process";
const weak = execSync("node openclaw/weak-words.mjs 30", { encoding: "utf8" });
const systemPrompt = BASE_SYSTEM_PROMPT + "\n\n" + weak;
// ...用 systemPrompt 发起对话
```

每次开新对话(或每天)重新跑一次,单词表就**自动更新**了——你新存的词、复习后变化的熟练度都会反映进来。

## 2. 回复后:记录 AI 用了哪些词(让它们慢慢沉下去)

当 openclaw 在回复里用到了目标词,调用:

```bash
node mark-used.mjs serendipity ubiquitous
```

这会给这些词的 `times_used_in_chat +1`,下次排序时它们的权重降低,把舞台让给更弱的词。

怎么知道 AI 用了哪些词?两种简单做法:
- 让 agent 在回复后**额外输出一行**它本次用到的目标词(结构化),你解析后调用 `mark-used.mjs`;
- 或回复文本里做一次词形匹配,命中单词表就标记。

## 数据来源

两个脚本都走标准 PostgREST 风格接口读写你的 `words` 表:
`{INSFORGE_URL}/api/database/records/words`,`Authorization: Bearer <anon>`。
换任何兼容后端只需改 `INSFORGE_URL` / `INSFORGE_ANON_KEY`。
