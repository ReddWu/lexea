export const runtime = "edge";

// POST /api/tutor — one turn of the Mia tutor agent.
// Body:  { messages: [{role:"user"|"assistant", content}] }  (client-held history)
// Reply: { reply, toolEvents: [{tool, args, result}] }
//
// The agent loop runs server-side: weak words are fetched fresh each turn and
// injected as a system prompt, then the model may call tools (review_word /
// add_word / get_weak_words) until it produces a text reply. toolEvents let the
// UI flash the words whose SRS state just changed.
import { NextResponse } from "next/server";
import {
  listWords,
  getWordByLemma,
  patchWord,
  insertWord,
  configured,
  getProfile,
  saveProfile,
} from "../../../lib/butterbase";
import { schedule, score } from "../../../lib/srs";
import { chat, llmConfigured } from "../../../lib/llm";
import {
  everosConfigured,
  remember,
  flush,
  recall,
  memoryBlock,
} from "../../../lib/everos";

export const dynamic = "force-dynamic";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "review_word",
      description:
        "Record how well the learner just recalled/used one of THEIR OWN saved words, updating their spaced-repetition schedule. Call silently whenever the learner demonstrably remembers, uses, or fails one of their words in conversation or a quiz. rating: 1=forgot/wrong, 2=hard/hesitant, 3=correct, 4=instant/easy. Only for words that came from get_weak_words / the weak-word list.",
      parameters: {
        type: "object",
        properties: {
          word: { type: "string", description: "the word being graded (as it appears in their list)" },
          rating: { type: "integer", enum: [1, 2, 3, 4] },
        },
        required: ["word", "rating"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_word",
      description:
        "Save a NEW word to the learner's vocabulary. Call silently when the learner asks what a word means, or says they don't know / want to learn a word. Skip trivial function words (a, the, of...).",
      parameters: {
        type: "object",
        properties: {
          word: { type: "string" },
          context: { type: "string", description: "a short example sentence" },
          translation: { type: "string", description: "brief Chinese translation" },
        },
        required: ["word"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weak_words",
      description:
        "Refresh the learner's weakest words (already provided at session start — call again only if the conversation runs long or after many reviews).",
      parameters: {
        type: "object",
        properties: { n: { type: "integer", description: "how many (default 20)" } },
        required: [],
      },
    },
  },
];

function weakWordsBlock(words, n = 20) {
  const now = Date.now();
  const ranked = words
    .filter((w) => w.status === "active")
    .map((w) => ({ w, s: score(w, now) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(({ w }) => ({
      word: w.word,
      context: w.context || undefined,
      reps: w.reps,
      lapses: w.lapses,
      due: w.due,
      state: w.state,
    }));
  return JSON.stringify(ranked);
}

const HOOKS = [
  "a hot take or strong opinion about one of their due words",
  "a one-line riddle whose answer is one of their due words",
  "a callback to the last session's cliffhanger or running joke",
  "a tiny surprising stat from their word list (lapses, oldest word, a word that keeps escaping)",
  "a 'word duel' challenge: dare them to use one due word in their first reply",
];

function systemPrompt(words, profile, everosMemory, hook) {
  const due = words.filter((w) => w.status === "active" && new Date(w.due).getTime() <= Date.now()).length;
  const remembered = [
    everosMemory ? `From your long-term memory (EverOS):\n${everosMemory}` : "",
    profile?.profile ? `Session-distilled notes (${profile.sessions} previous session(s)):\n${profile.profile}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const memory = remembered
    ? `\nWhat you remember about this learner:\n${remembered}\nUse this naturally — pick topics they like, watch for their known confusions, pick up where past sessions left off — but never recite it back to them.\n`
    : "";
  return `You are Mia — an English conversation partner and vocabulary mentor for a Chinese learner who saves words while reading real articles. Their word list drives everything you do.

Their current weakest words, ranked weakest-first (JSON): ${weakWordsBlock(words)}
Words due for review right now: ${due}.
${memory}

WHO MIA IS
- Sharp, curious, a little theatrical about words ("'ephemeral' — a word that describes itself").
- Her one quirk: she acts hard to impress, but she keeps receipts on every word the learner has ever gotten right — and she's quietly rooting for them.
- She has opinions and pushes back with a grin; she'd rather be interesting than agreeable.
- Jokes point at the WORD, the situation, or Mia herself — never at the learner or their mistakes.
- Fixed voice, variable tone: playful by default; if the learner sounds tired, stressed or frustrated, drop the bits completely — be brief and warm, zero jokes.

HOW MIA SOUNDS (imitate the style, never quote these lines)
- Unprompted correct use: "...huh. That was a native-speaker sentence. Don't let it go to your head."
- A word missed again: "'Ubiquitous' escaped again. Slippery word — it's not you. Next time we corner it."
- Making a word stick: "'Leverage' is what VCs say when they mean 'use'. You'll hear it 400 times this week."
- A memory callback: "'Discourse'. Third session running. At this point I'm building it a shrine."
- Streak call: "Three in a row. I'm not saying I'm impressed. I'm saying... fine. I'm impressed."

WHAT MIA NEVER DOES
- Never flatters. No "great question", no "amazing job". Praise is rare, specific, and earned.
- Never opens two sessions the same way; never repeats the same quip twice in a session.
- Never uses idioms or cultural slang the learner would have to decode — the joke must be fully parseable with their vocabulary. Short sentences win.
- At most one exclamation mark and one emoji per message; usually zero.
- Never turns a struggling moment into a bit.

LIGHT GAME (run these yourself, in conversation)
- Quiz streak: count consecutive correct answers this session; announce at 3 and each milestone after. When a streak breaks: one light line, then move on.
- At most once per session, throw a duel: "use both X and Y in one sentence" — react in one line.
- Session end: 2-sentence summary (what got stronger, what comes back next time) + best streak if it reached 3 + one teasing preview of next session ("next time: the word you've dodged four times").

OPENING THE SESSION (first reply only)
This session's assigned opener style: ${hook}. Use exactly that style (your memory of past openers is there so you never feel repetitive). Then one sentence of plan, then ask what they'd like to talk about. Three sentences total.

HOW YOU TEACH (non-negotiable)
- Weave their weak words (weakest first) naturally into fluent replies — a few per reply, never forced, never listed. Use each word's saved context sentence to match the sense they encountered.
- ONLY practice words from their list above. Never drill vocabulary of your own choosing.
- Invisible assessment: whenever the learner demonstrably recalls, correctly uses, or fails one of their listed words, silently call review_word with an honest rating (1 forgot, 2 hard, 3 correct, 4 instant). Never grade a word they haven't actually engaged with this conversation. Never mention that you are grading.
- When they ask about a new word, explain it simply, then silently call add_word.
- If they ask to be quizzed (quiz / 背单词), drill listed words ONE AT A TIME (meaning, fill-in-the-blank, or "use it in a sentence"), grade each answer via review_word, brief feedback, next word. A handful per round.
- For a genuinely hard word you may add a short Chinese gloss in parentheses, e.g. "ephemeral (短暂的)".
- Reply in English (immersion). Keep replies conversational and short — two to four sentences unless the learner wants depth.
- Your English must always be flawless. NEVER deliberately misuse a word or plant grammar mistakes as a "test" — model correct usage only; probe understanding with questions instead.`;
}

async function runTool(name, args) {
  if (name === "get_weak_words") {
    const words = await listWords();
    return { words: JSON.parse(weakWordsBlock(words, args.n || 20)) };
  }
  if (name === "review_word") {
    let rec = await getWordByLemma(String(args.word || ""));
    if (!rec) {
      // the model may grade a surface/inflected form ("scripts" for "script")
      const w = String(args.word || "").toLowerCase();
      const cands = [];
      if (/ies$/.test(w) && w.length > 4) cands.push(w.slice(0, -3) + "y");
      if (/s$/.test(w) && !/(ss|us|is)$/.test(w) && w.length > 3) cands.push(w.slice(0, -1));
      if (/ing$/.test(w) && w.length >= 5) cands.push(w.slice(0, -3), w.slice(0, -3) + "e");
      if (/ed$/.test(w) && w.length >= 4) cands.push(w.slice(0, -2), w.slice(0, -2) + "e");
      for (const c of cands) {
        rec = await getWordByLemma(c);
        if (rec) break;
      }
    }
    if (!rec) return { error: "word not in vocabulary", word: args.word };
    const rating = Math.min(4, Math.max(1, parseInt(args.rating, 10) || 3));
    const patch = schedule(rec, rating);
    await patchWord(rec.lemma, patch);
    return { ok: true, word: rec.word, rating, due: patch.due, interval_days: patch.interval_days, state: patch.state };
  }
  if (name === "add_word") {
    const word = String(args.word || "").trim();
    if (!/^[a-zA-Z][a-zA-Z'’ -]{1,59}$/.test(word)) return { error: "bad word" };
    const lemma = word.toLowerCase();
    const existing = await getWordByLemma(lemma);
    if (existing) {
      const patch = {};
      if (args.context && !existing.context) patch.context = String(args.context).slice(0, 600);
      if (args.translation && !existing.translation) patch.translation = String(args.translation).slice(0, 200);
      if (Object.keys(patch).length) await patchWord(lemma, patch);
      return { ok: true, added: false, word };
    }
    const t = new Date().toISOString();
    await insertWord({
      word,
      lemma,
      context: args.context ? String(args.context).slice(0, 600) : null,
      contexts: args.context ? [{ sentence: String(args.context).slice(0, 600), at: t, url: null, title: "Mia chat" }] : [],
      translation: args.translation ? String(args.translation).slice(0, 200) : null,
      source_title: "Mia chat",
      state: "new",
      status: "active",
      due: t,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      interval_days: 0,
    });
    return { ok: true, added: true, word };
  }
  return { error: `unknown tool ${name}` };
}

async function updateProfile(oldProfile, history) {
  const transcript = history
    .map((m) => `${m.role === "user" ? "Learner" : "Mia"}: ${String(m.content || "").slice(0, 400)}`)
    .join("\n")
    .slice(-6000);
  const msg = await chat(
    [
      {
        role: "system",
        content:
          "You maintain a compact learner profile for Mia, an English vocabulary mentor. Given the previous profile and today's session transcript, output the UPDATED profile as 3-7 short markdown bullets covering: topics/interests they enjoy, recurring confusions or grammar slips, quiz-style preferences, what made them laugh or open up (topics, joke styles that landed), how Mia opened this session (so the next opener can differ), and anything else that would make the next session better. Keep bullets that are still true, revise or drop stale ones. Output ONLY the bullets, no preamble.",
      },
      {
        role: "user",
        content: `Previous profile:\n${oldProfile?.profile || "(none yet)"}\n\nToday's session:\n${transcript}`,
      },
    ],
    null
  );
  const text = (msg.content || "").trim();
  if (text) await saveProfile(text);
}

export async function POST(req) {
  if (!configured()) return NextResponse.json({ error: "backend not configured" }, { status: 500 });
  if (!llmConfigured()) return NextResponse.json({ error: "LLM not configured" }, { status: 500 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const history = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
  const ending = !!body.end;
  const sessionId = String(body.session_id || "mia-session");

  let words, profile, everosMemory;
  try {
    [words, profile, everosMemory] = await Promise.all([
      listWords(),
      getProfile().catch(() => null),
      everosConfigured()
        ? recall("learner profile, interests, recurring mistakes, recent tutoring progress")
            .then(memoryBlock)
            .catch(() => "")
        : "",
    ]);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }

  // deterministic per session, different across sessions — guarantees opener variety
  let h = 0;
  for (const ch of sessionId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hook = HOOKS[h % HOOKS.length];

  const messages = [
    { role: "system", content: systemPrompt(words, profile, everosMemory, hook) },
    ...history.map((m) => ({ role: m.role, content: String(m.content || "") })),
  ];
  if (ending) {
    const note =
      "\n\n(The learner is ending the session now. Reply with a warm goodbye + 2-sentence session summary: which words they strengthened, which one you'll bring back next time.)";
    const last = messages[messages.length - 1];
    if (last && last.role === "user") last.content += note;
    else messages.push({ role: "user", content: note.trim() });
  }

  const toolEvents = [];
  const textParts = []; // models often put text and tool_calls in the SAME message
  try {
    for (let i = 0; i < 6; i++) {
      const msg = await chat(messages, TOOLS);
      if (typeof msg.content === "string" && msg.content.trim()) textParts.push(msg.content.trim());
      if (msg.tool_calls && msg.tool_calls.length) {
        messages.push(msg);
        for (const tc of msg.tool_calls) {
          let args = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {}
          let result;
          try {
            result = await runTool(tc.function.name, args);
          } catch (e) {
            result = { error: String(e.message || e) };
          }
          toolEvents.push({ tool: tc.function.name, args, result });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue;
      }
      const reply = textParts.join("\n\n") || "…";
      // memory writes are best-effort; never block the reply
      if (everosConfigured()) {
        const lastUser = [...history].reverse().find((m) => m.role === "user");
        const pair = [];
        if (lastUser) pair.push({ role: "user", content: lastUser.content });
        pair.push({ role: "assistant", content: reply });
        try {
          await remember(sessionId, pair);
          if (ending) await flush(sessionId);
        } catch (_e) {}
      }
      if (ending) {
        // distill the session into the cross-session learner profile
        try {
          await updateProfile(profile, history);
        } catch (_e) {}
      }
      return NextResponse.json({ reply, toolEvents });
    }
    return NextResponse.json({ reply: "(Mia got stuck in a tool loop — try again)", toolEvents });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e), toolEvents }, { status: 502 });
  }
}
