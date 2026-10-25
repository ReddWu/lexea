# Echowords — Chrome Web Store 提交材料

## 上传文件
- 扩展包：`dist/mia-store-v0.3.1-cws.zip`（已去掉 localhost 权限）
- 商店图标 128×128：`dist/store-assets/store-icon-128.png`
- 截图 1280×800：`dist/store-assets/screenshot1.png`

## 商店文案（Store listing 页）

**Name**: Echowords — Save words while you read

**Summary (132 字符内)**:
Select a word on any page — Echowords saves it with its sentence, shows a plain-English meaning + 中文, and tutors you on it later.

**Description**:
Echowords turns every page you read into vocabulary practice.

Select any English word → click "★ Save to Echowords". A card pops up instantly with:
• The phonetic transcription (IPA), from a 126k-word dictionary bundled inside the extension
• A plain-English explanation of the exact sense used in YOUR sentence
• 中文释义 on demand

Every word is saved together with the sentence you found it in, so you never review a word stripped of context. Your library syncs to the Echowords web app, where flashcards are scheduled on your forgetting curve and saved words are woven back into natural AI tutoring conversations.

Local-first: lookups run on-device from bundled dictionaries; your data stays in your browser's storage and syncs only to your Echowords library.

**Category**: Education
**Language**: English

## Privacy 标签页要填的内容

**Single purpose description**:
Save vocabulary words (with their source sentence) that the user explicitly selects while reading, and show their definitions.

**Permission justifications**:
- `storage` / `unlimitedStorage`: 保存用户收藏的单词和两个内置词典缓存（约 7MB），必须超过默认配额
- Content script on `<all_urls>`: 用户可能在任何网站上阅读并选词；只在用户主动选中文本并点击保存按钮时才读取所选单词及其句子，不读取其他页面内容
- `identity`: Google 登录（chrome.identity.launchWebAuthFlow 走 OAuth，插件本身不接触密码）
- Host `mia-tutor.vercel.app`: 同步用户的单词库到 Echowords 后端（按账号隔离）
- Host `kv54z32g.us-east.insforge.app`: 认证服务（Google OAuth 换取/刷新会话 token）
- Host `api.dictionaryapi.dev`: 查询单词音标和释义（只发送单词本身）

**Data usage disclosure（勾选项）**:
- 收集的数据类型：勾选 "Website content"（用户选中的文字、页面 URL 和标题）和 "Personally identifiable information"（Google 登录的邮箱/姓名/头像）；"Web history" 不勾
- 声明：不出售数据、不用于与核心功能无关的用途、不用于信用评估

**Privacy policy URL**: https://mia-tutor.vercel.app/privacy
（web/app/privacy/page.jsx 已创建，需要部署后生效）

## 提交步骤
1. 注册开发者账号（一次性 $5）：https://chrome.google.com/webstore/devconsole
2. "New item" → 上传 `mia-store-v0.3.1-cws.zip`
3. 填 Store listing（上面的文案）+ 上传图标和截图
4. 填 Privacy 标签页（上面的 justifications + privacy policy URL）
5. 先部署 web（让 /privacy 上线），再提交审核
6. 审核通常 1–3 天；`<all_urls>` content script 可能触发深度审核，最长 2–4 周

## ✓ 已解决（2026-07-15）
~~后端无用户认证~~ → 已接入 Google 登录（InsForge OAuth），words/learner_profile 表
开启 RLS 按 user_id 隔离；未登录时插件纯本地运行。

## 功能更新（v0.2.0）
- Google 登录（web + 插件）
- 学习语言支持：英/中/西/法/日 五种语言选词保存，AI 返回读音（拼音/假名/IPA）+ 释义
- manifest 加入固定 key，扩展 ID: bakaoahlcnpnefebfoiogckiaiehngmk（OAuth 白名单依赖它，
  上传商店时保留 manifest 里的 key 字段；私钥备份在 .secrets/mia-ext-key.pem）

## 功能更新（v0.3.0）
- 完善西语短语保存：最多 12 个词 / 120 字符
- 支持 ¿…?、¡…!、逗号、句号、省略号、引号、括号和破折号
- 展示保留原标点，去重时忽略外围标点（`¿Qué tal?` 与 `qué tal` 是同一张卡）
- 西语短语按整体语境生成简单英文释义、中文释义和 IPA
- 网页版与扩展复习均使用西语发音，缺失释义会自动补齐
