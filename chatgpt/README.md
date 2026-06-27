# 用 ChatGPT(Custom GPT + Action)接入弱词

让你的 ChatGPT 在聊天时**实时拉取你最新的弱词**,自然地用它们跟你对话。需要 **ChatGPT Plus**,以及扩展里**开启云同步**(单词才会进 InsForge)。

后端部分已经替你搭好了:
- 接口:`{oss_host}/functions/weak-words?n=30`(GET,返回排好序的弱词 JSON)
- 用密钥 `x-api-key` 保护(密钥存在 InsForge 的 secret `WEAK_WORDS_TOKEN` 里)

## 你需要的两样东西

1. **服务器地址(oss_host)**:见 `.insforge/project.json` 的 `oss_host`
   (形如 `https://YOUR-PROJECT.us-east.insforge.app`)。
2. **API 密钥**:运行
   ```bash
   npx @insforge/cli secrets get WEAK_WORDS_TOKEN
   ```
   把输出的那串拿好(⚠️ 不要提交到仓库 / 不要分享)。

## 建 Custom GPT 步骤

1. ChatGPT → 左下角你的名字 → **My GPTs → Create a GPT → Configure**。
2. 起个名,比如 “English Buddy”。
3. **Instructions**:把 [`instructions.md`](instructions.md) 里 `---` 下面那整段英文粘进去。
4. 往下找 **Actions → Create new action**。
   - **Schema**:把 [`openapi.yaml`](openapi.yaml) 全文粘进去
     (确认里面 `servers.url` 是你的 `oss_host`)。
   - **Authentication** → 选 **API Key**:
     - Auth Type:`API Key`
     - API Key:粘贴上面 `WEAK_WORDS_TOKEN` 的值
     - Custom Header Name:`x-api-key`
5. 保存。回到对话框里点 “getWeakWords” 测试,应能返回你的弱词。
6. 右上角 **Create / Update**,选私有(Only me)。

## 用法

直接跟这个 GPT 聊天即可。它会在开头静默拉一次弱词,然后在回复里自然地用它们;你新存的词、复习后变弱/变强的词,下次开聊会**自动反映**——不用手动更新。

## 加了 `addWord`(问到新词自动入库)

Action schema 现在含两个操作:`getWeakWords`(读弱词)和 **`addWord`(写新词)**。你聊天时让它解释/翻译某个英文词,它讲完会**自动把这个词存进你的云端单词表**,以后进弱词轮换。

> 已经建好 GPT 的话,要获得 `addWord`:回 Action → **重新「通过 URL 导入」**同一个 schema 网址(`{oss_host}/functions/openapi`),并把更新后的 [`instructions.md`](instructions.md) 重新粘进 Instructions → Update。
>
> ⚠️ 这些经 `addWord` 写入的词只进**云端**;要让它们也出现在扩展的复习页和"复制弱词"里,到扩展设置 → ②云同步 点 **「⬇ 从云端拉取新词到本地」** 即可。

## 排查

- 测试报 401:`x-api-key` 的值或 header 名填错了。
- 返回空 `words`:扩展里云同步没开,或还没存词到云端。
- 想换返回数量:让 GPT 调 `getWeakWords` 时带 `n`(最多 100),或改 instructions。
