const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const buildDir = path.resolve(root, "..", "build", "example-generation");
const wordsPath = path.join(dataDir, "words.json");
const wordsJsPath = path.join(dataDir, "words.js");
const schemaPath = path.join(__dirname, "example-result.schema.json");
const codexCliPath = path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
const batchSize = 20;
const concurrency = 6;

fs.mkdirSync(buildDir, { recursive: true });

function isPlaceholder(item) {
  return /^Researchers discussed the term \"[^\"]+\" in the clinical report\.$/.test(String(item.example || ""));
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function wordCount(value) {
  return (String(value).match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || []).length;
}

function containsTarget(sentence, target) {
  const forms = [target.word, ...(target.forms || []).map(item => item.form)].filter(Boolean);
  return forms.some(form => {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`, "i").test(sentence);
  });
}

function validateResult(value, batch) {
  if (!value || !Array.isArray(value.items) || value.items.length !== batch.length) {
    throw new Error("The generated batch does not cover every target word");
  }
  return batch.map((target, index) => {
    const item = value.items[index] || {};
    const sentence = normalizeSpace(item.sentence);
    const translation = normalizeSpace(item.translation);
    if (String(item.word || "").toLowerCase() !== target.word.toLowerCase()) {
      throw new Error(`Item ${index + 1} does not match ${target.word}`);
    }
    if (!containsTarget(sentence, target)) {
      throw new Error(`Sentence for ${target.word} does not contain a recorded family form`);
    }
    if (wordCount(sentence) < 10 || wordCount(sentence) > 28 || !/[.!?]$/.test(sentence)) {
      throw new Error(`Sentence for ${target.word} is not a complete 10-28 word sentence`);
    }
    if (!translation || /Researchers discussed|clinical report|the term/i.test(sentence)) {
      throw new Error(`Sentence for ${target.word} is generic or untranslated`);
    }
    return { word: target.word, sentence, translation };
  });
}

function buildPrompt(batch, attempt) {
  const inputs = batch.map(item => ({
    word: item.word,
    chineseMeaning: item.meaning,
    forms: (item.forms || []).slice(0, 8).map(form => form.form),
    trueExamCollocations: item.memory?.collocations || [],
    medical: Boolean(item.medical),
    writingRequired: Boolean(item.writingRequired)
  }));
  return `You are improving example sentences for a Chinese medical doctoral English vocabulary app.

Create exactly one natural, self-contained English example sentence and one accurate Chinese translation for every supplied word, in the exact input order.

Hard requirements:
1. Use either the target headword or one of its supplied family forms at least once. Choose the form that makes the sentence most natural.
2. Each sentence must be 10-28 English words and grammatically complete.
3. Demonstrate the word's common meaning and natural collocation. The surrounding context must make the meaning inferable.
4. Prefer realistic medical, public-health, academic, workplace, or everyday contexts as appropriate. Do not force a medical context onto a general word.
5. Never write dictionary meta-language such as "the term", "the word", "means", "was discussed", or "in the clinical report".
6. Do not produce vague filler, quotations, fragments, definitions disguised as sentences, or the same sentence frame repeatedly.
7. If true-exam collocations are supplied and semantically sound, prefer them, but do not copy a fragment as a full sentence.
8. Translate the completed sentence naturally into Chinese, preserving the target word's sense.
9. Return only JSON matching the supplied schema. This is attempt ${attempt}.

Targets:
${JSON.stringify(inputs, null, 2)}`;
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
      "--output-schema", schemaPath,
      "--output-last-message", outputPath,
      "-"
    ], { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { if (stderr.length < 12000) stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0 && fs.existsSync(outputPath)) resolve();
      else reject(new Error(`Codex generation failed (${code}): ${stderr.slice(-4000)}`));
    });
    child.stdin.end(prompt, "utf8");
  });
}

async function generateBatch(batch, batchIndex) {
  const finalPath = path.join(buildDir, `batch-${String(batchIndex).padStart(3, "0")}.json`);
  if (fs.existsSync(finalPath)) {
    try { return validateResult(JSON.parse(fs.readFileSync(finalPath, "utf8")), batch); } catch (_) {}
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const rawPath = path.join(buildDir, `batch-${String(batchIndex).padStart(3, "0")}-attempt-${attempt}.json`);
    try {
      if (!fs.existsSync(rawPath)) await invokeCodex(buildPrompt(batch, attempt), rawPath);
      const validated = validateResult(JSON.parse(fs.readFileSync(rawPath, "utf8")), batch);
      fs.writeFileSync(finalPath, JSON.stringify({ items: validated }, null, 2), "utf8");
      return validated;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
      process.stdout.write(`completed ${index + 1}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  if (!fs.existsSync(codexCliPath)) throw new Error("Codex CLI is unavailable");
  const words = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
  const targets = words.filter(isPlaceholder);
  const batches = [];
  for (let index = 0; index < targets.length; index += batchSize) batches.push(targets.slice(index, index + batchSize));
  const generatedBatches = await mapConcurrent(batches, concurrency, generateBatch);
  const generated = new Map(generatedBatches.flat().map(item => [item.word.toLowerCase(), item]));
  let updated = 0;
  words.forEach(word => {
    if (!isPlaceholder(word)) return;
    const replacement = generated.get(word.word.toLowerCase());
    if (!replacement) return;
    word.example = replacement.sentence;
    word.exampleTranslation = replacement.translation;
    word.exampleSource = {
      year: null,
      type: "AI补充例句",
      role: "词义语境",
      question: "",
      sourceFile: "Codex生成并自动校验",
      confidence: "generated"
    };
    word.exampleTranslationSource = "Codex bilingual generation";
    updated += 1;
  });
  const payload = JSON.stringify(words);
  fs.writeFileSync(wordsPath, `${payload}\n`, "utf8");
  fs.writeFileSync(wordsJsPath, `window.DEFAULT_WORDS = ${payload};\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ targets: targets.length, updated, remainingPlaceholders: words.filter(isPlaceholder).length })}\n`);
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
