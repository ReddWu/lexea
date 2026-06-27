# 日常化:让所有 ChatGPT 对话自动用你的弱词

ChatGPT 的实时接口(Action)**只能在 Custom GPT 里用**,普通日常对话调不了。能对**每一次普通聊天**自动生效的,只有 **自定义指令(Custom Instructions / 个性化)**。所以日常化走这条:把弱词放进自定义指令。

代价:它是**静态文本**,不会自动更新——但扩展里给了「一键复制」,隔几天刷新一次即可。

## 一次性设置

1. 点扩展图标 → 弹窗里点 **「⧉ 复制弱词(粘进 ChatGPT 自定义指令)」**。
   它会按"最不牢的在前"排好你的词(最多 30 个),连同一段指令一起复制到剪贴板。
2. 打开 ChatGPT → **设置 → 个性化 → 自定义指令**(Settings → Personalization → Custom Instructions)。
3. 把复制的内容粘进 **「ChatGPT 应该如何回应?」/「How should ChatGPT respond?」** 那一栏 → 保存。

完成后,你**任何**普通对话(不用打开那个 Custom GPT)ChatGPT 都会自然地把你的弱词用进回复。

## 刷新(隔几天做一次)

存了新词、或复习后熟练度变了,想让 ChatGPT 跟上:
- 再点一次「⧉ 复制弱词」→ 回自定义指令那栏,**整段替换**成新内容 → 保存。

## 复制出来的内容长这样

> I'm a Chinese native speaker learning English. In your replies, naturally and correctly use some of the English words I'm practicing (listed below) whenever they genuinely fit the topic — prioritize the ones earlier in the list. Don't force them, don't list or define them, and don't add other "vocabulary words" of your own; just weave mine into fluent, natural sentences. Add a short Chinese gloss in parentheses only for a genuinely hard one. If none fit naturally, just reply normally.
>
> My words (weakest first): word1, word2, word3, ...

> 提示:自定义指令有长度上限,所以只放词本身(不含例句)、最多 30 个最弱的词。想要"实时、自动更新"且仍是日常聊天,那是另一条更重的路(MCP 连接器),需要单独搭服务,本项目暂未做。
