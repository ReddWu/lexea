# Lexea — the words you save show up in your AI chats

> *中文说明见下方 [中文](#中文).*

**Most vocab apps end at a flashcard. Lexea closes the loop with the AI you already talk to every day.**

You highlight a word while reading → it's saved with the *sentence it came from* → you review it on a forgetting-curve schedule → and then your **ChatGPT naturally uses your words back at you in everyday conversation, leaning harder on the ones you keep forgetting.**

Capture + spaced repetition is table stakes (Anki, Trancy, Language Reactor all do it). The part nobody else does is the last step: **immersive review inside the AI chat you're already in.**

- 🖍 **Capture with context** — select any word on any page; it's saved with the full sentence, source URL, and title. Works alongside Trancy (no conflict). Local-first: no account, no backend, nothing to configure.
- 🔁 **Forgetting-curve review** — SM-2 spaced repetition, in the extension *and* on a cross-device website. Front = word, back = definition + your highlighted sentence.
- 🤖 **Your words flow into your AI** — push your weakest words into ChatGPT (Custom Instructions for everyday chats, or a Custom GPT with live sync). It weaves them into normal replies and prioritizes the ones you're shaky on. Ask it about a new word and it saves that too.
- 📤 **Your data, exportable** — CSV / JSON anytime. Optional cloud sync to *your own* free backend.

> ⚠️ Status: working personal tool, open-sourced to validate the idea. Feedback / issues very welcome.

---

## Quick start (local, zero config)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select the [`extension/`](extension/) folder.
3. Select an English word on any page → it's saved (a "✓ saved" toast appears).

That's it — capture, review, and export all work offline with no account. Cloud sync and AI integration are optional add-ons below.

### Using it
- **Auto-save (on by default):** selecting a single real word saves it silently, without clearing your selection — so you can keep using Trancy for translation and the same selection lands in your library. Only real words (letters/hyphen/apostrophe, 2–40 chars) are accepted; `api_key`, codes, numbers are ignored.
- Selecting a **phrase** shows a "★ save" button instead (avoids saving whole sentences).
- Click the extension icon to **review**, **delete** words, **copy weak words for ChatGPT**, or **export CSV/JSON**.

> Chrome isolates extensions, so Lexea can't read Trancy's internal saves — it listens to *your selection* independently. Dupes are de-duplicated; prune unwanted words with the ✕ button.

---

## Optional: cloud sync, review website, AI

These need a free backend (your own — Lexea ships **no keys or hosts**, everything is your own env var / secret). Full setup in [Self-hosting](#self-hosting).

- **Cloud sync** ([InsForge](https://insforge.dev), free): mirror saves to your own `words` table so the website and ChatGPT can read them. Extension → Options → ② Cloud sync.
- **Review website** ([`web/`](web/), Next.js → Vercel): cross-device dashboard (due/stats/7-day schedule/word management) + SM-2 review. See [`web/README.md`](web/README.md).
- **ChatGPT** ([`chatgpt/`](chatgpt/)):
  - **Custom Instructions (daily, recommended):** click "copy weak words" in the popup, paste into ChatGPT → Personalization. Every normal chat then uses your words. Refresh by re-copying. See [`chatgpt/custom-instructions.md`](chatgpt/custom-instructions.md).
  - **Custom GPT (live):** import the Action schema and it fetches your latest weak words in real time, and can `addWord` new ones you ask about. See [`chatgpt/README.md`](chatgpt/README.md).
- **Your own agent** ([`openclaw/`](openclaw/)): `weak-words.mjs` (inject into a system prompt) + `mark-used.mjs` (write back usage).

---

## Architecture

```
   select a word (with Trancy or any page)
            │
            ▼
   ┌──────────────────────────┐      optional toggle
   │  browser-local store      │ ───────────────►  InsForge `words` table (cloud mirror)
   │  word / context sentence /│                      │
   │  SRS strength / chat-uses │              ┌───────┼───────────┐
   └──────────────────────────┘              ▼       ▼           ▼
            │                          review site  ChatGPT     your agent
            ├─ popup: review / delete / copy-for-AI / export
            └─ in-extension SM-2 review
```

Local storage is the source of truth; the cloud mirror is opt-in and powers the website + AI.

### Data model (`words`)
| field | purpose |
|---|---|
| `word` / `lemma` | surface form / normalized dedup key |
| `context` / `contexts` | latest sentence / history of example sentences |
| `translation` | meaning (filled by dictionary or AI) |
| `source_url` / `source_title` | provenance |
| `state` `due` `ease` `interval_days` `reps` `lapses` `last_review` | SM-2 spaced-repetition state → "which words are weak" |
| `times_used_in_chat` | how often the AI has used it (lowers its priority over time) |
| `status` | active / known / archived |

---

## Self-hosting

Clone the repo. **Local-only use needs just the extension** (Quick start above). For cloud sync / website / ChatGPT — all keys are yours; nothing hardcoded.

**1) Backend + table**
```bash
npx @insforge/cli login
npx @insforge/cli create                  # free InsForge project (writes .insforge/project.json)
npx @insforge/cli db migrations up --all  # creates the words table (see migrations/)
```
Note your `oss_host` and `anon key` (`anon_…`) from `.insforge/project.json`.

**2) Connect the extension:** Options → ② Cloud sync → fill `oss_host` + anon key → Test → Save.

**3) Review website (optional, Vercel):** see [`web/README.md`](web/README.md). Set `INSFORGE_OSS_HOST`, `INSFORGE_ANON_KEY`, optional `APP_PASSWORD`, then `cd web && npx vercel --prod`.

**4) ChatGPT (optional):** deploy three edge functions + two secrets —
```bash
npx @insforge/cli secrets add WEAK_WORDS_TOKEN "$(openssl rand -hex 24)"
npx @insforge/cli secrets add PUBLIC_OSS_HOST "https://YOUR-PROJECT.us-east.insforge.app"
npx @insforge/cli functions deploy weak-words --file ./functions/weak-words.ts
npx @insforge/cli functions deploy add-word   --file ./functions/add-word.ts
npx @insforge/cli functions deploy openapi    --file ./functions/openapi.ts
```
Then follow [`chatgpt/README.md`](chatgpt/README.md) (Custom GPT, Action imported from `{oss_host}/functions/openapi`, auth = `WEAK_WORDS_TOKEN`) or [`chatgpt/custom-instructions.md`](chatgpt/custom-instructions.md) (daily).

## Privacy & security
- By default your data lives only in your browser.
- With cloud sync, data goes to **your own** InsForge project; the anon key only goes into your extension / Vercel env vars — never into git.
- Edge functions are protected by `WEAK_WORDS_TOKEN`; the website by optional `APP_PASSWORD`. All secrets are env vars / secrets, never committed (`.insforge/`, `.env.local`, `.vercel` are gitignored).
- v1 keeps it simple: the cloud table allows direct read/write with the anon key (it's *your* private project). For a public multi-user instance, see the UPGRADE PATH in the migration file: add `user_id` + auth and scope rows by `auth.uid()`.

## Roadmap
- [x] Capture extension (local-first): word + context + auto-save + export + delete
- [x] Optional InsForge cloud mirror (PostgREST, anon read/write)
- [x] SM-2 review — in extension and as a cross-device website
- [x] AI: ChatGPT Custom Instructions (daily) / Custom GPT (live, `getWeakWords` + `addWord`) / agent scripts
- [ ] FSRS scheduler (replace SM-2) — optional
- [ ] Multi-tenant SaaS (auth + RLS + hosted backend) — if there's demand

## License
[MIT](LICENSE)

---

<a name="中文"></a>
## 中文

**大多数背单词工具止步于一张闪卡;Lexea 把它和你每天都在用的 AI 接成一个闭环。**

阅读时划词 → 连同**所在原句**一起存下 → 按**遗忘曲线**复习 → 然后你的 **ChatGPT 会在日常聊天里自然地用回这些词,而且你越记不牢的词出现得越多。**

划词采集 + 间隔重复是入场券(Anki / Trancy / Language Reactor 都有)。**没人做的是最后一步:在你本来就在用的 AI 对话里沉浸式复习。**

- 🖍 **带 context 采集**:任意网页划任意词,连原句 + 来源一起存。可与 Trancy 共用。本地优先,零配置、零账号。
- 🔁 **遗忘曲线复习**:SM-2 间隔重复,扩展内 + 跨设备网站都有。
- 🤖 **生词流进你的 AI**:把弱词推进 ChatGPT(日常用自定义指令,或用 Custom GPT 实时同步),它自然地用进回复、优先用你不牢的词;你问它新词它还能顺手存进库。
- 📤 **数据归你**:随时导出 CSV/JSON,云同步用你自己的免费后端。

**怎么用 / 自托管**:见上方英文 [Quick start](#quick-start-local-zero-config) 与 [Self-hosting](#self-hosting),命令通用。纯本地用只需装 [`extension/`](extension/)。

> ⚠️ 现状:可用的个人工具,开源出来验证这个想法。欢迎 issue / 反馈。
