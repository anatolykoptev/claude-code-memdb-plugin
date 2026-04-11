#!/usr/bin/env node
/**
 * Claude Code Hook: UserPromptSubmit — Context Injection
 *
 * Searches MemDB for relevant memories and injects them as additionalContext.
 * Uses HTTP REST API via Go gateway (:8080) for native search performance.
 *
 * Stdin: { prompt, session_id, hook_event_name }
 * Stdout: { hookSpecificOutput: { hookEventName, additionalContext } }
 */
import { loadConfig, getApiUrl, getUserId, getCubeId, getSecret } from "./lib/config.mjs";
import { readBuffer, appendBuffer, buildContextQuery } from "./lib/context-buffer.mjs";
import { redactSensitive } from "./lib/redact.mjs";
import {
  getMemoryText,
  getProjectScope,
  readSeen,
  writeSeen,
  formatRecency,
} from "./lib/inject-helpers.mjs";

loadConfig();

const MEMDB_API = getApiUrl();
const USER_ID = getUserId();
const CUBE_ID = getCubeId();
const SECRET = getSecret();

// Tuning knobs (2026-04-11): cut noise from flat relativity distribution.
// Old: FETCH_K=5, INJECT_K=5, post-filter >=0.88, always use buildContextQuery
// New: FETCH_K=5, INJECT_K=2, post-filter >=0.93, context-query only for short prompts,
// + top-1 hard gate 0.94, + project scope boost, + session dedup.
const FETCH_K = 5;
const INJECT_K = 2;
const MAX_CHARS = 500;
const MIN_RELATIVITY = 0.93;   // post-search quality gate (was 0.88)
const STRONG_RELATIVITY = 0.94; // require at least one memory above this (unless project match)
const MIN_PROMPT_LEN = 20;     // skip very short prompts (unchanged)
const SELF_CONTAINED_LEN = 30; // prompts >= this and not deictic skip conversation-context augmentation

// Skip patterns: casual prompts not worth searching
const SKIP_RE = /^(hi|hello|hey|ok|yes|no|thanks|спасибо|привет|ок|да|нет|ладно|понял|хорошо|перезагрузил|перезагрузи|готово|сделал|сделано|проверь|проверил|жди|подожди|продолжай|продолжи|дальше|всё|стоп|отлично|класс|круто|погнали|делай|запусти|покажи|давай|закоммить|запушь|пушни|применяй|обнови|удали|открой|закрой|\/\w+)\s*[.!?]*$/i;

// Deictic / continuation prompts that need conversation context to disambiguate
const DEICTIC_RE = /\b(this|that|these|those|it|they|them|это|эт[иоу]|тот|те |них|нем|ней|его|её|их)\b|^(и |а |но |ещё|еще|тоже|потом|так |ну |and |but |also |then |so )/i;

function makeHeaders() {
  const h = { "Content-Type": "application/json" };
  if (SECRET) h["X-Internal-Service"] = SECRET;
  return h;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
  });
}

async function main() {
  const input = await readStdin();
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  const prompt = redactSensitive(event.prompt || "");
  const sessionId = event.session_id || "default";

  // Skip short or casual prompts
  if (prompt.length < MIN_PROMPT_LEN || SKIP_RE.test(prompt.trim())) {
    process.exit(0);
  }

  // Write current prompt to context buffer for future queries
  appendBuffer(sessionId, "user", prompt);

  try {
    // Build search query: ONLY augment with conversation context when the prompt
    // is short/deictic (buildContextQuery was the main source of noise — it dragged
    // in unrelated topics from parallel work into every query).
    let searchQuery;
    if (prompt.length < SELF_CONTAINED_LEN || DEICTIC_RE.test(prompt)) {
      const buffer = readBuffer(sessionId, 4);
      searchQuery = buildContextQuery(prompt, buffer);
    } else {
      searchQuery = prompt.slice(0, 500);
    }

    const projectScope = getProjectScope();
    const seen = readSeen(sessionId);

    const res = await fetch(`${MEMDB_API}/product/search`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({
        query: searchQuery,
        user_id: USER_ID,
        readable_cube_ids: [CUBE_ID],
        top_k: FETCH_K,
        dedup: "mmr",
        relativity: 0.93,
        num_stages: 2,
        include_skill_memory: false,
        include_preference: false,
        internet_search: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) process.exit(0);

    const data = await res.json();

    const rawCubes = data?.data?.text_mem || data?.text_mem || [];
    let memories = rawCubes.flatMap((cube) => cube.memories || []);

    // Post-search quality gate: drop borderline memories (raised 0.88 → 0.93)
    memories = memories.filter((m) => {
      const rel = m.metadata?.relativity;
      return rel == null || rel >= MIN_RELATIVITY;
    });

    // Drop duplicates we already injected this session
    memories = memories.filter((m) => !seen.has(m.id));

    if (!memories.length) process.exit(0);

    // Project scope boost: if current CWD maps to a project name, prefer memories
    // that mention it. Build two pools and interleave (matches first).
    if (projectScope && projectScope.length >= 4) {
      const needle = projectScope;
      const matches = [];
      const rest = [];
      for (const m of memories) {
        const text = (getMemoryText(m) || "").toLowerCase();
        const tags = (m.metadata?.tags || []).join(" ").toLowerCase();
        if (text.includes(needle) || tags.includes(needle)) matches.push(m);
        else rest.push(m);
      }
      memories = [...matches, ...rest];

      // If no project matches AND top memory is not strongly relevant, skip entirely.
      // This is the hard gate that kills the "vague prompt → off-topic noise" case.
      const topRel = memories[0]?.metadata?.relativity ?? 0;
      if (matches.length === 0 && topRel < STRONG_RELATIVITY) {
        process.exit(0);
      }
    } else {
      // No project scope available: require at least one strong match to inject anything.
      const topRel = memories[0]?.metadata?.relativity ?? 0;
      if (topRel < STRONG_RELATIVITY) process.exit(0);
    }

    // Format and inject top-K
    const items = memories.slice(0, INJECT_K);
    const BUDGET = 3000;
    const perItem = Math.min(MAX_CHARS, Math.floor(BUDGET / Math.max(items.length, 1)));
    const textLines = items.map((m) => {
      const text = getMemoryText(m);
      const recency = formatRecency(m);
      const truncated = text.length > perItem ? text.slice(0, perItem) + "..." : text;
      return `- ${recency ? recency + " " : ""}${truncated}`;
    }).filter((l) => l.length > 4);

    if (!textLines.length) process.exit(0);

    // Record injected IDs so we don't repeat them later in the session
    for (const m of items) if (m.id) seen.add(m.id);
    writeSeen(sessionId, seen);

    const context = `<user_memory_context>\nRelevant memories from MemDB:\n${textLines.join("\n")}\n</user_memory_context>`;

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: context,
      },
    }));
  } catch {
    // Non-fatal: silently exit on any error
    process.exit(0);
  }
}

main();
