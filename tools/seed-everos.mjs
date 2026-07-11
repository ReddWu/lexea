#!/usr/bin/env node
// Seed EverOS Cloud with 4 reconstructed tutoring sessions built from the
// learner's REAL Butterbase spaced-repetition data.
// Plain Node 22, no deps, global fetch.

const BB_URL =
  "https://api.butterbase.ai/v1/app_qxdg80kgznpl/words?order=lapses.desc&limit=100";
const BB_KEY = process.env.BUTTERBASE_KEY;

const EV_BASE = "https://api.evermind.ai/api/v1";
const EV_KEY = process.env.EVEROS_API_KEY;
const USER_ID = "redd";

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- fetch data

async function fetchWords() {
  const res = await fetch(BB_URL, {
    headers: { Authorization: `Bearer ${BB_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Butterbase fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function isJunk(r) {
  if (!r.word || r.word.trim().length < 3) return true;
  if (!r.context || r.context.trim().length < 15) return true;
  return false;
}

// Prefer the original saved sentence from the contexts history when available.
function realSentence(r) {
  try {
    const ctxs = JSON.parse(r.contexts || "[]");
    if (ctxs.length && ctxs[0].sentence) return ctxs[0].sentence;
  } catch {}
  return r.context;
}

function prettySource(r) {
  let t = r.source_title || "an article";
  t = t.replace(/^\(\d+\)\s*/, "").replace(/\s*\/\s*X$/, "");
  try {
    const ctxs = JSON.parse(r.contexts || "[]");
    if (ctxs.length && ctxs[0].title) {
      t = ctxs[0].title.replace(/^\(\d+\)\s*/, "").replace(/\s*\/\s*X$/, "");
    }
  } catch {}
  return t;
}

function shortQuote(r, max = 140) {
  let s = realSentence(r).trim();
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, "") + "...";
  return s;
}

// ---------------------------------------------------------------- pick words

function pickWords(rows) {
  const usable = rows.filter((r) => !isJunk(r));
  // most-lapsed first, then most-repped; keep the interesting tech ones on top
  usable.sort((a, b) => b.lapses - a.lapses || b.reps - a.reps);
  const byWord = new Map();
  for (const r of usable) {
    const k = r.word.toLowerCase();
    if (!byWord.has(k)) byWord.set(k, r);
  }
  const preferred = [
    "discourse",
    "script",
    "piping",
    "latency",
    "specs",
    "interoperability",
    "deprivation",
    "rigid",
    "chasm",
    "monetize",
    "subpoenaed",
    "bluntly",
  ];
  const picked = [];
  for (const w of preferred) if (byWord.has(w)) picked.push(byWord.get(w));
  for (const r of usable) {
    if (picked.length >= 12) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return { picked, byWord };
}

// ---------------------------------------------------------------- sessions

function buildSessions(byWord) {
  const need = (w) =>
    byWord.get(w) || {
      word: w,
      context: `(no saved sentence for ${w})`,
      source_title: "an article",
      reps: 0,
      lapses: 0,
      contexts: "[]",
    };

  const discourse = need("discourse");
  const script = need("script");
  const piping = need("piping");
  const latency = need("latency");
  const specs = need("specs");
  const interop = need("interoperability");
  const depriv = need("deprivation");
  const rigid = need("rigid");
  const chasm = need("chasm");
  const monetize = need("monetize");
  const subpoenaed = need("subpoenaed");

  const now = Date.now();

  // helper to build a session with messages spaced 30-90s apart
  function session(id, daysAgo, turns) {
    let t = now - daysAgo * DAY;
    const messages = turns.map(([role, content]) => {
      t += 30_000 + Math.floor(Math.random() * 60_000);
      return { role, timestamp: t, content };
    });
    return { session_id: id, messages };
  }

  const s1 = session("mia-history-1", 12, [
    ["assistant", "Hi! I'm Mia, your vocabulary mentor. Before we start, tell me a bit about yourself — where do the words you save usually come from?"],
    ["user", "Hi Mia! I'm Redd, an indie hacker from China. I read a lot English articles about tech and startups, mostly on X and Reddit, and I save words I don't know."],
    ["assistant", `Great habit. I can see your saved list already. Let's start with "${discourse.word}" — you saved it from "${prettySource(discourse)}", in the sentence: "${shortQuote(discourse)}". Any idea what it means?`],
    ["user", "Hmm, discourse... is it like a speech? Honestly I keep confusing this one, it not stick in my head."],
    ["assistant", `Close but not quite — here "discourse" means the ongoing public discussion around a topic, like "the productivity discourse online". Let's also look at "${script.word}" and "${piping.word}", both from the same Cathy Di thread: "${shortQuote(script)}".`],
    ["user", "Oh, that sentence confused me a lot. I know script like movie script, but 'scripting' and 'piping' for CLI I don't really get."],
    ["assistant", "In tech, scripting means writing small programs to automate tasks, and piping means sending one command's output into another — like water through a pipe. As an indie hacker you'll see these constantly."],
    ["user", `Make sense! One more, "${latency.word}" — I saved it from that same A2A article: "${shortQuote(latency, 110)}".`],
    ["assistant", `"Latency" is the delay before something responds — real-world latency means real network delays. You clearly love these agent-infrastructure articles, so I'll keep using startup examples for you.`],
    ["user", "Yes please! Tech and startup examples are much easier for me to remember than textbook sentences."],
    ["assistant", "Deal. Today's words to review later: discourse, script, piping, latency. I predict discourse will be the tricky one — see you next time, Redd!"],
  ]);

  const s2 = session("mia-history-2", 9, [
    ["assistant", "Welcome back, Redd! Quiz time. Fill in the blank: \"There's a productivity ______ online.\" It's one of the words from last session."],
    ["user", "Uh... is it 'discussion'? No wait, the hard one... 'discourse'? I almost forgot it again, sorry."],
    ["assistant", `You got there, but yes — "${discourse.word}" slipped again. That's ${discourse.lapses} times now in your review data, so we'll keep drilling it. Next: "CLI is an interface pattern for scripting, ______, and automating interactions."`],
    ["user", "Piping! That one I remember because of the water pipe picture you gave me."],
    ["assistant", `The pipe image worked. Now a new one from your list: "${specs.word}", from "${prettySource(specs)}": "${shortQuote(specs)}". What are dead specs?`],
    ["user", "Specs is like... specifications? So a protocol with no infrastructure is just a document nobody uses?"],
    ["assistant", `Exactly right. You also saved "${depriv.word}" from "${prettySource(depriv)}": "${shortQuote(depriv)}". Deprivation means being denied something you need — the article argues all-English immersion can feel like that.`],
    ["user", "Haha yes, that article was about my own English learning plan actually. Deprivation... like 睡眠不足 is sleep deprivation right?"],
    ["assistant", "Perfect connection — sleep deprivation is the classic example. By the way, how do you like this quiz format?"],
    ["user", "I like fill-in-the-blank best, multiple choice is too easy to guess. And please keep the indie hacking topics, they are fun for me."],
    ["assistant", "Noted: fill-in-the-blank quizzes, indie-hacking flavor. Homework: use 'discourse' in one sentence about your own startup before next session."],
  ]);

  const s3 = session("mia-history-3", 6, [
    ["assistant", "Hey Redd! Let's start with your homework word. Fill in the blank: \"The AI-agent ______ on X moved from copilots to protocols this year.\""],
    ["user", "Ah... this word again. Dis... discussion? No — discourse! Why I always blank on this one."],
    ["assistant", `You recovered, but "${discourse.word}" is still costing you a beat — that's the word your review stats mark as most-lapsed. Let's anchor it: discourse = the ongoing conversation a whole community is having.`],
    ["user", "OK. Community-level conversation. I will write it on sticky note."],
    ["assistant", `Next, from the same Cathy Di thread you love: "${shortQuote(rigid, 120)}". What does "${rigid.word}" mean here?`],
    ["user", "Rigid is like... not flexible? The landscape thinks of agents in a too fixed way?"],
    ["assistant", `Exactly — stiff, inflexible thinking. Now the long one: "${interop.word}". Your saved sentence: "${shortQuote(interop)}".`],
    ["user", "Interoperability! Different systems can work together. This one is long but easy for me, we talk about it in MCP articles all the time."],
    ["assistant", `Nice. Last quiz: "It will be unlocked when more people can actually build, trust, discover, and ______ agents." From your saved list.`],
    ["user", "Monetize! As indie hacker that word I never forget, haha."],
    ["assistant", `Of course you don't. Quick score today: rigid, interoperability, monetize all solid; "script" as scripting still shaky when I tested it earlier, and discourse needed a hint. We'll re-test both next time — also revisit "${chasm.word}" from the article title "${prettySource(chasm)}".`],
    ["user", "Crossing the Imagination Chasm — chasm is a big gap, right? OK, see you next time Mia."],
  ]);

  const s4 = session("mia-history-4", 3, [
    ["assistant", "Redd! Big test day. No hints this time: \"There's a productivity ______ online.\""],
    ["user", "Discourse. Community-level conversation about a topic. Finally it sticks!"],
    ["assistant", "Instant recall — that's a huge win over our first session. Next: \"CLI is an interface pattern for ______, piping, and automating interactions.\""],
    ["user", "Scripting! Writing small programs to automate tasks. And piping is chaining commands output to input."],
    ["assistant", `Both nailed — the two words you kept stumbling on are now clean. Latency check: what does "real-world latency" mean in that A2A sentence?`],
    ["user", "The real network delay before a response. Easy now. Also I saved a new word yesterday from a news article!"],
    ["assistant", `I saw it — "${subpoenaed.word}", from "${prettySource(subpoenaed)}": "${shortQuote(subpoenaed, 120)}". Legal vocabulary, a new genre for you!`],
    ["user", "Yes, subpoenaed means officially ordered to testify in court, right? The news about journalists made me curious."],
    ["assistant", "Exactly right on the first try. So today: discourse, scripting, piping, latency all recalled instantly, and you self-taught a legal word. That is real progress, Redd."],
    ["user", "Thanks Mia! The fill-in-the-blank drills really works for me. Next time maybe we can do words from anthropology articles too, I start reading those."],
    ["assistant", "Fill-in-the-blank stays, and I'll pull anthropology examples next session. Proud of you — from forgetting 'discourse' four times to instant recall."],
  ]);

  return [s1, s2, s3, s4];
}

// ---------------------------------------------------------------- push

async function evPost(path, body) {
  const res = await fetch(`${EV_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EV_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

async function main() {
  console.log("Fetching Butterbase words...");
  const rows = await fetchWords();
  const { picked, byWord } = pickWords(rows);
  console.log(
    "Picked words:",
    picked.map((r) => `${r.word}(reps=${r.reps},lapses=${r.lapses})`).join(", ")
  );

  const sessions = buildSessions(byWord);

  for (const s of sessions) {
    const pushBody = {
      user_id: USER_ID,
      session_id: s.session_id,
      messages: s.messages,
    };
    const push = await evPost("/memories", pushBody);
    const taskId =
      push.json?.task_id ?? push.json?.data?.task_id ?? push.json?.id ?? null;
    console.log(
      `[${s.session_id}] push -> HTTP ${push.status}` +
        (taskId ? ` task_id=${taskId}` : "") +
        ` (${s.messages.length} messages, first ts=${new Date(s.messages[0].timestamp).toISOString()})`
    );
    if (!push.ok) console.log(`  push error body: ${push.text}`);

    const flush = await evPost("/memories/flush", {
      user_id: USER_ID,
      session_id: s.session_id,
    });
    const flushTask =
      flush.json?.task_id ?? flush.json?.data?.task_id ?? null;
    console.log(
      `[${s.session_id}] flush -> HTTP ${flush.status}` +
        (flushTask ? ` task_id=${flushTask}` : "")
    );
    if (!flush.ok) console.log(`  flush error body: ${flush.text}`);
  }

  console.log("Done seeding 4 sessions.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
