const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const root = __dirname;
const syncRoot = path.join(root, "sync-data");
const storyQueueRoot = path.join(root, "story-queue");
const storySchemaPath = path.join(root, "tools", "story-result.schema.json");
const codexCliPath = path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
const storyJobs = new Map();
fs.mkdirSync(storyQueueRoot, { recursive: true });
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

http.createServer((req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  if (req.method === "POST" && requestUrl.pathname === "/api/review-writing") {
    handleWritingReview(req, res);
    return;
  }
  if (req.method === "POST" && requestUrl.pathname === "/api/wrong-story") {
    handleWrongStory(req, res);
    return;
  }
  if (requestUrl.pathname === "/api/sync" && (req.method === "GET" || req.method === "POST")) {
    handleSync(req, res, requestUrl);
    return;
  }

  let urlPath = decodeURIComponent(requestUrl.pathname);
  if (urlPath === "/") urlPath = "/index.html";
  if (urlPath.startsWith("/sync-data/")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const filePath = path.join(root, urlPath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream"
    });
    res.end(data);
  });
}).listen(port, host, () => {
  console.log(`Vocab trainer running at http://${host}:${port}`);
});

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function handleSync(req, res, requestUrl) {
  try {
    if (req.method === "GET") {
      const code = normalizeSyncCode(requestUrl.searchParams.get("code"));
      if (!code) {
        sendJson(res, 400, { error: "Invalid sync code" });
        return;
      }
      const filePath = syncFilePath(code);
      fs.readFile(filePath, "utf8", (error, content) => {
        if (error) {
          sendJson(res, error.code === "ENOENT" ? 404 : 500, { error: "Sync record not found" });
          return;
        }
        try {
          sendJson(res, 200, JSON.parse(content));
        } catch (parseError) {
          sendJson(res, 500, { error: "Invalid sync record" });
        }
      });
      return;
    }

    const payload = await readJson(req);
    const code = normalizeSyncCode(payload.code);
    if (!code || !payload.data || typeof payload.data !== "object") {
      sendJson(res, 400, { error: "Invalid sync payload" });
      return;
    }
    fs.mkdirSync(syncRoot, { recursive: true });
    const record = {
      updatedAt: Date.now(),
      data: payload.data
    };
    fs.writeFileSync(syncFilePath(code), JSON.stringify(record), "utf8");
    sendJson(res, 200, { ok: true, updatedAt: record.updatedAt });
  } catch (error) {
    sendJson(res, 500, { error: "Unable to save sync record" });
  }
}

function normalizeSyncCode(value) {
  const code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{6,12}$/.test(code) ? code : "";
}

function syncFilePath(code) {
  return path.join(syncRoot, `${code}.json`);
}

async function handleWritingReview(req, res) {
  try {
    const payload = await readJson(req);
    const result = process.env.OPENAI_API_KEY
      ? await reviewWithOpenAI(payload)
      : localReview(payload);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 200, localReview({ draft: "", chunks: [], error: error.message }));
  }
}

async function handleWrongStory(req, res) {
  let words = [];
  try {
    const payload = await readJson(req);
    words = normalizeStoryWords(payload.words);
    if (!words.length) {
      sendJson(res, 400, { error: "No wrong words supplied" });
      return;
    }
    const request = buildStoryRequest(payload.date, words);
    const resultPath = storyQueuePath(request.id, "result");
    const errorPath = storyQueuePath(request.id, "error");
    if (!payload.force && fs.existsSync(resultPath)) {
      const cached = validateSentenceCloze(readJsonFile(resultPath), words);
      sendJson(res, 200, cached);
      return;
    }
    if (!payload.force && fs.existsSync(errorPath)) {
      const failure = readJsonFile(errorPath);
      sendJson(res, 500, { error: failure.error || "Codex generation failed", retryable: true });
      return;
    }
    if (payload.force) {
      if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
      if (fs.existsSync(errorPath)) fs.unlinkSync(errorPath);
    }
    writeJsonFile(storyQueuePath(request.id, "request"), request);
    enqueueCodexStory(request);
    sendJson(res, 202, {
      pending: true,
      requestId: request.id,
      wordCount: words.length,
      message: "Codex 正在为每个错词生成独立语境完形"
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unable to generate sentence cloze" });
  }
}

function buildStoryRequest(dateValue, words) {
  const date = String(dateValue || new Date().toISOString().slice(0, 10));
  const cleanWords = words.map(item => ({
    word: item.word,
    meaning: item.meaning,
    category: item.category
  }));
  const fingerprint = JSON.stringify(cleanWords.map(item => [item.word, item.meaning]));
  const hash = crypto.createHash("sha256").update(`${date}\n${fingerprint}`).digest("hex").slice(0, 16);
  return {
    id: `${date}-${hash}`,
    date,
    createdAt: new Date().toISOString(),
    mode: "independent-sentence-cloze",
    words: cleanWords
  };
}

function storyQueuePath(id, kind) {
  return path.join(storyQueueRoot, `${id}.${kind}.json`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function enqueueCodexStory(request) {
  if (storyJobs.has(request.id) || fs.existsSync(storyQueuePath(request.id, "result"))) return;
  const job = runCodexStoryJob(request, 1)
    .catch(error => {
      writeJsonFile(storyQueuePath(request.id, "error"), {
        requestId: request.id,
        failedAt: new Date().toISOString(),
        error: String(error.message || error)
      });
    })
    .finally(() => storyJobs.delete(request.id));
  storyJobs.set(request.id, job);
}

async function runCodexStoryJob(request, attempt) {
  if (!fs.existsSync(codexCliPath)) throw new Error("Codex CLI is unavailable");
  const rawPath = storyQueuePath(request.id, `attempt-${attempt}`);
  const prompt = buildCodexStoryPrompt(request, attempt);
  await invokeCodex(prompt, rawPath);
  try {
    const result = validateSentenceCloze(readJsonFile(rawPath), request.words);
    writeJsonFile(storyQueuePath(request.id, "result"), result);
    if (fs.existsSync(storyQueuePath(request.id, "error"))) fs.unlinkSync(storyQueuePath(request.id, "error"));
  } catch (error) {
    if (attempt < 2) {
      await runCodexStoryJob(request, attempt + 1);
      return;
    }
    throw error;
  }
}

function invokeCodex(prompt, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      codexCliPath,
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--sandbox", "read-only",
      "--output-schema", storySchemaPath,
      "--output-last-message", outputPath,
      "-"
    ], {
      cwd: root,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let standardOutput = "";
    let errorOutput = "";
    child.stdout.on("data", chunk => {
      if (standardOutput.length < 12000) standardOutput += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      if (errorOutput.length < 8000) errorOutput += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0 && fs.existsSync(outputPath)) resolve();
      else reject(new Error(`Codex generation failed (${code}): ${(errorOutput + "\n" + standardOutput).slice(-4000)}`));
    });
    child.stdin.end(prompt, "utf8");
  });
}

function buildCodexStoryPrompt(request, attempt) {
  return `You are generating an English cloze review for a Chinese medical doctoral English learner.

Create exactly one INDEPENDENT, natural, self-contained English sentence for each supplied target word. Do not write a fairy tale, framing story, chapter, door, book, healer, or other connective filler. Sentence ${"{{1}}"} must test word 1, sentence ${"{{2}}"} must test word 2, and so on, in the exact supplied order.

Hard requirements:
1. Each English sentence must be 12-30 words, grammatically complete, and contain its own clear semantic clue.
2. Put the target placeholder exactly once in its sentence. Do not put any other placeholder in that sentence.
3. Give exactly four unique English options per question: the correct target plus three plausible same-part-of-speech distractors.
   Vary the correct answer position across questions; do not always place it first.
4. A distractor must not be any supplied target word. Across the entire exercise, never reuse a distractor.
5. There must be exactly one defensible answer after considering both grammar and meaning. Never use a synonym, near-synonym, or closely overlapping medical term as a distractor when it could also fit the sentence naturally.
6. Translate every completed sentence naturally into Chinese, mentally filling the correct target.
7. Explain in Chinese why the target fits, citing context, grammar, collocation, or register. Do not paste source material or dictionary boilerplate.
8. For all four options, give a concise Chinese meaning and a sentence-specific reason it fits or does not fit.
9. Return only JSON matching the supplied schema. This is generation attempt ${attempt}.

Supplied words:
${JSON.stringify(request.words, null, 2)}`;
}

function validateSentenceCloze(value, words) {
  if (!value || !Array.isArray(value.sentences) || !Array.isArray(value.items)) {
    throw new Error("Generated cloze is missing sentences or items");
  }
  if (value.sentences.length !== words.length || value.items.length !== words.length) {
    throw new Error("Generated cloze does not cover every wrong word exactly once");
  }
  const targetKeys = new Set(words.map(item => item.word.toLowerCase()));
  const usedDistractors = new Set();
  const sentences = [];
  const items = [];
  words.forEach((word, position) => {
    const index = position + 1;
    const sentence = value.sentences[position] || {};
    const english = String(sentence.english || "").replace(/\s+/g, " ").trim();
    const translation = String(sentence.translation || "").replace(/\s+/g, " ").trim();
    const placeholders = english.match(/\{\{\d+\}\}/g) || [];
    if (placeholders.length !== 1 || placeholders[0] !== `{{${index}}}` || !translation) {
      throw new Error(`Sentence ${index} is incomplete or uses the wrong placeholder`);
    }
    const item = value.items[position] || {};
    if (String(item.word || "").toLowerCase() !== word.word.toLowerCase()) {
      throw new Error(`Question ${index} does not match its target word`);
    }
    const options = Array.isArray(item.options) ? item.options.map(option => String(option).trim()).filter(Boolean) : [];
    const optionKeys = options.map(option => option.toLowerCase());
    if (options.length !== 4 || new Set(optionKeys).size !== 4 || !optionKeys.includes(word.word.toLowerCase())) {
      throw new Error(`Question ${index} must have four unique options including the answer`);
    }
    optionKeys.filter(key => key !== word.word.toLowerCase()).forEach(key => {
      if (targetKeys.has(key)) throw new Error(`Question ${index} reuses another wrong word as a distractor`);
      if (usedDistractors.has(key)) throw new Error(`Distractor ${key} is repeated across questions`);
      usedDistractors.add(key);
    });
    const optionAnalysis = Array.isArray(item.optionAnalysis) ? item.optionAnalysis : [];
    if (optionAnalysis.length !== 4 || !String(item.explanation || "").trim()) {
      throw new Error(`Question ${index} is missing Chinese option analysis`);
    }
    const analyzedKeys = optionAnalysis.map(entry => String(entry?.option || "").trim().toLowerCase());
    if (new Set(analyzedKeys).size !== 4 || optionKeys.some(key => !analyzedKeys.includes(key))) {
      throw new Error(`Question ${index} option analysis does not match its options`);
    }
    const normalizedAnalysis = optionAnalysis.map(entry => ({
      option: String(entry.option || "").trim(),
      meaning: String(entry.meaning || "").trim(),
      reason: String(entry.reason || "").trim()
    }));
    const analysisByOption = new Map(normalizedAnalysis.map(entry => [entry.option.toLowerCase(), entry]));
    const shuffledOptions = deterministicOptionOrder(options, index);
    sentences.push({ index, english, translation });
    items.push({
      index,
      word: word.word,
      meaning: word.meaning,
      options: shuffledOptions,
      explanation: String(item.explanation).trim(),
      optionAnalysis: shuffledOptions.map(option => analysisByOption.get(option.toLowerCase()))
    });
  });
  return {
    source: "codex",
    version: 3,
    optionOrderVersion: 1,
    mode: "independent-sentence-cloze",
    title: "今日错词语境完形",
    story: sentences.map(sentence => sentence.english).join(" "),
    sentences,
    items
  };
}

function deterministicOptionOrder(options, index) {
  return [...options].sort((left, right) => {
    const leftHash = crypto.createHash("sha256").update(`${index}:${left.toLowerCase()}`).digest("hex");
    const rightHash = crypto.createHash("sha256").update(`${index}:${right.toLowerCase()}`).digest("hex");
    return leftHash.localeCompare(rightHash);
  });
}

function normalizeStoryWords(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, 50).map(item => ({
    word: String(item?.word || "").trim(),
    meaning: String(item?.meaning || "").trim(),
    category: String(item?.category || "").trim(),
    example: String(item?.example || "").replace(/\s+/g, " ").trim().slice(0, 400)
  })).filter(item => {
    const key = item.word.toLowerCase();
    if (!key || !item.meaning || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function reviewWithOpenAI(payload) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "You are a strict but supportive medical doctoral English writing tutor. Return only valid JSON."
        },
        {
          role: "user",
          content: `请审查医学博士英语翻译/写作仿写。\n中文：${payload.chinese || ""}\n学生英文：${payload.draft || ""}\n参考译文：${payload.reference || ""}\n核心词块：${(payload.chunks || []).join("; ")}\n\n返回 JSON：{"feedback":"中文总体意见","revised":"修改后的英文句子","issues":[{"word":"需要加入默写的英文词或词块","meaning":"中文意思","reason":"为什么加入","collocation":"常见搭配","example":"短例句"}]}。issues 只放学生不会写、拼写错误、或本句最该掌握的医学/学术表达，最多5个。`
        }
      ],
      temperature: 0.2
    })
  });
  if (!response.ok) throw new Error(`OpenAI review failed: ${response.status}`);
  const data = await response.json();
  const text = data.output_text || data.output?.flatMap(item => item.content || []).map(item => item.text || "").join("") || "";
  return normalizeReview(JSON.parse(text));
}

function localReview(payload) {
  const draft = normalizeText(payload.draft || "");
  const issues = [];
  (payload.chunks || []).forEach(chunk => {
    const key = String(chunk || "").split(/\s+/).slice(0, 2).join(" ");
    if (key && !draft.includes(normalizeText(key))) {
      issues.push({
        word: chunk,
        meaning: "核心词块",
        reason: "句子里可能缺少这个医学考试常用表达。",
        collocation: chunk,
        example: payload.reference || ""
      });
    }
  });
  return {
    source: "local",
    feedback: payload.error
      ? `暂时不能连接AI审查，已先做本地基础检查：${payload.error}`
      : "已先做本地基础检查：主要看核心词块是否覆盖。配置 OPENAI_API_KEY 后可获得更细的语法和表达修改。",
    revised: payload.draft || "",
    issues: issues.slice(0, 5)
  };
}

function normalizeReview(value) {
  return {
    source: "ai",
    feedback: String(value.feedback || "已完成审查。"),
    revised: String(value.revised || ""),
    issues: Array.isArray(value.issues) ? value.issues.slice(0, 5).map(issue => ({
      word: String(issue.word || ""),
      meaning: String(issue.meaning || ""),
      reason: String(issue.reason || ""),
      collocation: String(issue.collocation || issue.word || ""),
      example: String(issue.example || "")
    })) : []
  };
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}
