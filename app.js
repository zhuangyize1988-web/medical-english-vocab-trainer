const state = {
  words: [],
  current: null,
  currentForm: null,
  mode: "en-cn",
  daily: null,
  locked: false,
  stage: "recall",
  recallMark: null,
  contextUtterance: "",
  writingDaily: null,
  writingProgress: JSON.parse(localStorage.getItem("medicalWritingProgress") || "{}"),
  writingWordProgress: JSON.parse(localStorage.getItem("medicalWritingWordProgress") || "{}"),
  writingCustomWords: JSON.parse(localStorage.getItem("medicalWritingCustomWords") || "[]"),
  sessionDone: 0,
  sessionCorrect: 0,
  wrong: JSON.parse(localStorage.getItem("medicalVocabWrongBook") || "[]"),
  memory: JSON.parse(localStorage.getItem("medicalVocabMemory") || "{}"),
  voices: [],
  voice: null,
  utterance: null,
  audio: null,
  pendingSpeech: "",
  speechUnlocked: !isLikelyMobileDevice() && Boolean(window.speechSynthesis),
  preview: false,
  previewDeck: [],
  previewIndex: 0
};

const els = {
  deckMeta: document.querySelector("#deckMeta"),
  todayDone: document.querySelector("#todayDone"),
  accuracy: document.querySelector("#accuracy"),
  dueCount: document.querySelector("#dueCount"),
  category: document.querySelector("#category"),
  promptWord: document.querySelector("#promptWord"),
  promptHint: document.querySelector("#promptHint"),
  examMeta: document.querySelector("#examMeta"),
  examBadges: document.querySelector("#examBadges"),
  familyForms: document.querySelector("#familyForms"),
  evidenceBtn: document.querySelector("#evidenceBtn"),
  evidenceList: document.querySelector("#evidenceList"),
  personalNoteBtn: document.querySelector("#personalNoteBtn"),
  personalNoteEditor: document.querySelector("#personalNoteEditor"),
  personalNoteInput: document.querySelector("#personalNoteInput"),
  savePersonalNoteBtn: document.querySelector("#savePersonalNoteBtn"),
  cancelPersonalNoteBtn: document.querySelector("#cancelPersonalNoteBtn"),
  recallMemory: document.querySelector("#recallMemory"),
  recallMemoryText: document.querySelector("#recallMemoryText"),
  options: document.querySelector("#options"),
  recallActions: document.querySelector("#recallActions"),
  contextPanel: document.querySelector("#contextPanel"),
  contextText: document.querySelector("#contextText"),
  memoryTip: document.querySelector("#memoryTip"),
  resultPanel: document.querySelector("#resultPanel"),
  resultText: document.querySelector("#resultText"),
  familyMeaningList: document.querySelector("#familyMeaningList"),
  exampleText: document.querySelector("#exampleText"),
  wrongList: document.querySelector("#wrongList"),
  writingMeta: document.querySelector("#writingMeta"),
  writingWords: document.querySelector("#writingWords"),
  writingSentences: document.querySelector("#writingSentences"),
  wrongStoryStatus: document.querySelector("#wrongStoryStatus"),
  wrongStoryContent: document.querySelector("#wrongStoryContent"),
  generateStoryBtn: document.querySelector("#generateStoryBtn"),
  submitStoryBtn: document.querySelector("#submitStoryBtn"),
  resetWritingBtn: document.querySelector("#resetWritingBtn"),
  fileInput: document.querySelector("#fileInput"),
  voiceSelect: document.querySelector("#voiceSelect"),
  speakBtn: document.querySelector("#speakBtn"),
  previewBtn: document.querySelector("#previewBtn"),
  againBtn: document.querySelector("#againBtn"),
  knownBtn: document.querySelector("#knownBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  syncCode: document.querySelector("#syncCode"),
  generateSyncBtn: document.querySelector("#generateSyncBtn"),
  connectSyncBtn: document.querySelector("#connectSyncBtn"),
  syncStatus: document.querySelector("#syncStatus"),
  moreSettings: document.querySelector(".more-settings"),
  mobileNavButtons: [...document.querySelectorAll(".mobile-nav-button")]
};
els.knowBtn = document.querySelector("#knowBtn");
els.hintBtn = document.querySelector("#hintBtn");
els.contextSpeakBtn = document.querySelector("#contextSpeakBtn");
els.choiceBtn = document.querySelector("#choiceBtn");

const intervals = [1, 2, 4, 7, 15, 30, 60, 120];
const DAILY_WORD_LIMIT = 70;
const HISTORICAL_REVIEW_LIMIT = 20;
const DAILY_SESSION_VERSION = 4;
const CATALOG_MIGRATION_VERSION = 3;
const MEMORY_NOTES_VERSION = Math.max(6, Number(window.MEMORY_NOTES_VERSION || 0));
const WRITING_WORD_LIMIT = 5;
const WRITING_SENTENCE_LIMIT = 1;
const syncStorageKeys = [
  "medicalVocabMemory",
  "medicalVocabWrongBook",
  "medicalVocabDaily",
  "medicalWritingDaily",
  "medicalWritingProgress",
  "medicalWritingWordProgress",
  "medicalWritingCustomWords"
];
const syncState = {
  code: localStorage.getItem("medicalVocabSyncCode") || "",
  timer: null,
  poller: null,
  busy: false,
  ready: false
};
const cloudSyncConfig = {
  url: String(window.CLOUD_SYNC_CONFIG?.url || "").replace(/\/$/, ""),
  publishableKey: String(window.CLOUD_SYNC_CONFIG?.publishableKey || "")
};
let nextTimer = null;
let storyRequestInFlight = false;
let storyGenerationPending = false;
let storyGenerationError = "";
let storyPollTimer = null;

init();

async function init() {
  state.words = Array.isArray(window.DEFAULT_WORDS) ? window.DEFAULT_WORDS : [];
  try {
    const response = await fetch("data/words.json");
    if (response.ok) state.words = await response.json();
  } catch (error) {
    // Local file opening blocks fetch in some browsers; words.js covers that case.
  }
  migrateFamilyProgress();
  normalizeMemoryRecords();
  loadVoices();
  window.setTimeout(loadVoices, 300);
  window.setTimeout(loadVoices, 1200);
  buildDailySession();
  bindEvents();
  initMobileNavigation();
  initSync();
  renderWrongList();
  renderWrongStory();
  buildWritingSession();
  renderWritingPanel();
  renderCard();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  document.addEventListener("pointerdown", unlockSpeech, { capture: true, once: true });
  document.addEventListener("touchstart", unlockSpeech, { capture: true, once: true, passive: true });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

function bindEvents() {
  document.querySelectorAll(".mode").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      state.mode = button.dataset.mode;
      state.locked = false;
      renderCard();
    });
  });

  els.speakBtn.addEventListener("click", () => speak(currentAnswerText()));
  els.previewBtn.addEventListener("click", togglePreview);
  els.knowBtn.addEventListener("click", revealMeaning);
  els.hintBtn.addEventListener("click", showContextHint);
  els.contextSpeakBtn.addEventListener("click", () => speak(state.contextUtterance || state.current.example || state.current.word));
  els.choiceBtn.addEventListener("click", () => revealChoices("hint"));
  els.evidenceBtn.addEventListener("click", toggleEvidence);
  els.personalNoteBtn.addEventListener("click", togglePersonalNoteEditor);
  els.savePersonalNoteBtn.addEventListener("click", savePersonalNote);
  els.cancelPersonalNoteBtn.addEventListener("click", closePersonalNoteEditor);
  els.personalNoteInput.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") savePersonalNote();
  });
  els.againBtn.addEventListener("click", markWrongAndNext);
  els.knownBtn.addEventListener("click", () => {
    grade("known");
    advanceCard();
  });
  els.resetBtn.addEventListener("click", resetProgress);
  els.resetWritingBtn.addEventListener("click", resetWritingToday);
  els.generateStoryBtn.addEventListener("click", () => ensureWrongStory(true));
  els.submitStoryBtn.addEventListener("click", submitWrongStory);
  els.fileInput.addEventListener("change", importFile);
  els.voiceSelect.addEventListener("change", () => {
    localStorage.setItem("medicalVocabVoice", els.voiceSelect.value);
    state.voice = state.voices.find(voice => voice.name === els.voiceSelect.value) || state.voice;
    speak(currentAnswerText());
  });
  els.generateSyncBtn.addEventListener("click", generateSyncCode);
  els.connectSyncBtn.addEventListener("click", connectSync);
  els.syncCode.addEventListener("input", event => {
    event.target.value = normalizeSyncCode(event.target.value);
  });
}

function initMobileNavigation() {
  const mobileQuery = window.matchMedia("(max-width: 760px)");
  els.moreSettings.open = !mobileQuery.matches;
  mobileQuery.addEventListener("change", event => {
    els.moreSettings.open = !event.matches;
  });
  const saved = localStorage.getItem("medicalVocabMobileView");
  const initial = ["study", "writing", "wrong"].includes(saved) ? saved : "study";
  setMobileView(initial, false);
  els.mobileNavButtons.forEach(button => {
    button.addEventListener("click", () => setMobileView(button.dataset.mobileView));
  });
}

function setMobileView(view, moveToTop = true) {
  document.body.dataset.mobileView = view;
  localStorage.setItem("medicalVocabMobileView", view);
  els.mobileNavButtons.forEach(button => {
    const active = button.dataset.mobileView === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (moveToTop && window.matchMedia("(max-width: 760px)").matches) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function initSync() {
  els.syncCode.value = syncState.code;
  renderSyncCodeLock();
  if (!syncState.code) {
    setSyncStatus("尚未连接");
    return;
  }
  syncState.ready = true;
  startSyncWatchers();
  synchronizeInitial();
}

function generateSyncCode() {
  if (syncState.code && els.syncCode.readOnly) {
    const confirmed = confirm("当前同步码已绑定学习档案。只有确实要切换档案时才继续；原学习记录不会删除。是否准备更换同步码？");
    if (!confirmed) return;
    els.syncCode.readOnly = false;
    els.syncCode.value = "";
    els.generateSyncBtn.textContent = "生成新码";
    setSyncStatus("请输入原同步码，或再次点击生成新码");
    els.syncCode.focus();
    return;
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = [...bytes].map(value => alphabet[value % alphabet.length]).join("");
  els.syncCode.value = code;
  connectSync();
}

function normalizeSyncCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function connectSync() {
  const code = normalizeSyncCode(els.syncCode.value);
  if (code.length < 6) {
    setSyncStatus("同步码至少6位", true);
    return;
  }
  syncState.code = code;
  syncState.ready = true;
  startSyncWatchers();
  els.syncCode.value = code;
  localStorage.setItem("medicalVocabSyncCode", code);
  renderSyncCodeLock();
  synchronizeInitial();
}

function renderSyncCodeLock() {
  const locked = Boolean(syncState.code);
  els.syncCode.readOnly = locked;
  els.generateSyncBtn.textContent = locked ? "更换" : "生成";
  els.generateSyncBtn.title = locked ? "更换同步码需要再次确认" : "生成新的学习同步码";
}

function startSyncWatchers() {
  if (syncState.poller) return;
  window.addEventListener("focus", synchronizeInitial);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) synchronizeInitial();
  });
  syncState.poller = setInterval(synchronizeInitial, 30000);
}

async function synchronizeInitial() {
  if (!syncState.code || syncState.busy) return;
  syncState.busy = true;
  setSyncStatus("正在同步...");
  try {
    const remote = await fetchSyncBundle(syncState.code);
    if (!remote) {
      syncState.busy = false;
      await pushSyncNow();
      return;
    }
    const lastSync = getLastSyncAt();
    const localChanged = Number(localStorage.getItem("medicalVocabLocalChangedAt") || 0);
    if (remote.updatedAt > lastSync) {
      const merged = mergeSyncData(remote.data || {}, collectSyncData());
      applySyncData(merged, remote.updatedAt);
      return;
    }
    if (localChanged > lastSync) {
      syncState.busy = false;
      await pushSyncNow();
      return;
    }
    const summary = summarizeSyncData(remote.data || collectSyncData());
    setSyncStatus(`已同步：累计 ${summary.learned} 词，保留14天恢复点`);
  } catch (error) {
    setSyncStatus("当前地址暂不能同步", true);
  } finally {
    syncState.busy = false;
  }
}

function collectSyncData() {
  const data = {};
  syncStorageKeys.forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    try {
      data[key] = JSON.parse(raw);
    } catch (error) {
      data[key] = raw;
    }
  });
  return data;
}

function applySyncData(data, updatedAt) {
  syncStorageKeys.forEach(key => {
    if (data[key] !== undefined) localStorage.setItem(key, JSON.stringify(data[key]));
  });
  setLastSyncAt(updatedAt || Date.now());
  localStorage.setItem("medicalVocabLocalChangedAt", String(Date.now()));
  setSyncStatus("已合并，正在刷新...");
  window.location.reload();
}

function scheduleSync() {
  if (!syncState.ready || !syncState.code) return;
  saveLocalRecoveryPoint();
  localStorage.setItem("medicalVocabLocalChangedAt", String(Date.now()));
  clearTimeout(syncState.timer);
  syncState.timer = setTimeout(pushSyncNow, 900);
}

function saveLocalRecoveryPoint() {
  const data = collectSyncData();
  const summary = summarizeSyncData(data);
  if (!summary.learned && !summary.totalSeen) return;
  const key = `medicalVocabRecovery:${getTodayKey()}`;
  const existing = localStorage.getItem(key);
  let merged = data;
  if (existing) {
    try {
      merged = mergeSyncData(JSON.parse(existing)?.data || {}, data);
    } catch (error) {
      merged = data;
    }
  }
  localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data: merged }));
  Object.keys(localStorage)
    .filter(item => item.startsWith("medicalVocabRecovery:"))
    .sort()
    .slice(0, -14)
    .forEach(item => localStorage.removeItem(item));
}

async function pushSyncNow() {
  if (!syncState.code) return;
  if (syncState.busy) {
    clearTimeout(syncState.timer);
    syncState.timer = setTimeout(pushSyncNow, 1200);
    return;
  }
  syncState.busy = true;
  setSyncStatus("正在保存...");
  try {
    let dataToSave = collectSyncData();
    const remote = await fetchSyncBundle(syncState.code);
    if (remote) dataToSave = mergeSyncData(remote.data || {}, dataToSave);
    await writeSyncBackup(syncState.code, dataToSave);
    const result = await writeSyncRecord(syncState.code, dataToSave);
    persistMergedSyncData(dataToSave);
    setLastSyncAt(result.updatedAt || Date.now());
    localStorage.removeItem("medicalVocabLocalChangedAt");
    const summary = summarizeSyncData(dataToSave);
    setSyncStatus(`已同步：累计 ${summary.learned} 词，保留14天恢复点`);
  } catch (error) {
    setSyncStatus("保存失败，稍后重试", true);
  } finally {
    syncState.busy = false;
  }
}

function persistMergedSyncData(data) {
  syncStorageKeys.forEach(key => {
    if (data[key] !== undefined) localStorage.setItem(key, JSON.stringify(data[key]));
  });
}

function getLastSyncAt() {
  if (!syncState.code) return 0;
  return Number(localStorage.getItem(`medicalVocabLastSyncAt:${syncState.code}`) || 0);
}

function setLastSyncAt(timestamp) {
  if (!syncState.code) return;
  localStorage.setItem(`medicalVocabLastSyncAt:${syncState.code}`, String(timestamp));
}

function hasCloudSync() {
  return Boolean(cloudSyncConfig.url && cloudSyncConfig.publishableKey);
}

async function fetchSyncRecord(code) {
  if (!hasCloudSync()) {
    const response = await fetch(`/api/sync?code=${encodeURIComponent(code)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("sync unavailable");
    return response.json();
  }
  const syncId = await hashSyncCode(code);
  const rows = await callCloudSync("get_vocab_sync", { p_sync_id: syncId });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;
  return {
    data: row.payload || {},
    updatedAt: Number(row.updated_at || 0)
  };
}

async function fetchSyncBundle(code) {
  const main = await fetchSyncRecord(code);
  if (!hasCloudSync()) return main;
  const backups = await Promise.all(
    recentBackupKeys(14).map(key => fetchCloudRecordById(hashSyncNamespace(code, key)).catch(() => null))
  );
  const records = [main, ...backups].filter(Boolean);
  if (!records.length) return null;
  const data = records.reduce((merged, record) => mergeSyncData(merged, record.data || {}), {});
  return {
    data,
    updatedAt: Math.max(...records.map(record => Number(record.updatedAt || 0)))
  };
}

async function writeSyncRecord(code, data) {
  if (!hasCloudSync()) {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, data })
    });
    if (!response.ok) throw new Error("sync unavailable");
    return response.json();
  }
  const syncId = await hashSyncCode(code);
  const rows = await callCloudSync("upsert_vocab_sync", {
    p_sync_id: syncId,
    p_payload: data
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { updatedAt: Number(row?.updated_at || Date.now()) };
}

async function writeSyncBackup(code, data) {
  if (!hasCloudSync()) return;
  const backupId = await hashSyncNamespace(code, recentBackupKeys(1)[0]);
  const existing = await fetchCloudRecordById(backupId).catch(() => null);
  const merged = existing ? mergeSyncData(existing.data || {}, data) : data;
  await writeCloudRecordById(backupId, merged);
}

async function fetchCloudRecordById(syncIdPromise) {
  const syncId = await syncIdPromise;
  const rows = await callCloudSync("get_vocab_sync", { p_sync_id: syncId });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;
  return { data: row.payload || {}, updatedAt: Number(row.updated_at || 0) };
}

async function writeCloudRecordById(syncId, data) {
  const rows = await callCloudSync("upsert_vocab_sync", {
    p_sync_id: syncId,
    p_payload: data
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { updatedAt: Number(row?.updated_at || Date.now()) };
}

function recentBackupKeys(days) {
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return `daily-backup:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
}

function summarizeSyncData(data) {
  const records = Object.values(data?.medicalVocabMemory || {});
  return {
    learned: records.filter(record => Number(record?.seen || 0) > 0).length,
    totalSeen: records.reduce((sum, record) => sum + Number(record?.seen || 0), 0)
  };
}

async function callCloudSync(functionName, payload) {
  const response = await fetch(`${cloudSyncConfig.url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: cloudSyncConfig.publishableKey
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`cloud sync unavailable (${response.status})`);
  return response.json();
}

async function hashSyncCode(code) {
  const bytes = new TextEncoder().encode(`medical-vocab-sync:${normalizeSyncCode(code)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function hashSyncNamespace(code, namespace) {
  const normalizedCode = normalizeSyncCode(code);
  const bytes = new TextEncoder().encode(`medical-vocab-sync:${normalizedCode}:${namespace}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function mergeSyncData(remote, local) {
  const memory = mergeVocabularyMemory(remote.medicalVocabMemory, local.medicalVocabMemory);
  let daily = mergeDailyRecord(remote.medicalVocabDaily, local.medicalVocabDaily);
  const untouchedDailyNeedsRebuild = daily &&
    !daily.completed &&
    Number(daily.index || 0) === 0 &&
    Number(daily.scheduledReviewIndex || 0) === 0 &&
    Array.isArray(daily.deck) &&
    daily.deck.some(key => memory[key]);
  if (untouchedDailyNeedsRebuild) daily = null;
  return {
    medicalVocabMemory: memory,
    medicalVocabWrongBook: uniqueList(remote.medicalVocabWrongBook, local.medicalVocabWrongBook),
    medicalVocabDaily: daily,
    medicalWritingDaily: mergeWritingDaily(remote.medicalWritingDaily, local.medicalWritingDaily),
    medicalWritingProgress: mergeProgressRecords(remote.medicalWritingProgress, local.medicalWritingProgress, "updatedAt"),
    medicalWritingWordProgress: mergeProgressRecords(remote.medicalWritingWordProgress, local.medicalWritingWordProgress, "checkedAt"),
    medicalWritingCustomWords: mergeWritingWordLists(remote.medicalWritingCustomWords, local.medicalWritingCustomWords)
  };
}

function mergeVocabularyMemory(remote = {}, local = {}) {
  const merged = mergeProgressRecords(remote, local, "updatedAt");
  const keys = new Set([...Object.keys(remote || {}), ...Object.keys(local || {})]);
  keys.forEach(key => {
    const remoteRecord = normalizeMemoryRecord(remote?.[key]);
    const localRecord = normalizeMemoryRecord(local?.[key]);
    const latestRecord = localRecord.updatedAt >= remoteRecord.updatedAt ? localRecord : remoteRecord;
    const latestNote = localRecord.personalNoteUpdatedAt >= remoteRecord.personalNoteUpdatedAt
      ? localRecord
      : remoteRecord;
    const formStats = mergeFormStats(remoteRecord.formStats, localRecord.formStats);
    const history = mergeAnswerHistory(remoteRecord.history, localRecord.history);
    merged[key] = {
      ...latestRecord,
      seen: Math.max(remoteRecord.seen, localRecord.seen),
      correct: Math.max(remoteRecord.correct, localRecord.correct),
      wrongCount: Math.max(remoteRecord.wrongCount, localRecord.wrongCount),
      lapseScore: Math.max(remoteRecord.lapseScore, localRecord.lapseScore),
      lastWrongAt: Math.max(remoteRecord.lastWrongAt, localRecord.lastWrongAt),
      mastered: remoteRecord.mastered || localRecord.mastered,
      personalNote: latestNote.personalNote,
      personalNoteUpdatedAt: latestNote.personalNoteUpdatedAt,
      history,
      formStats
    };
  });
  return merged;
}

function mergeFormStats(remote = {}, local = {}) {
  const merged = {};
  const keys = new Set([...Object.keys(remote || {}), ...Object.keys(local || {})]);
  keys.forEach(key => {
    const a = remote?.[key] || {};
    const b = local?.[key] || {};
    merged[key] = {
      seen: Math.max(Number(a.seen || 0), Number(b.seen || 0)),
      correct: Math.max(Number(a.correct || 0), Number(b.correct || 0)),
      wrongCount: Math.max(Number(a.wrongCount || 0), Number(b.wrongCount || 0)),
      lastSeen: Math.max(Number(a.lastSeen || 0), Number(b.lastSeen || 0))
    };
  });
  return merged;
}

function mergeAnswerHistory(remote = [], local = []) {
  const events = new Map();
  [...remote, ...local].forEach(event => {
    const key = `${Number(event?.at || 0)}:${String(event?.result || "")}:${Number(event?.level || 0)}`;
    events.set(key, event);
  });
  return [...events.values()].sort((a, b) => Number(a?.at || 0) - Number(b?.at || 0)).slice(-30);
}

function mergeProgressRecords(remote = {}, local = {}, scoreField) {
  const merged = { ...(remote || {}) };
  Object.entries(local || {}).forEach(([key, value]) => {
    const current = merged[key];
    const localScore = Number(value?.[scoreField] || value?.level || 0);
    const remoteScore = Number(current?.[scoreField] || current?.level || 0);
    if (!current || localScore >= remoteScore) merged[key] = value;
  });
  return merged;
}

function mergeDailyRecord(remote, local) {
  if (!remote) return local || null;
  if (!local) return remote;
  if (remote.date !== local.date || remote.signature !== local.signature) {
    return String(local.date || "") > String(remote.date || "") ? local : remote;
  }
  const phaseScore = { "scheduled-review": 0, study: 10000, review: 20000, done: 30000 };
  const score = item => (item.completed ? 100000 : 0) + (phaseScore[item.phase] || 0) + Number(item.scheduledReviewIndex || 0) + Number(item.index || 0) + Number(item.reviewIndex || 0);
  const best = score(local) >= score(remote) ? local : remote;
  return {
    ...best,
    scheduledReviewQueue: uniqueList(remote.scheduledReviewQueue, local.scheduledReviewQueue),
    wrongToday: uniqueList(remote.wrongToday, local.wrongToday),
    mistakesToday: uniqueList(remote.mistakesToday || remote.wrongToday, local.mistakesToday || local.wrongToday),
    story: local.story || remote.story || null,
    storyAnswers: { ...(remote.storyAnswers || {}), ...(local.storyAnswers || {}) },
    storySubmitted: Boolean(remote.storySubmitted || local.storySubmitted)
  };
}

function mergeWritingDaily(remote, local) {
  if (!remote) return local || null;
  if (!local) return remote;
  if (remote.date !== local.date || remote.signature !== local.signature) {
    return String(local.date || "") > String(remote.date || "") ? local : remote;
  }
  return {
    ...remote,
    ...local,
    words: uniqueList(remote.words, local.words).slice(0, WRITING_WORD_LIMIT),
    sentences: uniqueList(remote.sentences, local.sentences).slice(0, WRITING_SENTENCE_LIMIT),
    wordRevealed: uniqueList(remote.wordRevealed, local.wordRevealed),
    revealed: uniqueList(remote.revealed, local.revealed),
    completed: uniqueList(remote.completed, local.completed),
    wordDrafts: { ...(remote.wordDrafts || {}), ...(local.wordDrafts || {}) },
    wordResults: mergeProgressRecords(remote.wordResults, local.wordResults, "checkedAt")
  };
}

function uniqueList(first = [], second = []) {
  return [...new Set([...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])])];
}

function mergeWritingWordLists(remote = [], local = []) {
  const map = new Map();
  [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])].forEach(item => {
    if (item?.word) map.set(normalizeAnswer(item.word), item);
  });
  return [...map.values()];
}

function setSyncStatus(text, isError = false) {
  els.syncStatus.textContent = text;
  els.syncStatus.classList.toggle("error", isError);
}

function migrateFamilyProgress() {
  if (Number(localStorage.getItem("medicalVocabCatalogMigration") || 0) >= CATALOG_MIGRATION_VERSION) return;
  const aliases = window.WORD_FAMILY_ALIASES || {};
  const backup = {};
  ["medicalVocabMemory", "medicalVocabWrongBook", "medicalVocabDaily", "medicalWritingDaily", "medicalWritingProgress", "medicalWritingWordProgress"].forEach(key => {
    backup[key] = localStorage.getItem(key);
  });
  localStorage.setItem(`medicalVocabBackupBeforeFamilyV${CATALOG_MIGRATION_VERSION}`, JSON.stringify({ at: Date.now(), data: backup }));

  const merged = {};
  Object.entries(state.memory || {}).forEach(([oldKey, raw]) => {
    const normalizedKey = String(oldKey).toLowerCase();
    const familyKey = aliases[normalizedKey] || normalizedKey;
    const record = normalizeMemoryRecord(raw);
    const previous = merged[familyKey];
    const formStats = {
      ...(previous?.formStats || {}),
      ...(record.formStats || {}),
      [normalizedKey]: {
        seen: Number(record.seen || 0),
        correct: Number(record.correct || 0),
        wrongCount: Number(record.wrongCount || 0),
        lastSeen: Number(record.lastSeen || 0)
      }
    };
    if (!previous) {
      merged[familyKey] = { ...record, formStats };
      return;
    }
    merged[familyKey] = {
      ...previous,
      level: Math.min(previous.level, record.level),
      seen: previous.seen + record.seen,
      correct: previous.correct + record.correct,
      wrongCount: previous.wrongCount + record.wrongCount,
      consecutiveCorrect: Math.min(previous.consecutiveCorrect, record.consecutiveCorrect),
      lapseScore: previous.lapseScore + record.lapseScore,
      due: Math.min(...([previous.due, record.due].filter(Boolean).length ? [previous.due, record.due].filter(Boolean) : [0])),
      firstSeenDate: [previous.firstSeenDate, record.firstSeenDate].filter(Boolean).sort()[0] || "",
      lastSeen: Math.max(previous.lastSeen, record.lastSeen),
      lastWrongAt: Math.max(previous.lastWrongAt, record.lastWrongAt),
      lastWrongDate: previous.lastWrongAt >= record.lastWrongAt ? previous.lastWrongDate : record.lastWrongDate,
      updatedAt: Math.max(previous.updatedAt, record.updatedAt),
      mastered: previous.mastered && record.mastered,
      personalNote: previous.personalNoteUpdatedAt >= record.personalNoteUpdatedAt ? previous.personalNote : record.personalNote,
      personalNoteUpdatedAt: Math.max(previous.personalNoteUpdatedAt, record.personalNoteUpdatedAt),
      history: [...previous.history, ...record.history].sort((a, b) => Number(a.at || 0) - Number(b.at || 0)).slice(-30),
      formStats
    };
  });
  state.memory = merged;
  state.wrong = uniqueList(state.wrong.map(key => aliases[String(key).toLowerCase()] || String(key).toLowerCase()));

  const saved = JSON.parse(localStorage.getItem("medicalVocabDaily") || "null");
  if (saved && saved.date === getTodayKey()) {
    ["deck", "scheduledReviewQueue", "wrongToday", "mistakesToday", "reviewQueue"].forEach(field => {
      if (Array.isArray(saved[field])) saved[field] = uniqueList(saved[field].map(key => aliases[String(key).toLowerCase()] || String(key).toLowerCase()));
    });
    saved.version = DAILY_SESSION_VERSION;
    saved.signature = deckSignature();
    localStorage.setItem("medicalVocabDaily", JSON.stringify(saved));
  }
  localStorage.setItem("medicalVocabMemory", JSON.stringify(state.memory));
  localStorage.setItem("medicalVocabWrongBook", JSON.stringify(state.wrong));
  localStorage.setItem("medicalVocabCatalogMigration", String(CATALOG_MIGRATION_VERSION));
}

function normalizeMemoryRecords() {
  const normalized = {};
  const wordMap = new Map(state.words.map(word => [word.word, word]));
  Object.entries(state.memory || {}).forEach(([key, record]) => {
    const value = normalizeMemoryRecord(record);
    if (state.wrong.includes(key) && value.wrongCount === 0) {
      value.wrongCount = 1;
      value.lapseScore = Math.max(2, value.lapseScore);
      value.mastered = false;
    }
    if (value.wrongCount > 0 && wordMap.has(key) && (value.memoryNoteVersion !== MEMORY_NOTES_VERSION || !value.memoryNote)) {
      value.memoryNote = buildStoredMemoryNote(wordMap.get(key));
      value.memoryNoteVersion = MEMORY_NOTES_VERSION;
    }
    normalized[key] = value;
  });
  state.memory = normalized;
  state.wrong = uniqueList(state.wrong).filter(key => !state.memory[key]?.mastered);
  localStorage.setItem("medicalVocabMemory", JSON.stringify(state.memory));
  localStorage.setItem("medicalVocabWrongBook", JSON.stringify(state.wrong));
}

function normalizeMemoryRecord(record = {}) {
  const level = Math.max(0, Math.min(intervals.length - 1, Number(record?.level || 0)));
  return {
    level,
    seen: Math.max(0, Number(record?.seen || 0)),
    correct: Math.max(0, Number(record?.correct || 0)),
    wrongCount: Math.max(0, Number(record?.wrongCount || 0)),
    consecutiveCorrect: Math.max(0, Number(record?.consecutiveCorrect || 0)),
    lapseScore: Math.max(0, Number(record?.lapseScore || 0)),
    intervalDays: Math.max(0, Number(record?.intervalDays || intervals[level] || 1)),
    due: Math.max(0, Number(record?.due || 0)),
    firstSeenDate: String(record?.firstSeenDate || ""),
    lastSeen: Math.max(0, Number(record?.lastSeen || 0)),
    lastWrongAt: Math.max(0, Number(record?.lastWrongAt || 0)),
    lastWrongDate: String(record?.lastWrongDate || (record?.lastWrongAt ? dateKeyFromTimestamp(record.lastWrongAt) : "")),
    updatedAt: Math.max(0, Number(record?.updatedAt || record?.lastSeen || 0)),
    mastered: Boolean(record?.mastered),
    memoryNote: String(record?.memoryNote || ""),
    memoryNoteVersion: Math.max(0, Number(record?.memoryNoteVersion || 0)),
    personalNote: String(record?.personalNote || ""),
    personalNoteUpdatedAt: Math.max(0, Number(record?.personalNoteUpdatedAt || 0)),
    history: Array.isArray(record?.history) ? record.history.slice(-30) : [],
    formStats: record?.formStats && typeof record.formStats === "object" ? record.formStats : {}
  };
}

function compareReviewPriority(a, b) {
  return reviewPriority(normalizeMemoryRecord(state.memory[b.word])) - reviewPriority(normalizeMemoryRecord(state.memory[a.word]));
}

function reviewPriority(record) {
  const overdueDays = record.due ? Math.max(0, (Date.now() - record.due) / 86400000) : 1;
  return (record.wrongCount * 12) + (record.lapseScore * 8) + overdueDays - (record.consecutiveCorrect * 2);
}

function nextReviewTimestamp(waitDays) {
  const due = new Date();
  due.setDate(due.getDate() + Math.max(1, waitDays));
  due.setHours(6, 0, 0, 0);
  return due.getTime();
}

function formatDue(timestamp) {
  if (!timestamp || timestamp <= Date.now()) return "今日应复习";
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "今日稍后复习";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return "明日再复习";
  return `${date.getMonth() + 1}月${date.getDate()}日复习`;
}

function buildDailySession() {
  const saved = JSON.parse(localStorage.getItem("medicalVocabDaily") || "null");
  const date = getTodayKey();
  const signature = deckSignature();
  if (
    saved &&
    saved.version === DAILY_SESSION_VERSION &&
    saved.date === date &&
    Array.isArray(saved.deck) &&
    saved.deck.length &&
    (saved.completed || saved.deck.every(key => state.words.some(word => word.word === key)))
  ) {
    saved.signature = signature;
    if (!Array.isArray(saved.wrongToday)) saved.wrongToday = [];
    if (!Array.isArray(saved.mistakesToday)) saved.mistakesToday = [...saved.wrongToday];
    if (!Array.isArray(saved.scheduledReviewQueue)) saved.scheduledReviewQueue = [];
    saved.scheduledReviewIndex = Math.max(0, Number(saved.scheduledReviewIndex || 0));
    if (!saved.storyAnswers || typeof saved.storyAnswers !== "object") saved.storyAnswers = {};
    saved.storySubmitted = Boolean(saved.storySubmitted);
    saved.storyPending = Boolean(saved.storyPending);
    if (saved.completed) {
      saved.phase = "done";
      saved.index = saved.deck.length;
      saved.reviewQueue = [];
      saved.reviewIndex = 0;
    }
    state.daily = saved;
    updateStats();
    return;
  }

  const wordMap = new Map(state.words.map(word => [word.word, word]));
  const yesterday = previousDateKey(date);
  const previousFromSaved = saved?.date === yesterday
    ? (saved.mistakesToday || saved.wrongToday || [])
    : [];
  const previousFromMemory = state.wrong.filter(key => {
    const record = normalizeMemoryRecord(state.memory[key]);
    return !record.mastered && record.lastWrongDate === yesterday;
  });
  const previousWrong = uniqueList(previousFromSaved, previousFromMemory)
    .filter(key => wordMap.has(key) && !normalizeMemoryRecord(state.memory[key]).mastered);
  const previousSet = new Set(previousWrong);
  const historicalWrong = state.wrong
    .filter(key => wordMap.has(key) && !previousSet.has(key) && !normalizeMemoryRecord(state.memory[key]).mastered)
    .map(key => wordMap.get(key))
    .sort(compareReviewPriority)
    .slice(0, HISTORICAL_REVIEW_LIMIT)
    .map(word => word.word);
  const scheduledReviewQueue = [...previousWrong, ...historicalWrong];
  const selected = state.words
    .filter(word => !state.memory[word.word])
    .slice(0, Math.min(DAILY_WORD_LIMIT, state.words.length));
  state.daily = {
    version: DAILY_SESSION_VERSION,
    date,
    deck: selected.map(word => word.word),
    index: 0,
    phase: scheduledReviewQueue.length ? "scheduled-review" : "study",
    scheduledReviewQueue,
    scheduledReviewIndex: 0,
    previousReviewCount: previousWrong.length,
    historicalReviewCount: historicalWrong.length,
    wrongToday: [],
    mistakesToday: [],
    reviewQueue: [],
    reviewIndex: 0,
    completed: false,
    story: null,
    storyPending: false,
    storyAnswers: {},
    storySubmitted: false,
    signature
  };
  saveDailySession();
  updateStats();
}

function buildWritingSession() {
  const saved = JSON.parse(localStorage.getItem("medicalWritingDaily") || "null");
  const date = getTodayKey();
  const baseWords = uniqueWritingWords([
    ...(Array.isArray(window.WRITING_CORE_WORDS) ? window.WRITING_CORE_WORDS : []),
    ...(Array.isArray(window.EXAM_WRITING_WORDS) ? window.EXAM_WRITING_WORDS : [])
  ]);
  const words = allWritingWords();
  const sentences = Array.isArray(window.WRITING_SENTENCES) ? window.WRITING_SENTENCES : [];
  const signature = `${baseWords.length}:${sentences.length}:${WRITING_WORD_LIMIT}:${WRITING_SENTENCE_LIMIT}`;
  if (saved && saved.date === date && saved.signature === signature) {
    if (!Array.isArray(saved.wordRevealed)) saved.wordRevealed = [];
    if (!saved.wordDrafts || typeof saved.wordDrafts !== "object") saved.wordDrafts = {};
    if (!saved.wordResults || typeof saved.wordResults !== "object") saved.wordResults = {};
    state.writingDaily = saved;
    return;
  }

  const dueSentences = sentences.filter(sentence => {
    const record = state.writingProgress[sentence.id];
    return record && record.status !== "correct";
  });
  const seed = daySeed(date);
  const wordStart = words.length ? seed % words.length : 0;
  const sentenceStart = sentences.length ? seed % sentences.length : 0;
  const dueWords = words.filter(item => {
    const record = state.writingWordProgress[item.word];
    return record && record.status !== "correct" && (!record.dueDate || record.dueDate <= date);
  });
  const selectedWords = uniqueWritingWords([...dueWords, ...rotatePick(words, wordStart, words.length)])
    .slice(0, Math.min(WRITING_WORD_LIMIT, words.length))
    .map(item => item.word);
  const selectedSentences = uniqueById([...dueSentences, ...rotatePick(sentences, sentenceStart, sentences.length)])
    .slice(0, Math.min(WRITING_SENTENCE_LIMIT, sentences.length))
    .map(item => item.id);

  state.writingDaily = {
    date,
    signature,
    words: selectedWords,
    sentences: selectedSentences,
    wordRevealed: [],
    wordDrafts: {},
    wordResults: {},
    revealed: [],
    completed: []
  };
  saveWritingDaily();
}

function selectStudyForm(word) {
  const forms = Array.isArray(word?.forms) && word.forms.length
    ? word.forms.filter(item => item.count > 0 || item.writingRequired)
    : [];
  if (!forms.length) return { form: word.word, meaning: word.meaning };
  const record = normalizeMemoryRecord(state.memory[word.word]);
  const ranked = [...forms].sort((a, b) => {
    const aStats = record.formStats[a.form] || {};
    const bStats = record.formStats[b.form] || {};
    const aNeed = Number(a.writingRequired) * 5 + Number(a.count || 0) - Number(aStats.seen || 0) * 3 + Number(aStats.wrongCount || 0) * 6;
    const bNeed = Number(b.writingRequired) * 5 + Number(b.count || 0) - Number(bStats.seen || 0) * 3 + Number(bStats.wrongCount || 0) * 6;
    return bNeed - aNeed;
  });
  return ranked[0] || { form: word.word, meaning: word.meaning };
}

function buildCategorySummary(word) {
  if (!word.examCount) return word.category || "词汇";
  const types = Object.keys(word.typeCounts || {}).slice(0, 3).join(" / ");
  return `真题词族 / ${types || "多题型"}`;
}

function renderExamMeta(word, record) {
  els.examMeta.classList.remove("hidden");
  const years = Array.isArray(word.years) ? word.years : [];
  const yearText = years.length > 8 ? `${years.slice(0, 4).join("、")}…${years.slice(-3).join("、")}` : years.join("、");
  const badges = [
    `真题 ${word.examCount || 0} 次`,
    yearText ? `年份 ${yearText}` : "",
    word.roleCounts?.选项 || word.roleCounts?.听力选项 ? "选项词" : "",
    word.writingRequired ? "写作必会" : "",
    word.medical ? "医学词" : "",
    record.seen > 0 ? `已学过 ${record.seen} 次` : ""
  ].filter(Boolean);
  els.examBadges.innerHTML = badges.map(text => `<span>${escapeHtml(text)}</span>`).join("");
  const forms = Array.isArray(word.forms) ? word.forms : [];
  els.familyForms.innerHTML = forms.length > 1
    ? `<strong>本词族：</strong>${forms.map(item => `${escapeHtml(item.form)}${item.writingRequired ? "（写）" : ""}`).join(" · ")}`
    : `<strong>当前考查：</strong>${escapeHtml(state.currentForm?.form || word.word)}`;
  els.evidenceBtn.classList.toggle("hidden", !word.evidenceChunk);
  els.evidenceBtn.textContent = "查看逐条真题出处";
  els.personalNoteBtn.textContent = record.personalNote ? "编辑个人笔记" : "添加个人笔记";
}

function togglePersonalNoteEditor() {
  if (!state.current) return;
  if (!els.personalNoteEditor.classList.contains("hidden")) {
    closePersonalNoteEditor();
    return;
  }
  const record = normalizeMemoryRecord(state.memory[state.current.word]);
  els.personalNoteInput.value = record.personalNote;
  els.personalNoteEditor.classList.remove("hidden");
  els.personalNoteInput.focus();
}

function closePersonalNoteEditor() {
  els.personalNoteEditor.classList.add("hidden");
  els.personalNoteInput.value = "";
}

function savePersonalNote() {
  if (!state.current) return;
  const key = state.current.word;
  const record = normalizeMemoryRecord(state.memory[key]);
  record.personalNote = els.personalNoteInput.value.trim().slice(0, 500);
  record.personalNoteUpdatedAt = Date.now();
  record.updatedAt = Math.max(record.updatedAt, record.personalNoteUpdatedAt);
  state.memory[key] = record;
  saveMemory();
  closePersonalNoteEditor();
  els.personalNoteBtn.textContent = record.personalNote ? "编辑个人笔记" : "添加个人笔记";
  renderRecallMemory(record);
  renderWrongList();
}

function renderRecallMemory(record) {
  const hasWrongHistory = record.wrongCount > 0;
  const notes = [];
  const latestSystemNote = state.current ? buildStoredMemoryNote(state.current) : record.memoryNote;
  if (record.personalNote) {
    notes.push(`<span class="recall-note-personal"><b>我的笔记：</b>${escapeHtml(record.personalNote).replace(/\n/g, "<br>")}</span>`);
  }
  if (latestSystemNote) {
    notes.push(`<span class="recall-note-system"><b>系统记忆点：</b>${escapeHtml(latestSystemNote)}</span>`);
  }
  els.recallMemoryText.innerHTML = notes.join("");
  els.recallMemory.classList.toggle("hidden", !hasWrongHistory || !notes.length);
}

async function toggleEvidence() {
  if (!state.current?.evidenceChunk) return;
  if (!els.evidenceList.classList.contains("hidden")) {
    els.evidenceList.classList.add("hidden");
    els.evidenceBtn.textContent = "查看逐条真题出处";
    return;
  }
  els.evidenceBtn.disabled = true;
  els.evidenceBtn.textContent = "加载中...";
  try {
    const response = await fetch(`data/evidence/${state.current.evidenceChunk}.json`);
    if (!response.ok) throw new Error("load failed");
    const chunk = await response.json();
    const rows = chunk[state.current.word] || [];
    els.evidenceList.innerHTML = rows.slice(0, 60).map(item => `
      <article>
        <strong>${escapeHtml(String(item.year))} · ${escapeHtml(item.typeLabel)} · ${escapeHtml(item.roleLabel)}${item.question ? ` · 第${escapeHtml(item.question)}题` : ""}</strong>
        <p>${escapeHtml(item.sentence)}</p>
        <small>${escapeHtml(item.source_file)}${item.confidence !== "official" ? ` · ${escapeHtml(item.confidence)}` : ""}</small>
      </article>
    `).join("") || "<p>暂无可展示出处。</p>";
    els.evidenceList.classList.remove("hidden");
    els.evidenceBtn.textContent = rows.length > 60 ? `收起出处（显示前60/${rows.length}条）` : `收起出处（${rows.length}条）`;
  } catch (error) {
    els.evidenceList.innerHTML = "<p>出处加载失败，请刷新后重试。</p>";
    els.evidenceList.classList.remove("hidden");
    els.evidenceBtn.textContent = "重试加载出处";
  } finally {
    els.evidenceBtn.disabled = false;
  }
}

function renderCard() {
  clearTimeout(nextTimer);
  if (!state.daily) buildDailySession();

  if (state.daily.phase === "scheduled-review" && state.daily.scheduledReviewIndex >= state.daily.scheduledReviewQueue.length) {
    state.daily.phase = "study";
    saveDailySession();
  }
  if (state.daily.phase === "study" && state.daily.index >= state.daily.deck.length) {
    startWrongReviewOrComplete();
  }
  if (state.daily.phase === "review" && state.daily.reviewIndex >= state.daily.reviewQueue.length) {
    completeDailySession();
  }
  if (state.daily.completed && !state.preview) {
    renderCompleteState();
    return;
  }

  const currentKey = state.preview
    ? state.previewDeck[state.previewIndex % state.previewDeck.length]
    : state.daily.phase === "scheduled-review"
    ? state.daily.scheduledReviewQueue[state.daily.scheduledReviewIndex]
    : state.daily.phase === "review"
      ? state.daily.reviewQueue[state.daily.reviewIndex]
      : state.daily.deck[state.daily.index];
  state.current = state.words.find(word => word.word === currentKey) || shuffle(state.words)[0];
  state.currentForm = selectStudyForm(state.current);
  state.locked = false;
  state.stage = "recall";
  state.recallMark = state.daily.phase === "review" || state.daily.phase === "scheduled-review" ? "review" : null;
  els.previewBtn.classList.toggle("hidden", !state.preview);
  els.previewBtn.textContent = state.preview ? "退出临时预览" : "临时预览词库";
  els.options.classList.add("hidden");
  els.recallActions.classList.remove("hidden");
  els.contextPanel.classList.add("hidden");
  els.resultPanel.classList.add("hidden");
  els.familyMeaningList.classList.add("hidden");
  els.familyMeaningList.innerHTML = "";
  els.recallMemory.classList.add("hidden");
  els.options.innerHTML = "";
  els.evidenceList.classList.add("hidden");
  els.evidenceList.innerHTML = "";
  closePersonalNoteEditor();

  const word = state.current;
  const isScheduledReview = state.daily.phase === "scheduled-review";
  const isReviewingToday = state.daily.phase === "review";
  els.category.textContent = state.preview
    ? "临时预览 · 不计入学习记录"
    : isScheduledReview
    ? "错词复习 / 昨日全部 + 既往20"
    : isReviewingToday
      ? "今日错词纠正 / 新词已完成"
    : buildCategorySummary(word);
  const record = normalizeMemoryRecord(state.memory[word.word]);
  renderExamMeta(word, record);
  renderRecallMemory(record);

  if (state.mode === "listen") {
    els.promptWord.textContent = "听发音";
    els.promptHint.textContent = state.preview
      ? "预览模式：可以正常作答，但不会修改今日进度或错词记录"
      : isScheduledReview
      ? `先复习错词，完成后再开始今天${DAILY_WORD_LIMIT}个新词。`
      : isReviewingToday
        ? `${DAILY_WORD_LIMIT}个新词已完成。现在纠正今天错词，直到全部说对。`
      : "先听发音回忆；点了解看正确意思，或看语境提示";
    setTimeout(() => speak(state.currentForm.form), 200);
  } else {
    els.promptWord.textContent = state.currentForm.form;
    els.promptHint.textContent = state.preview
      ? "预览模式：可以正常作答，但不会修改今日进度或错词记录"
      : isScheduledReview
      ? `先利用记忆点复习，完成后再开始今天${DAILY_WORD_LIMIT}个新词。`
      : isReviewingToday
        ? `${DAILY_WORD_LIMIT}个新词已完成。现在纠正今天错词，直到全部说对。`
      : "先回忆中文意思；点了解看正确意思，或看语境提示";
    setTimeout(() => speak(state.currentForm.form), 200);
  }
  updateStats();
}

function revealChoices(mark) {
  if (state.locked || !state.current) return;
  state.stage = "choice";
  state.recallMark = mark;
  els.recallActions.classList.add("hidden");
  els.contextPanel.classList.add("hidden");
  els.options.classList.remove("hidden");
  renderOptions(state.current);
  saveWrongBook();
  saveDailySession();
  renderWrongList();
}

function revealMeaning() {
  if (state.locked || !state.current) return;
  state.stage = "self-check";
  state.recallMark = "self-check";
  state.locked = true;
  els.recallActions.classList.add("hidden");
  els.contextPanel.classList.add("hidden");
  els.options.classList.add("hidden");
  showResult(true, "正确意思");
}

function markWrongAndNext() {
  if (!state.current) return;
  grade("wrong", false);
  advanceCard();
}

function showContextHint() {
  if (state.locked || !state.current) return;
  state.recallMark = "hint";
  els.recallActions.classList.add("hidden");
  els.options.classList.add("hidden");
  els.contextPanel.classList.remove("hidden");
  const context = buildContext(state.current);
  state.contextUtterance = context.english;
  els.contextText.textContent = withContextTranslation(context.display, state.current);
  els.memoryTip.textContent = buildBetterMemoryTip(state.current);
  setTimeout(() => speak(context.english), 120);
}

function renderOptions(word) {
  const asksEnglish = state.mode === "cn-en" || state.mode === "listen";
  const answer = asksEnglish ? state.currentForm.form : state.currentForm.meaning;
  const field = asksEnglish ? "word" : "meaning";
  const used = new Set([answer]);
  const distractors = [];
  for (const item of shuffle(state.words.filter(item => item.word !== word.word))) {
    const text = item[field];
    if (!text || used.has(text)) continue;
    used.add(text);
    distractors.push(text);
    if (distractors.length === 3) break;
  }
  const options = shuffle([answer, ...distractors]);

  els.options.innerHTML = "";
  options.forEach(text => {
    const button = document.createElement("button");
    button.className = "option";
    button.textContent = text;
    button.addEventListener("click", () => choose(button, text === answer));
    els.options.appendChild(button);
  });
}

function choose(button, correct) {
  if (state.locked) return;
  state.locked = true;
  button.classList.add(correct ? "correct" : "wrong");

  if (!correct) {
    [...els.options.children].forEach(option => {
      const answer = state.mode === "cn-en" || state.mode === "listen" ? state.currentForm.form : state.currentForm.meaning;
      if (option.textContent === answer) option.classList.add("correct");
    });
  }

  state.sessionDone += 1;
  if (correct) state.sessionCorrect += 1;
  showResult(correct);
  grade(correct ? state.recallMark || "vague" : "wrong", false);

  if (correct) {
    nextTimer = setTimeout(advanceCard, 650);
  }
}

function showResult(correct, label = "") {
  els.resultPanel.classList.remove("hidden");
  const prefix = label ? `${label}：` : "";
  els.resultText.textContent = correct
    ? `${prefix}${state.currentForm.form} = ${state.currentForm.meaning}`
    : `记一下：${state.currentForm.form} = ${state.currentForm.meaning}`;
  const familyForms = Array.isArray(state.current.forms) && state.current.forms.length
    ? state.current.forms
    : [{ form: state.current.word, meaning: state.current.meaning }];
  els.familyMeaningList.innerHTML = `
    <strong>本词族中文释义</strong>
    <ul>${familyForms.map(item => `
      <li><b>${escapeHtml(item.form)}</b><span>${escapeHtml(item.meaning || state.current.meaning)}</span></li>
    `).join("")}</ul>
  `;
  els.familyMeaningList.classList.remove("hidden");
  const sourceLabel = state.current.exampleSource?.type ? `【${state.current.exampleSource.type}】` : "";
  els.exampleText.textContent = `${sourceLabel}${state.current.example || ""}${state.current.exampleTranslation ? `\n${state.current.exampleTranslation}` : ""}`;
}

function grade(result, moveNext = true) {
  if (state.preview) {
    if (moveNext) advanceCard();
    return;
  }
  const key = state.current.word;
  const previous = normalizeMemoryRecord(state.memory[key]);
  const now = Date.now();
  const strongCorrect = result === "known" || result === "review";
  const weakRecall = result === "vague" || result === "hint";
  const failed = result === "wrong" || weakRecall;
  const wasWrongToday = Boolean(state.daily?.mistakesToday?.includes(key));
  const nextLevel = failed
    ? Math.max(0, previous.level - (result === "wrong" ? 2 : 1))
    : Math.min(previous.level + 1, intervals.length - 1);
  const wrongCount = previous.wrongCount + (failed ? 1 : 0);
  const consecutiveCorrect = failed ? 0 : previous.consecutiveCorrect + 1;
  const lapseScore = failed
    ? previous.lapseScore + (result === "wrong" ? 2 : 1)
    : Math.max(0, previous.lapseScore - (strongCorrect ? 0.75 : 0.25));
  const mastered = wrongCount > 0 && consecutiveCorrect >= 4 && nextLevel >= 6 && lapseScore <= 1;
  let waitDays = 0;
  if (!failed) {
    const baseDays = intervals[nextLevel] || intervals[intervals.length - 1];
    waitDays = wasWrongToday ? 1 : Math.max(1, Math.round(baseDays / (1 + lapseScore * 0.35)));
  }
  const due = failed ? now + (4 * 60 * 60 * 1000) : nextReviewTimestamp(waitDays);
  const memoryNote = failed || previous.wrongCount > 0
    ? buildStoredMemoryNote(state.current)
    : previous.memoryNote;
  const history = [
    ...previous.history,
    { at: now, result, level: nextLevel }
  ].slice(-30);
  const formKey = state.currentForm?.form || key;
  const previousForm = previous.formStats[formKey] || {};
  const formStats = {
    ...previous.formStats,
    [formKey]: {
      seen: Number(previousForm.seen || 0) + 1,
      correct: Number(previousForm.correct || 0) + (failed ? 0 : 1),
      wrongCount: Number(previousForm.wrongCount || 0) + (failed ? 1 : 0),
      lastSeen: now
    }
  };
  state.memory[key] = {
    level: nextLevel,
    seen: previous.seen + 1,
    correct: previous.correct + (failed ? 0 : 1),
    wrongCount,
    consecutiveCorrect,
    lapseScore,
    intervalDays: waitDays,
    due,
    firstSeenDate: previous.firstSeenDate || getTodayKey(),
    lastSeen: now,
    lastWrongAt: failed ? now : previous.lastWrongAt,
    lastWrongDate: failed ? getTodayKey() : previous.lastWrongDate,
    updatedAt: now,
    mastered,
    memoryNote,
    memoryNoteVersion: memoryNote ? MEMORY_NOTES_VERSION : previous.memoryNoteVersion,
    personalNote: previous.personalNote,
    personalNoteUpdatedAt: previous.personalNoteUpdatedAt,
    history,
    formStats
  };

  if (failed) addWrong(key);
  if (state.daily && state.daily.phase === "review" && strongCorrect) {
    state.daily.wrongToday = state.daily.wrongToday.filter(item => item !== key);
  }
  if (mastered) {
    state.wrong = state.wrong.filter(item => item !== key);
  } else if (wrongCount > 0 && !state.wrong.includes(key)) {
    state.wrong.push(key);
  }

  saveMemory();
  saveWrongBook();
  saveDailySession();
  updateStats();
  renderWrongList();
  if (moveNext) renderCard();
}

function updateStats() {
  const newTotal = state.daily ? state.daily.deck.length : Math.min(DAILY_WORD_LIMIT, state.words.length);
  const newDone = state.daily ? Math.min(state.daily.index, newTotal) : 0;
  const scheduledTotal = state.daily?.scheduledReviewQueue?.length || 0;
  const scheduledDone = state.daily ? Math.min(state.daily.scheduledReviewIndex || 0, scheduledTotal) : 0;
  let remaining = 0;
  let phaseText = `今日新词 ${newDone}/${newTotal}`;
  if (state.daily?.completed) {
    phaseText = `今日完成：错词复习 ${scheduledTotal} 个 + 新词 ${newTotal} 个`;
  } else if (state.daily?.phase === "scheduled-review") {
    remaining = (scheduledTotal - scheduledDone) + (newTotal - newDone);
    phaseText = `错词复习 ${scheduledDone}/${scheduledTotal}（昨日 ${state.daily.previousReviewCount || 0} + 既往 ${state.daily.historicalReviewCount || 0}），随后新词 ${newTotal} 个`;
  } else if (state.daily?.phase === "review") {
    remaining = Math.max(0, state.daily.reviewQueue.length - state.daily.reviewIndex);
    phaseText = `新词 ${newTotal}/${newTotal}，正在纠正今日错词`;
  } else if (state.daily) {
    remaining = Math.max(0, newTotal - newDone);
    phaseText = `今日新词 ${newDone}/${newTotal}，已复习错词 ${scheduledTotal} 个`;
  }
  const learnedFamilies = state.words.reduce((total, word) => {
    const record = state.memory[word.word];
    return total + (record && Number(record.seen || 0) > 0 ? 1 : 0);
  }, 0);
  const remainingFamilies = Math.max(0, state.words.length - learnedFamilies);
  const estimatedDays = Math.ceil(remainingFamilies / DAILY_WORD_LIMIT);
  els.deckMeta.textContent = `${phaseText}，三个月计划：已学 ${learnedFamilies}/${state.words.length}，按每日${DAILY_WORD_LIMIT}词预计还需 ${estimatedDays} 天`;
  els.todayDone.textContent = newDone;
  els.accuracy.textContent = state.sessionDone ? `${Math.round(state.sessionCorrect / state.sessionDone * 100)}%` : "0%";
  els.dueCount.textContent = remaining;
}

function renderWrongList() {
  els.wrongList.innerHTML = "";
  const active = state.wrong
    .map(key => ({ key, record: normalizeMemoryRecord(state.memory[key]) }))
    .filter(item => !item.record.mastered)
    .sort((a, b) => reviewPriority(b.record) - reviewPriority(a.record));
  if (!active.length) {
    els.wrongList.innerHTML = "<li class=\"wrong-empty\">目前没有需要长期复习的错词。</li>";
    return;
  }
  active.slice(0, 30).forEach(({ key, record }) => {
    const word = state.words.find(item => item.word === key);
    if (!word) return;
    const li = document.createElement("li");
    li.className = "wrong-item";
    li.innerHTML = `
      <strong>${escapeHtml(word.word)}</strong>
      <span>${escapeHtml(word.meaning)}</span>
      <small>累计错 ${record.wrongCount} 次 · 连续答对 ${record.consecutiveCorrect} 次 · ${escapeHtml(formatDue(record.due))}</small>
      ${record.personalNote ? `<p class="wrong-personal-note"><b>我的笔记：</b>${escapeHtml(record.personalNote).replace(/\n/g, "<br>")}</p>` : ""}
      <p><b>系统记忆点：</b>${escapeHtml(buildStoredMemoryNote(word) || record.memoryNote)}</p>
    `;
    els.wrongList.appendChild(li);
  });
}

function renderWrongStory() {
  if (!els.wrongStoryStatus || !els.wrongStoryContent) return;
  const daily = state.daily;
  const mistakes = daily?.mistakesToday || [];
  if (daily?.storyPending && !storyGenerationPending && !storyRequestInFlight) {
    storyGenerationPending = true;
    setTimeout(() => ensureWrongStory(false, true), 0);
  }
  els.wrongStoryContent.innerHTML = "";
  els.generateStoryBtn.textContent = "生成完形";
  els.generateStoryBtn.classList.add("hidden");
  els.submitStoryBtn.classList.add("hidden");

  if (!daily?.completed) {
    els.wrongStoryStatus.textContent = `完成今日${DAILY_WORD_LIMIT}词和当日错词复习后，这里会自动生成。`;
    return;
  }
  if (!mistakes.length) {
    els.wrongStoryStatus.textContent = "今天没有错词，不需要额外完形复习。";
    return;
  }
  if (storyGenerationPending) {
    els.wrongStoryStatus.textContent = `Codex 大模型正在为 ${mistakes.length} 个错词生成独立语境题，通常需要几分钟。`;
    els.wrongStoryContent.innerHTML = `
      <div class="story-pending" role="status">
        <strong>正在生成高质量语境完形</strong>
        <span>每个错词单独成句，系统会自动检查重复选项并在完成后刷新。</span>
      </div>
    `;
    return;
  }
  if (!daily.story) {
    els.wrongStoryStatus.textContent = storyGenerationError
      ? `生成失败：${storyGenerationError}`
      : storyRequestInFlight
        ? "正在提交今天的错词..."
        : `今天有 ${mistakes.length} 个错词，准备生成语境完形。`;
    if (!storyRequestInFlight) {
      els.generateStoryBtn.textContent = storyGenerationError ? "重新生成" : "生成完形";
      els.generateStoryBtn.classList.remove("hidden");
      if (!storyGenerationError) setTimeout(() => ensureWrongStory(), 0);
    }
    return;
  }

  if (Number(daily.story.version) >= 3 && !daily.story.optionOrderVersion) {
    daily.story = null;
    daily.storyPending = true;
    daily.storyAnswers = {};
    daily.storySubmitted = false;
    saveDailySession();
    storyGenerationPending = true;
    setTimeout(() => ensureWrongStory(false, true), 0);
    renderWrongStory();
    return;
  }

  const story = daily.story;
  els.wrongStoryStatus.textContent = daily.storySubmitted
    ? `已完成：${story.title}`
    : `${story.title} · 共 ${story.items.length} 个空`;
  if (Number(story.version) >= 3 && story.mode === "independent-sentence-cloze") {
    renderIndependentSentenceCloze(story, daily, els.wrongStoryContent);
  } else {
    renderLegacyStoryText(story, daily, els.wrongStoryContent);
  }

  if (!daily.storySubmitted) {
    els.submitStoryBtn.classList.remove("hidden");
    if (Number(story.version || 0) < 3) {
      els.generateStoryBtn.textContent = "重新生成高质量版";
      els.generateStoryBtn.classList.remove("hidden");
    }
    return;
  }
  if (Number(story.version) >= 3 && story.mode === "independent-sentence-cloze") return;
  const sentencePairs = normalizedStorySentences(story);
  if (sentencePairs.length) {
    const review = document.createElement("section");
    review.className = "story-sentence-review";
    review.innerHTML = "<h3>逐句中文解析</h3>";
    sentencePairs.forEach((sentence, position) => {
      const article = document.createElement("article");
      article.innerHTML = `
        <span class="story-sentence-number">第 ${position + 1} 句</span>
        <p class="story-sentence-english">${fillStorySentence(sentence.english, story.items)}</p>
        <p class="story-sentence-chinese"><strong>中文：</strong>${escapeHtml(sentence.translation)}</p>
      `;
      review.appendChild(article);
    });
    els.wrongStoryContent.appendChild(review);
  } else if (story.translation) {
    const translation = document.createElement("p");
    translation.className = "story-translation";
    translation.innerHTML = `<strong>旧版故事翻译：</strong>${escapeHtml(story.translation)}`;
    els.wrongStoryContent.appendChild(translation);
    els.generateStoryBtn.textContent = "重新生成高质量版";
    els.generateStoryBtn.classList.remove("hidden");
  }
  const explanations = document.createElement("ol");
  explanations.className = "story-explanations";
  story.items.forEach(item => {
    const answer = daily.storyAnswers[item.index] || "";
    const correct = normalizeAnswer(answer) === normalizeAnswer(item.word);
    const li = document.createElement("li");
    li.className = correct ? "correct" : "wrong";
    li.innerHTML = `<strong>${escapeHtml(item.word)}：${escapeHtml(item.meaning)}</strong><span>${correct ? "选择正确。" : `你选了“${escapeHtml(answer || "未作答")}”。`} ${escapeHtml(item.explanation)}</span>`;
    explanations.appendChild(li);
  });
  els.wrongStoryContent.appendChild(explanations);
  if (Number(story.version || 0) < 3) {
    els.generateStoryBtn.textContent = "重新生成高质量版";
    els.generateStoryBtn.classList.remove("hidden");
  }
}

function renderLegacyStoryText(story, daily, container) {
  const storyText = document.createElement("div");
  storyText.className = "story-text";
  appendStorySentenceParts(storyText, String(story.story || ""), story, daily);
  container.appendChild(storyText);
}

function renderIndependentSentenceCloze(story, daily, container) {
  const list = document.createElement("div");
  list.className = "independent-cloze-list";
  normalizedStorySentences(story).forEach((sentence, position) => {
    const item = story.items[position];
    if (!item) return;
    const article = document.createElement("article");
    article.className = `independent-cloze-item ${daily.storySubmitted ? "submitted" : ""}`;
    const number = document.createElement("span");
    number.className = "story-sentence-number";
    number.textContent = `第 ${position + 1} 题`;
    const english = document.createElement("p");
    english.className = "story-sentence-english";
    appendStorySentenceParts(english, sentence.english, story, daily);
    article.append(number, english);
    if (daily.storySubmitted) {
      const translation = document.createElement("p");
      translation.className = "story-sentence-chinese";
      translation.innerHTML = `<strong>中文：</strong>${escapeHtml(sentence.translation)}`;
      const explanation = document.createElement("p");
      explanation.className = "story-context-explanation";
      explanation.innerHTML = `<strong>解析：</strong>${escapeHtml(item.explanation)}`;
      article.append(translation, explanation);
      if (Array.isArray(item.optionAnalysis)) {
        const optionList = document.createElement("ul");
        optionList.className = "story-option-analysis";
        item.optionAnalysis.forEach(option => {
          const li = document.createElement("li");
          const isAnswer = normalizeAnswer(option.option) === normalizeAnswer(item.word);
          li.className = isAnswer ? "answer" : "";
          li.innerHTML = `<strong>${escapeHtml(option.option)}</strong><span>${escapeHtml(option.meaning)}：${escapeHtml(option.reason)}</span>`;
          optionList.appendChild(li);
        });
        article.appendChild(optionList);
      }
    }
    list.appendChild(article);
  });
  container.appendChild(list);
}

function appendStorySentenceParts(container, sentence, story, daily) {
  String(sentence || "").split(/(\{\{\d+\}\})/g).forEach(part => {
    const match = part.match(/^\{\{(\d+)\}\}$/);
    if (!match) {
      container.appendChild(document.createTextNode(part));
      return;
    }
    const index = Number(match[1]);
    const item = story.items.find(entry => Number(entry.index) === index);
    if (!item) return;
    if (daily.storySubmitted) {
      const answer = daily.storyAnswers[index] || "";
      const mark = document.createElement("strong");
      mark.className = normalizeAnswer(answer) === normalizeAnswer(item.word) ? "story-correct" : "story-wrong";
      mark.textContent = answer && normalizeAnswer(answer) !== normalizeAnswer(item.word)
        ? `${answer} → ${item.word}`
        : item.word;
      container.appendChild(mark);
      return;
    }
    const select = document.createElement("select");
    select.className = "story-select";
    select.dataset.storyIndex = String(index);
    select.setAttribute("aria-label", `第${index}空`);
    select.innerHTML = `<option value="">第${index}空</option>` + item.options
      .map(option => `<option value="${escapeHtml(option)}" ${daily.storyAnswers[index] === option ? "selected" : ""}>${escapeHtml(option)}</option>`)
      .join("");
    select.addEventListener("change", event => {
      daily.storyAnswers[index] = event.target.value;
      saveDailySession();
    });
    container.appendChild(select);
  });
}

function normalizedStorySentences(story) {
  if (!Array.isArray(story?.sentences)) return [];
  return story.sentences.map(sentence => ({
    english: String(sentence?.english || "").trim(),
    translation: String(sentence?.translation || "").trim()
  })).filter(sentence => sentence.english && sentence.translation);
}

function fillStorySentence(sentence, items) {
  let html = escapeHtml(String(sentence || ""));
  (Array.isArray(items) ? items : []).forEach(item => {
    const placeholder = `{{${Number(item.index)}}}`;
    html = html.split(placeholder).join(`<strong class="story-answer-word">${escapeHtml(item.word)}</strong>`);
  });
  return html;
}

async function ensureWrongStory(force = false, polling = false) {
  if (storyRequestInFlight || !state.daily?.completed || !state.daily.mistakesToday?.length) return;
  if (state.daily.story && !force && !storyGenerationPending) return;
  storyRequestInFlight = true;
  if (force) {
    storyGenerationError = "";
    storyGenerationPending = true;
    state.daily.storyPending = true;
    saveDailySession();
  }
  renderWrongStory();
  const wordMap = new Map(state.words.map(word => [word.word, word]));
  const words = state.daily.mistakesToday.map(key => wordMap.get(key)).filter(Boolean);
  try {
    const response = await fetch("/api/wrong-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: state.daily.date,
        force: Boolean(force && !polling),
        words: words.map(word => ({
          word: word.word,
          meaning: word.meaning,
          category: word.category || "",
          example: word.example || ""
        }))
      })
    });
    const payload = await response.json();
    if (response.status === 202 && payload.pending) {
      storyGenerationPending = true;
      state.daily.storyPending = true;
      saveDailySession();
      scheduleStoryPoll();
      return;
    }
    if (!response.ok) throw new Error(payload.error || "大模型生成失败");
    state.daily.story = payload;
    state.daily.storyAnswers = {};
    state.daily.storySubmitted = false;
    state.daily.storyPending = false;
    storyGenerationPending = false;
    storyGenerationError = "";
    clearTimeout(storyPollTimer);
    storyPollTimer = null;
    saveDailySession();
  } catch (error) {
    storyGenerationPending = false;
    state.daily.storyPending = false;
    storyGenerationError = String(error.message || "大模型生成失败");
    saveDailySession();
  } finally {
    storyRequestInFlight = false;
    renderWrongStory();
  }
}

function scheduleStoryPoll() {
  clearTimeout(storyPollTimer);
  storyPollTimer = setTimeout(() => ensureWrongStory(false, true), 12000);
}

function submitWrongStory() {
  if (!state.daily?.story) return;
  const missing = state.daily.story.items.some(item => !state.daily.storyAnswers[item.index]);
  if (missing) {
    alert("请先完成所有空，再提交答案。");
    return;
  }
  state.daily.storySubmitted = true;
  saveDailySession();
  renderWrongStory();
}

function renderWritingPanel() {
  if (!els.writingWords || !els.writingSentences) return;
  if (!state.writingDaily) buildWritingSession();
  const words = allWritingWords();
  const sentences = Array.isArray(window.WRITING_SENTENCES) ? window.WRITING_SENTENCES : [];
  const wordMap = new Map(words.map(item => [item.word, item]));
  const sentenceMap = new Map(sentences.map(item => [item.id, item]));

  els.writingWords.innerHTML = "";
  state.writingDaily.words.forEach(key => {
    const item = wordMap.get(key);
    if (!item) return;
    const revealed = state.writingDaily.wordRevealed.includes(key);
    const result = state.writingDaily.wordResults?.[key] || state.writingWordProgress[key] || {};
    const card = document.createElement("article");
    card.className = `writing-word ${revealed ? "revealed" : ""} ${result.status || ""}`;
    card.innerHTML = `
      <span class="word-meaning">${escapeHtml(item.meaning)}</span>
      <input class="word-write" type="text" value="${escapeHtml(state.writingDaily.wordDrafts[key] || "")}" placeholder="默写英文核心词">
      <div class="word-actions">
        <button class="word-check" data-word="${escapeHtml(item.word)}">检查拼写</button>
        <button class="word-reveal" data-word="${escapeHtml(item.word)}">${revealed ? "已显示答案" : "看答案"}</button>
      </div>
      <em class="word-status">${writingWordStatusText(result.status)}</em>
      <div class="word-answer ${revealed ? "" : "hidden"}">
        <strong>${escapeHtml(item.word)}</strong>
        <p>${escapeHtml(item.collocation)}</p>
        <small>${escapeHtml(item.example)}</small>
      </div>
    `;
    card.querySelector("input").addEventListener("input", event => saveWritingWordDraft(key, event.target.value));
    card.querySelector(".word-check").addEventListener("click", () => checkWritingWord(key, card));
    card.querySelector(".word-reveal").addEventListener("click", () => revealWritingWord(key));
    els.writingWords.appendChild(card);
  });

  els.writingSentences.innerHTML = "";
  state.writingDaily.sentences.forEach(id => {
    const item = sentenceMap.get(id);
    if (!item) return;
    const record = state.writingProgress[id] || {};
    const revealed = state.writingDaily.revealed.includes(id);
    const review = record.review;
    const card = document.createElement("article");
    card.className = `writing-sentence ${record.status || ""}`;
    card.innerHTML = `
      <div class="sentence-topline"><span>${item.year || ""} ${item.topic}</span><em>${statusText(record.status)}</em></div>
      <p class="cn">${item.chinese}</p>
      <textarea rows="4" placeholder="先自己写英文，提交审查后再看参考译文">${record.draft || ""}</textarea>
      <div class="ai-review ${review ? "" : "hidden"}">
        ${review ? renderReviewHtml(review) : ""}
      </div>
      <div class="sentence-answer ${revealed ? "" : "hidden"}">
        <p><strong>参考译文：</strong>${item.reference}</p>
        <p><strong>可替换表达：</strong>${item.alternatives.join("；")}</p>
        <p><strong>核心词块：</strong>${item.chunks.join("；")}</p>
      </div>
      <div class="sentence-actions">
        <button data-action="save" data-id="${item.id}">保存草稿</button>
        <button data-action="review" data-id="${item.id}">提交审查</button>
        <button data-action="reveal" data-id="${item.id}">参考译文</button>
        <button data-action="correct" data-id="${item.id}">基本正确</button>
        <button data-action="weak" data-id="${item.id}">表达不熟</button>
        <button data-action="wrong" data-id="${item.id}">不会写</button>
      </div>
    `;
    card.querySelector("textarea").addEventListener("input", event => saveWritingDraft(id, event.target.value));
    card.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => handleWritingAction(button.dataset.action, id, card));
    });
    els.writingSentences.appendChild(card);
  });

  const completed = state.writingDaily.sentences.filter(id => state.writingProgress[id]?.status === "correct").length;
  els.writingMeta.textContent = `今日写作：5个核心词 + 1条句子仿写，句子完成 ${completed}/${state.writingDaily.sentences.length}`;
}

function saveWritingWordDraft(key, draft) {
  if (!state.writingDaily.wordDrafts || typeof state.writingDaily.wordDrafts !== "object") {
    state.writingDaily.wordDrafts = {};
  }
  state.writingDaily.wordDrafts[key] = draft;
  saveWritingDaily();
}

function revealWritingWord(key) {
  if (!Array.isArray(state.writingDaily.wordRevealed)) {
    state.writingDaily.wordRevealed = [];
  }
  if (!state.writingDaily.wordRevealed.includes(key)) {
    state.writingDaily.wordRevealed.push(key);
  }
  saveWritingDaily();
  renderWritingPanel();
}

function checkWritingWord(key, card) {
  const draft = card.querySelector("input").value.trim();
  saveWritingWordDraft(key, draft);
  const correct = normalizeAnswer(draft) === normalizeAnswer(key);
  const result = {
    status: correct ? "correct" : "wrong",
    draft,
    checkedAt: Date.now(),
    dueDate: correct ? "" : nextDateKey()
  };
  state.writingDaily.wordResults[key] = result;
  state.writingWordProgress[key] = result;
  if (!correct && !state.writingDaily.wordRevealed.includes(key)) {
    state.writingDaily.wordRevealed.push(key);
  }
  saveWritingWordProgress();
  saveWritingDaily();
  renderWritingPanel();
}

async function handleWritingAction(action, id, card) {
  if (action === "save") {
    saveWritingDraft(id, card.querySelector("textarea").value);
  } else if (action === "review") {
    await reviewWritingSentence(id, card);
  } else if (action === "reveal") {
    if (!state.writingDaily.revealed.includes(id)) state.writingDaily.revealed.push(id);
    saveWritingDaily();
  } else {
    markWritingSentence(id, action === "correct" ? "correct" : action);
  }
  renderWritingPanel();
}

async function reviewWritingSentence(id, card) {
  const sentences = Array.isArray(window.WRITING_SENTENCES) ? window.WRITING_SENTENCES : [];
  const item = sentences.find(sentence => sentence.id === id);
  if (!item) return;
  const draft = card.querySelector("textarea").value.trim();
  saveWritingDraft(id, draft);
  if (!draft) {
    alert("先写一句英文，再提交审查。");
    return;
  }

  const button = card.querySelector('[data-action="review"]');
  if (button) {
    button.disabled = true;
    button.textContent = "审查中...";
  }

  let review;
  try {
    const response = await fetch("/api/review-writing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chinese: item.chinese,
        draft,
        reference: item.reference,
        chunks: item.chunks,
        alternatives: item.alternatives
      })
    });
    if (!response.ok) throw new Error("review failed");
    review = await response.json();
  } catch (error) {
    review = localWritingReview(item, draft);
  }

  const previous = state.writingProgress[id] || {};
  state.writingProgress[id] = {
    ...previous,
    draft,
    review,
    updatedAt: Date.now()
  };
  addReviewWordsToToday(review.issues || [], item);
  saveWritingProgress();
  saveWritingDaily();
}

function localWritingReview(item, draft) {
  const normalizedDraft = normalizeAnswer(draft);
  const issues = [];
  (item.chunks || []).forEach(chunk => {
    const head = chunk.split(/\s+/).slice(0, 2).join(" ");
    if (head && !normalizedDraft.includes(normalizeAnswer(head))) {
      issues.push({
        word: chunk,
        meaning: "句子核心词块",
        reason: "你的句子里可能缺少这个考场可用表达。"
      });
    }
  });
  return {
    source: "local",
    feedback: "已完成基础审查：先检查是否覆盖核心词块、表达是否完整。要获得更细的语法和措辞修改，需要本地服务配置 OPENAI_API_KEY。",
    revised: draft,
    issues: issues.slice(0, 5)
  };
}

function addReviewWordsToToday(issues, sentence) {
  const additions = issues
    .map(issue => ({
      word: String(issue.word || "").trim(),
      meaning: String(issue.meaning || issue.reason || "句子审查新增词").trim(),
      collocation: String(issue.collocation || issue.word || "").trim(),
      example: String(issue.example || sentence.reference || "").trim()
    }))
    .filter(item => item.word && /[a-zA-Z]/.test(item.word));

  additions.forEach(item => {
    if (!state.writingCustomWords.some(word => normalizeAnswer(word.word) === normalizeAnswer(item.word))) {
      state.writingCustomWords.push(item);
    }
    state.writingWordProgress[item.word] = {
      ...(state.writingWordProgress[item.word] || {}),
      status: "wrong",
      dueDate: getTodayKey(),
      checkedAt: Date.now()
    };
    if (state.writingDaily.words.includes(item.word)) return;
    const replaceAt = state.writingDaily.words.findLastIndex(key =>
      !state.writingDaily.wordDrafts?.[key] && !state.writingDaily.wordResults?.[key]
    );
    if (state.writingDaily.words.length < WRITING_WORD_LIMIT) {
      state.writingDaily.words.push(item.word);
    } else if (replaceAt >= 0) {
      state.writingDaily.words.splice(replaceAt, 1, item.word);
    }
  });
  state.writingDaily.words = state.writingDaily.words.slice(0, WRITING_WORD_LIMIT);
  saveWritingWordProgress();
  saveWritingCustomWords();
}

function saveWritingDraft(id, draft) {
  const previous = state.writingProgress[id] || {};
  state.writingProgress[id] = { ...previous, draft };
  saveWritingProgress();
}

function markWritingSentence(id, status) {
  const previous = state.writingProgress[id] || {};
  state.writingProgress[id] = {
    ...previous,
    status,
    updatedAt: Date.now()
  };
  if (status === "correct" && !state.writingDaily.completed.includes(id)) {
    state.writingDaily.completed.push(id);
  }
  saveWritingProgress();
  saveWritingDaily();
}

function resetWritingToday() {
  localStorage.removeItem("medicalWritingDaily");
  state.writingDaily = null;
  buildWritingSession();
  renderWritingPanel();
}

function addWrong(key) {
  if (!state.wrong.includes(key)) state.wrong.push(key);
  if (state.daily && !state.daily.wrongToday.includes(key)) {
    state.daily.wrongToday.push(key);
  }
  if (state.daily && !state.daily.mistakesToday.includes(key)) {
    state.daily.mistakesToday.push(key);
  }
}

function buildContext(word) {
  const cleanExample = String(word.example || "").replace(/\s+/g, " ").trim();
  if (cleanExample && cleanExample.length > 20 && !/^[A-Za-z-]+ [A-D]\.?$/.test(cleanExample)) {
    return {
      english: cleanExample,
      display: `语境：${cleanExample}`
    };
  }
  const dialogue = `Doctor: The patient's condition may be related to ${word.word}. Student: I see. In this context, ${word.word} is the key word for understanding the case.`;
  return {
    english: dialogue,
    display: `Doctor: The patient's condition may be related to ${word.word}.\nStudent: I see. In this context, ${word.word} is the key word for understanding the case.`
  };
}

function buildMemoryTip(word) {
  const lower = word.word.toLowerCase();
  const roots = [
    ["cardio", "cardio = 心脏"],
    ["neuro", "neuro = 神经"],
    ["psycho", "psycho = 心理/精神"],
    ["itis", "-itis = 炎症"],
    ["osis", "-osis = 病变/状态"],
    ["oma", "-oma = 肿瘤"],
    ["emia", "-emia = 血液状态"],
    ["pathy", "-pathy = 疾病"],
    ["therapy", "therapy = 治疗"],
    ["anti", "anti- = 抗/反"],
    ["hyper", "hyper- = 过高/过度"],
    ["hypo", "hypo- = 过低/不足"],
    ["trans", "trans- = 转移/穿过"],
    ["micro", "micro- = 微小"],
    ["bio", "bio = 生命/生物"]
  ];
  const prefixRoots = new Set(["ab", "ad", "anti", "auto", "hyper", "hypo", "micro", "trans"]);
  const root = roots.find(([key]) => prefixRoots.has(key) ? lower.startsWith(key) : lower.includes(key));
  const synonym = synonymTip(lower);
  const parts = [];
  if (root) parts.push(`词根：${root[1]}`);
  if (synonym) parts.push(`同近义：${synonym}`);
  parts.push(`记忆点：把 ${word.word} 放回真题语境里记，核心义是“${word.meaning}”。`);
  return parts.join("；");
}

function synonymTip(word) {
  const map = {
    adverse: "harmful, unfavorable",
    alleviate: "relieve, ease",
    vulnerable: "susceptible, fragile",
    prevalent: "common, widespread",
    intervention: "treatment, action",
    malignant: "cancerous",
    benign: "noncancerous",
    acute: "severe, sharp",
    chronic: "long-lasting",
    sufficient: "adequate"
  };
  return map[word] || "";
}

function buildMemoryTip(word) {
  const lower = word.word.toLowerCase();
  const roots = [
    ["ab", "ab- = 离开/异常"],
    ["ad", "ad- = 朝向/加强"],
    ["anti", "anti- = 抗/反"],
    ["auto", "auto- = 自身/自动"],
    ["bio", "bio = 生命/生物"],
    ["cardio", "cardio = 心脏"],
    ["cephal", "cephal = 头"],
    ["derm", "derm = 皮肤"],
    ["emia", "-emia = 血液状态"],
    ["gastro", "gastro = 胃"],
    ["gen", "gen = 产生/基因"],
    ["hepat", "hepat = 肝"],
    ["hyper", "hyper- = 过高/过度"],
    ["hypo", "hypo- = 过低/不足"],
    ["itis", "-itis = 炎症"],
    ["logy", "-logy = 学科/研究"],
    ["micro", "micro- = 微小"],
    ["neuro", "neuro = 神经"],
    ["oma", "-oma = 肿瘤"],
    ["osis", "-osis = 病变/状态"],
    ["pathy", "-pathy = 疾病"],
    ["pharm", "pharm = 药物"],
    ["psycho", "psycho = 心理/精神"],
    ["renal", "renal = 肾"],
    ["therapy", "therapy = 治疗"],
    ["trans", "trans- = 转移/穿过"]
  ];
  const root = roots.find(([key]) => lower.includes(key));
  const synonym = synonymTip(lower);
  const confusing = confusingTip(lower);
  const wordFamily = wordFamilyTip(lower);
  const parts = [];
  if (root) parts.push(`词根：${root[1]}`);
  if (wordFamily) parts.push(`词族：${wordFamily}`);
  if (synonym) parts.push(`同近义：${synonym}`);
  if (confusing) parts.push(`易混：${confusing}`);
  parts.push(`记忆点：把 ${word.word} 放回真题语境里记，核心义是“${word.meaning}”。`);
  return parts.join("；");
}

function synonymTip(word) {
  const map = {
    acute: "severe, sharp",
    adverse: "harmful, unfavorable",
    aggression: "hostility, attack",
    alleviate: "relieve, ease",
    apparent: "obvious, seeming",
    arbitral: "related to arbitration; 区分 arbitrary = 武断的",
    arbitrary: "random, willful",
    abundant: "plentiful, ample",
    benign: "noncancerous",
    beneficial: "helpful, favorable",
    chronic: "long-lasting",
    deficiency: "shortage, lack",
    deteriorate: "worsen, decline",
    eradicate: "eliminate, wipe out",
    exacerbate: "worsen, aggravate",
    feasible: "practical, workable",
    impaired: "damaged, weakened",
    indispensable: "essential, necessary",
    intervention: "treatment, action",
    malignant: "cancerous",
    prevalent: "common, widespread",
    subsequent: "following, later",
    sufficient: "adequate",
    vulnerable: "susceptible, fragile"
  };
  return map[word] || "";
}

function confusingTip(word) {
  const map = {
    arbitral: "arbitral = 仲裁的；arbitrary = 武断的/任意的",
    affect: "affect = 影响；effect = 结果/影响",
    adverse: "adverse = 不利的；averse = 厌恶的",
    complement: "complement = 补充；compliment = 赞美",
    principal: "principal = 主要的；principle = 原则",
    stationary: "stationary = 静止的；stationery = 文具",
    symptom: "symptom = 症状；syndrome = 综合征",
    therapy: "therapy = 治疗法；therapeutic = 治疗性的"
  };
  return map[word] || "";
}

function wordFamilyTip(word) {
  const suffixes = [
    ["tion", "名词后缀 -tion，常表示动作/结果"],
    ["sion", "名词后缀 -sion，常表示动作/状态"],
    ["ity", "名词后缀 -ity，表示性质/状态"],
    ["ive", "形容词后缀 -ive，表示具有某种倾向"],
    ["al", "形容词后缀 -al，表示……的"],
    ["ous", "形容词后缀 -ous，表示充满/具有"],
    ["able", "形容词后缀 -able，表示能够……的"],
    ["ment", "名词后缀 -ment，表示行为/结果"]
  ];
  const suffix = suffixes.find(([key]) => word.endsWith(key));
  return suffix ? suffix[1] : "";
}

function withContextTranslation(display, word) {
  const text = String(display || "");
  if (text.includes("中文辅助：")) return text;
  if (word?.exampleTranslation) return `${text}\n\n中文翻译：${word.exampleTranslation}`;
  const english = text.replace(/^语境：\s*/, "").trim();
  return `${text}\n\n中文辅助：${translateContextForStudy(english, word)}`;
}

function translateContextForStudy(sentence, word) {
  const exact = [
    [
      /Ocular anomalies were frequently observed in this cohort of offspring born after in vitro fertilization\.?/i,
      "在这组体外受精后出生的后代中，经常观察到眼部异常。"
    ],
    [
      /The controversy about abortion has been going on in the United States for more than twenty years\.?/i,
      "关于堕胎的争议在美国已经持续了二十多年。"
    ]
  ];
  const hit = exact.find(([pattern]) => pattern.test(sentence));
  if (hit) return hit[1];

  const fragments = [
    [/in vitro fertilization/ig, "体外受精"],
    [/offspring/ig, "后代"],
    [/cohort/ig, "队列/群体"],
    [/ocular/ig, "眼部的"],
    [/anomalies/ig, "异常"],
    [/frequently/ig, "经常"],
    [/observed/ig, "观察到"],
    [/upper abdominal pain/ig, "上腹部疼痛"],
    [/fatty foods/ig, "油腻食物"],
    [/blood pressure/ig, "血压"],
    [/heart disease/ig, "心脏病"],
    [/clinical trial/ig, "临床试验"],
    [/public health/ig, "公共卫生"],
    [/immune system/ig, "免疫系统"],
    [/associated with/ig, "与……相关"],
    [/related to/ig, "与……有关"],
    [/patient/ig, "患者"],
    [/condition/ig, "情况/病情"],
    [/disease/ig, "疾病"],
    [/treatment/ig, "治疗"],
    [/diagnosis/ig, "诊断"],
    [/symptom/ig, "症状"],
    [/risk/ig, "风险"]
  ];
  const matched = fragments
    .filter(([pattern]) => pattern.test(sentence))
    .map(([, meaning]) => meaning);
  if (matched.length) {
    return `关键词提示：${[...new Set(matched)].join("；")}。本句核心词 ${word.word} = ${word.meaning}。`;
  }
  return `本句核心词 ${word.word} = ${word.meaning}。先抓主干，再看它在医学语境中的作用。`;
}

function buildBetterMemoryTip(word) {
  const curatedSummary = word?.memory?.summary ? String(word.memory.summary) : "";
  const curatedMorphology = window.MEDICAL_MORPHOLOGY?.format(word.word) || "";
  if (curatedSummary) return [curatedMorphology, curatedSummary].filter(Boolean).join("；");
  const lower = word.word.toLowerCase();
  const roots = [
    ["ab", "ab- = 离开/异常"],
    ["ad", "ad- = 朝向/加强"],
    ["anti", "anti- = 抗/反"],
    ["auto", "auto- = 自身/自动"],
    ["bio", "bio = 生命/生物"],
    ["cardio", "cardio = 心脏"],
    ["derm", "derm = 皮肤"],
    ["emia", "-emia = 血液状态"],
    ["gastro", "gastro = 胃"],
    ["gen", "gen = 产生/基因"],
    ["hepat", "hepat = 肝"],
    ["hyper", "hyper- = 过高/过度"],
    ["hypo", "hypo- = 过低/不足"],
    ["itis", "-itis = 炎症"],
    ["logy", "-logy = 学科/研究"],
    ["micro", "micro- = 微小"],
    ["neuro", "neuro = 神经"],
    ["oma", "-oma = 肿瘤"],
    ["osis", "-osis = 病变/状态"],
    ["pathy", "-pathy = 疾病"],
    ["pharm", "pharm = 药物"],
    ["psycho", "psycho = 心理/精神"],
    ["renal", "renal = 肾"],
    ["therapy", "therapy = 治疗"],
    ["trans", "trans- = 转移/穿过"]
  ];
  const synonyms = {
    acute: "severe, sharp",
    adverse: "harmful, unfavorable",
    aggression: "hostility, attack",
    alleviate: "relieve, ease",
    apparent: "obvious, seeming",
    arbitral: "related to arbitration; 区分 arbitrary = 武断的",
    arbitrary: "random, willful",
    abundant: "plentiful, ample",
    benign: "noncancerous",
    beneficial: "helpful, favorable",
    chronic: "long-lasting",
    deficiency: "shortage, lack",
    deteriorate: "worsen, decline",
    eradicate: "eliminate, wipe out",
    exacerbate: "worsen, aggravate",
    feasible: "practical, workable",
    impaired: "damaged, weakened",
    indispensable: "essential, necessary",
    intervention: "treatment, action",
    malignant: "cancerous",
    prevalent: "common, widespread",
    subsequent: "following, later",
    sufficient: "adequate",
    vulnerable: "susceptible, fragile"
  };
  const confusing = {
    arbitral: "arbitral = 仲裁的；arbitrary = 武断的/任意的",
    affect: "affect = 影响；effect = 结果/影响",
    adverse: "adverse = 不利的；averse = 厌恶的",
    complement: "complement = 补充；compliment = 赞美",
    principal: "principal = 主要的；principle = 原则",
    stationary: "stationary = 静止的；stationery = 文具",
    symptom: "symptom = 症状；syndrome = 综合征",
    therapy: "therapy = 治疗法；therapeutic = 治疗性的"
  };
  const suffixes = [
    ["tion", "词族：名词后缀 -tion，常表示动作/结果"],
    ["sion", "词族：名词后缀 -sion，常表示动作/状态"],
    ["ity", "词族：名词后缀 -ity，表示性质/状态"],
    ["ive", "词族：形容词后缀 -ive，表示具有某种倾向"],
    ["al", "词族：形容词后缀 -al，表示……的"],
    ["ous", "词族：形容词后缀 -ous，表示具有/充满"],
    ["able", "词族：形容词后缀 -able，表示能够……的"],
    ["ment", "词族：名词后缀 -ment，表示行为/结果"]
  ];
  const parts = [];
  const morphology = window.MEDICAL_MORPHOLOGY?.format(word.word);
  if (morphology) parts.push(morphology);
  const prefixRoots = new Set(["ab", "ad", "anti", "auto", "hyper", "hypo", "micro", "trans"]);
  const root = roots.find(([key]) => prefixRoots.has(key) ? lower.startsWith(key) : lower.includes(key));
  const suffix = suffixes.find(([key]) => lower.endsWith(key));
  if (root) parts.push(`词根：${root[1]}`);
  if (suffix) parts.push(suffix[1]);
  if (synonyms[lower]) parts.push(`同近义：${synonyms[lower]}`);
  if (confusing[lower]) parts.push(`易混：${confusing[lower]}`);
  parts.push(`记忆点：把 ${word.word} 放回真题语境里记，核心义是“${word.meaning}”。`);
  return parts.join("；");
}

function buildStoredMemoryNote(word) {
  const morphology = window.MEDICAL_MORPHOLOGY?.format(word.word) || "";
  if (word?.memory?.summary) return [morphology, String(word.memory.summary)].filter(Boolean).join("；");
  const generated = window.MEMORY_NOTES?.[word.word];
  if (generated) return [morphology, String(generated)].filter(Boolean).join("；");
  const fullTip = buildBetterMemoryTip(word);
  const answerMarker = fullTip.indexOf("；记忆点：");
  const clueOnly = answerMarker >= 0 ? fullTip.slice(0, answerMarker) : "";
  const parts = clueOnly
    .split("；")
    .filter(Boolean);
  const example = String(word.example || "").replace(/\s+/g, " ").trim();
  if (example.length > 20 && example.length <= 260 && !/[\u4e00-\u9fff]/.test(example) && new RegExp(escapeRegex(word.word), "i").test(example)) {
    const cloze = example.replace(new RegExp(escapeRegex(word.word), "ig"), "____");
    parts.push(`真题钩子：${cloze}`);
  }
  if (!parts.length) {
    parts.push(`语境联想：把它和“${word.category || "真题词汇"}”场景绑定，再回忆原句中的位置和词性。`);
  }
  return parts.join("；");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function currentAnswerText() {
  return state.currentForm?.form || state.current?.word || "";
}

function speak(text) {
  if (!text) return;
  const cleanText = String(text).trim();
  if (!cleanText) return;
  if (!state.speechUnlocked) {
    state.pendingSpeech = cleanText;
    return;
  }
  speakNow(cleanText);
}

function speakNow(text) {
  const synthesizer = window.speechSynthesis;
  const hasUsableVoice = state.voices.some(voice => /^en/i.test(voice.lang));
  if (!synthesizer || !hasUsableVoice) {
    speakWithOnlineAudio(text);
    return;
  }
  synthesizer.cancel();
  synthesizer.resume();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  if (state.voice) utterance.voice = state.voice;
  utterance.rate = 0.82;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onend = utterance.onerror = () => {
    if (state.utterance === utterance) state.utterance = null;
  };
  state.utterance = utterance;
  state.pendingSpeech = "";
  synthesizer.speak(utterance);
}

function speakWithOnlineAudio(text) {
  if (state.audio) {
    state.audio.pause();
    state.audio.currentTime = 0;
  }
  const source = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`;
  const audio = new Audio(source);
  audio.preload = "auto";
  state.audio = audio;
  state.pendingSpeech = "";
  audio.play().catch(() => {
    if (state.audio !== audio) return;
    state.pendingSpeech = text;
    state.speechUnlocked = false;
  });
}

function unlockSpeech() {
  if (state.speechUnlocked) return;
  state.speechUnlocked = true;
  const queuedText = state.pendingSpeech || currentAnswerText();
  if (queuedText) speakNow(queuedText);
}

function isLikelyMobileDevice() {
  return window.matchMedia?.("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function loadVoices() {
  if (!window.speechSynthesis) return;
  state.voices = window.speechSynthesis.getVoices();
  const savedVoice = localStorage.getItem("medicalVocabVoice");
  const preferredNames = [
    "Jenny",
    "Aria",
    "Guy",
    "Google US English",
    "Microsoft Zira",
    "Samantha",
    "Alex"
  ];
  state.voice = state.voices.find(voice => voice.name === savedVoice) ||
    state.voices.find(voice =>
    /en-US|en_GB|en-GB/i.test(voice.lang) &&
    preferredNames.some(name => voice.name.includes(name))
  ) || state.voices.find(voice => /en-US/i.test(voice.lang)) ||
    state.voices.find(voice => /^en/i.test(voice.lang)) ||
    null;
  renderVoiceOptions();
}

function renderVoiceOptions() {
  if (!els.voiceSelect) return;
  const englishVoices = state.voices.filter(voice => /^en/i.test(voice.lang));
  els.voiceSelect.innerHTML = "";
  if (!englishVoices.length) {
    const option = document.createElement("option");
    option.textContent = "在线美式发音";
    option.value = "";
    els.voiceSelect.appendChild(option);
    return;
  }
  englishVoices.forEach(voice => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    if (state.voice && voice.name === state.voice.name) option.selected = true;
    els.voiceSelect.appendChild(option);
  });
}

function saveMemory() {
  localStorage.setItem("medicalVocabMemory", JSON.stringify(state.memory));
  scheduleSync();
}

function saveWrongBook() {
  localStorage.setItem("medicalVocabWrongBook", JSON.stringify(state.wrong));
  scheduleSync();
}

function saveDailySession() {
  localStorage.setItem("medicalVocabDaily", JSON.stringify(state.daily));
  scheduleSync();
}

function saveWritingDaily() {
  localStorage.setItem("medicalWritingDaily", JSON.stringify(state.writingDaily));
  scheduleSync();
}

function saveWritingProgress() {
  localStorage.setItem("medicalWritingProgress", JSON.stringify(state.writingProgress));
  scheduleSync();
}

function saveWritingWordProgress() {
  localStorage.setItem("medicalWritingWordProgress", JSON.stringify(state.writingWordProgress));
  scheduleSync();
}

function saveWritingCustomWords() {
  localStorage.setItem("medicalWritingCustomWords", JSON.stringify(state.writingCustomWords));
  scheduleSync();
}

function resetProgress() {
  if (!confirm("确定清空本机记忆记录？")) return;
  state.memory = {};
  state.wrong = [];
  state.daily = null;
  state.sessionDone = 0;
  state.sessionCorrect = 0;
  saveMemory();
  saveWrongBook();
  localStorage.removeItem("medicalVocabDaily");
  buildDailySession();
  renderWrongList();
  renderCard();
}

async function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  let words = [];
  if (file.name.toLowerCase().endsWith(".json")) {
    words = JSON.parse(text);
  } else {
    words = parseCsvLike(text);
  }
  words = words
    .filter(item => item.word && item.meaning)
    .map(item => ({
      word: String(item.word).trim(),
      meaning: String(item.meaning).trim(),
      category: String(item.category || "导入词").trim(),
      example: String(item.example || "").trim()
    }));
  if (!words.length) {
    alert("没有识别到有效词条。");
    return;
  }
  state.words = mergeWords(state.words, words);
  state.daily = null;
  localStorage.removeItem("medicalVocabDaily");
  buildDailySession();
  renderCard();
}

function advanceCard() {
  if (!state.daily || !state.current) return;
  if (state.preview) {
    state.previewIndex = (state.previewIndex + 1) % state.previewDeck.length;
    renderCard();
    return;
  }
  if (state.daily.phase === "scheduled-review") {
    state.daily.scheduledReviewIndex += 1;
  } else if (state.daily.phase === "review") {
    const key = state.current.word;
    if (state.daily.wrongToday.includes(key)) {
      const current = state.daily.reviewQueue[state.daily.reviewIndex];
      state.daily.reviewQueue.push(current);
    }
    state.daily.reviewIndex += 1;
  } else {
    state.daily.index += 1;
  }
  saveDailySession();
  renderCard();
}

function startWrongReviewOrComplete() {
  const wrongToday = [...new Set(state.daily.wrongToday)];
  if (wrongToday.length) {
    state.daily.phase = "review";
    state.daily.reviewQueue = shuffle(wrongToday);
    state.daily.reviewIndex = 0;
    saveDailySession();
  } else {
    completeDailySession();
  }
}

function completeDailySession() {
  state.daily.phase = "done";
  state.daily.index = state.daily.deck.length;
  state.daily.reviewQueue = [];
  state.daily.reviewIndex = 0;
  state.daily.completed = true;
  saveDailySession();
  renderWrongStory();
}

function renderCompleteState() {
  state.locked = true;
  els.examMeta.classList.add("hidden");
  els.category.textContent = "今日完成";
  els.promptWord.textContent = "明天继续";
  els.promptHint.textContent = state.daily.mistakesToday.length
    ? `今天${DAILY_WORD_LIMIT}词和错词复习都完成了。普通词训练已锁定到明天。`
    : `今天${DAILY_WORD_LIMIT}词完成了，没有新增错词。普通词训练已锁定到明天。`;
  els.options.innerHTML = "";
  els.options.classList.add("hidden");
  els.recallActions.classList.add("hidden");
  els.contextPanel.classList.add("hidden");
  els.resultPanel.classList.add("hidden");
  els.recallMemory.classList.add("hidden");
  els.previewBtn.classList.remove("hidden");
  els.previewBtn.textContent = "临时预览词库";
  updateStats();
  renderWrongStory();
}

function togglePreview() {
  if (state.preview) {
    state.preview = false;
    state.previewDeck = [];
    state.previewIndex = 0;
    renderCard();
    return;
  }
  const todayWords = new Set(state.daily?.deck || []);
  const unseen = state.words.filter(word => !state.memory[word.word] && !todayWords.has(word.word));
  const pool = unseen.length ? unseen : state.words.filter(word => !todayWords.has(word.word));
  state.previewDeck = pool.slice(0, Math.min(50, pool.length)).map(word => word.word);
  if (!state.previewDeck.length) return;
  state.preview = true;
  state.previewIndex = 0;
  renderCard();
}

function getTodayKey() {
  return formatDateKey(new Date());
}

function dateKeyFromTimestamp(timestamp) {
  return formatDateKey(new Date(Number(timestamp)));
}

function previousDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return formatDateKey(date);
}

function formatDateKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function deckSignature() {
  return `v${DAILY_SESSION_VERSION}:${state.words.length}:${state.words.slice(0, 5).map(word => word.word).join("|")}:${state.words.slice(-5).map(word => word.word).join("|")}`;
}

function daySeed(date) {
  return date.split("-").reduce((sum, part) => sum + Number(part), 0);
}

function rotatePick(items, start, count) {
  if (!items.length) return [];
  return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);
}

function uniqueById(items) {
  const map = new Map();
  items.forEach(item => {
    if (item && item.id && !map.has(item.id)) map.set(item.id, item);
  });
  return [...map.values()];
}

function statusText(status) {
  if (status === "correct") return "已过";
  if (status === "weak") return "表达不熟";
  if (status === "wrong") return "不会写";
  return "未完成";
}

function writingWordStatusText(status) {
  if (status === "correct") return "拼写正确";
  if (status === "wrong") return "拼写错误，明天继续";
  return "未检查";
}

function renderReviewHtml(review) {
  const issues = Array.isArray(review.issues) ? review.issues : [];
  const issueText = issues.length
    ? issues.map(issue => `<li>${escapeHtml(issue.word)}：${escapeHtml(issue.reason || issue.meaning || "建议加入核心词")}</li>`).join("")
    : "<li>暂未发现需要加入核心词的明显问题。</li>";
  return `
    <p><strong>审查意见：</strong>${escapeHtml(review.feedback || "已完成审查。")}</p>
    <p><strong>修改版：</strong>${escapeHtml(review.revised || "")}</p>
    <ul>${issueText}</ul>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeAnswer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function uniqueWords(words) {
  const map = new Map();
  words.forEach(word => {
    if (word && word.word && !map.has(word.word.toLowerCase())) {
      map.set(word.word.toLowerCase(), word);
    }
  });
  return [...map.values()];
}

function uniqueWritingWords(words) {
  const map = new Map();
  words.forEach(word => {
    if (word && word.word && !map.has(normalizeAnswer(word.word))) {
      map.set(normalizeAnswer(word.word), word);
    }
  });
  return [...map.values()];
}

function allWritingWords() {
  const base = [
    ...(Array.isArray(window.WRITING_CORE_WORDS) ? window.WRITING_CORE_WORDS : []),
    ...(Array.isArray(window.EXAM_WRITING_WORDS) ? window.EXAM_WRITING_WORDS : [])
  ];
  return uniqueWritingWords([...state.writingCustomWords, ...base]);
}

function parseCsvLike(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const hasHeader = /^word\s*,\s*meaning/i.test(lines[0] || "");
  return lines.slice(hasHeader ? 1 : 0).map(line => {
    const parts = line.split(",").map(part => part.trim());
    return {
      word: parts[0],
      meaning: parts[1],
      category: parts[2] || "导入词",
      example: parts.slice(3).join(",")
    };
  });
}

function mergeWords(base, incoming) {
  const map = new Map(base.map(word => [word.word.toLowerCase(), word]));
  incoming.forEach(word => map.set(word.word.toLowerCase(), word));
  return [...map.values()];
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function nextDateKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
