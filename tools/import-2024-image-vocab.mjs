import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(root, "data", "words.json");
const jsPath = path.join(root, "data", "words.js");
const sourceFile = "codex-clipboard-8a3de271-2152-4261-a8e6-babf52e77046.png";

const rows = [
  ["entity", "noun"], ["accumulation", "noun"], ["repel", "verb"], ["hurdle", "verb"], ["bewilder", "verb"], ["pediatric", "adjective"], ["scale up", "phrase"],
  ["symbol", "noun"], ["attainment", "noun"], ["absorb", "verb"], ["subdue", "verb"], ["elaborate", "verb"], ["geriatric", "adjective"], ["in brief", "phrase"],
  ["trait", "noun"], ["despair", "noun"], ["tolerate", "verb"], ["flare", "verb"], ["perplex", "verb"], ["psychiatric", "adjective"], ["in common", "phrase"],
  ["version", "noun"], ["sacrifice", "noun"], ["ignore", "verb"], ["hamper", "verb"], ["intrigue", "verb"], ["obstetric", "adjective"], ["in force", "phrase"],
  ["conscience", "noun"], ["suffering", "noun"], ["articulate", "verb"], ["alleviate", "verb"], ["misled", "verb"], ["premature", "adjective"], ["in return", "phrase"],
  ["consensus", "noun"], ["damage", "noun"], ["deflate", "verb"], ["ease", "verb"], ["preliminary", "adjective"],
  ["consequence", "noun"], ["permeability", "noun"], ["modulate", "verb"], ["trigger", "verb"], ["primary", "adjective"],
  ["consonance", "noun"], ["feasibility", "noun"], ["ventilate", "verb"], ["distract", "verb"], ["uninformed", "adjective"],
  ["advantage", "noun"], ["vulnerability", "noun"], ["applaud", "verb"], ["address", "verb"], ["untimely", "adjective"],
  ["eligibility", "noun"], ["infertility", "noun"], ["commence", "verb"], ["aggregate", "verb"],
  ["credibility", "noun"], ["plunge", "noun"], ["stabilize", "verb"], ["clarify", "verb"],
  ["leverage", "noun"], ["tumble", "noun"], ["terminate", "verb"], ["separate", "verb"],
  ["contention", "noun"], ["dismay", "noun"], ["communicate", "verb"], ["classify", "verb"],
  ["detection", "noun"], ["surge", "noun"], ["contradict", "verb"], ["collect", "verb"],
  ["retention", "noun"], ["turmoil", "noun"], ["imply", "verb"], ["increase", "verb"],
  ["verification", "noun"], ["illustrate", "verb"], ["redirect", "verb"]
];

const details = {
  trait: ["n. 特征；特性", "Genetic traits may influence a child's susceptibility to certain diseases.", "遗传特征可能影响儿童对某些疾病的易感性。"],
  consonance: ["n. 一致；协调", "The recommendation is in consonance with current pediatric guidelines.", "该建议与现行儿科指南一致。"],
  leverage: ["n. 影响力；杠杆作用；优势", "Hospitals can leverage digital records to improve continuity of care.", "医院可以利用电子病历改善医疗连续性。"],
  attainment: ["n. 达成；成就", "Early intervention supports the attainment of age-appropriate developmental milestones.", "早期干预有助于儿童达到与年龄相符的发育里程碑。"],
  permeability: ["n. 渗透性；通透性", "Inflammation can increase vascular permeability and tissue edema.", "炎症会增加血管通透性并导致组织水肿。"],
  feasibility: ["n. 可行性", "The pilot study evaluated the feasibility of remote postoperative follow-up.", "这项初步研究评估了远程术后随访的可行性。"],
  infertility: ["n. 不孕；不育", "Cancer treatment may affect fertility and increase the risk of infertility.", "癌症治疗可能影响生育能力并增加不孕风险。"],
  plunge: ["n./v. 骤降；猛跌；投入", "Oxygen saturation may plunge when the airway becomes obstructed.", "气道阻塞时血氧饱和度可能骤降。"],
  tumble: ["n./v. 跌落；骤降", "Readmission rates tumbled after the follow-up program was introduced.", "随访项目实施后，再入院率显著下降。"],
  dismay: ["n./v. 沮丧；惊愕；使失望", "To the parents' dismay, the examination revealed another congenital anomaly.", "令家长沮丧的是，检查发现了另一处先天异常。"],
  repel: ["v. 排斥；击退", "The coating is designed to repel water and reduce bacterial adhesion.", "这种涂层旨在防水并减少细菌黏附。"],
  articulate: ["v. 清楚表达；明确阐述", "Physicians should articulate the benefits and risks before obtaining consent.", "医生在取得同意前应清楚说明获益与风险。"],
  deflate: ["v. 使泄气；放气；缩小", "The balloon should be deflated slowly before the catheter is removed.", "拔除导管前应缓慢释放球囊内气体。"],
  ventilate: ["v. 使通风；给……机械通气", "The team decided to ventilate the infant until respiratory function improved.", "团队决定为婴儿实施机械通气，直至呼吸功能改善。"],
  applaud: ["v. 赞扬；鼓掌", "Experts applauded the policy for expanding access to childhood vaccination.", "专家赞扬了扩大儿童疫苗接种覆盖面的政策。"],
  commence: ["v. 开始；着手", "Antibiotic treatment should commence as soon as sepsis is suspected.", "一旦怀疑脓毒症，就应尽快开始抗生素治疗。"],
  subdue: ["v. 抑制；控制；制服", "Low-dose medication was sufficient to subdue the inflammatory response.", "低剂量药物足以抑制炎症反应。"],
  flare: ["v./n. 突然加剧；复发；爆发", "Symptoms may flare after exposure to an environmental allergen.", "接触环境过敏原后，症状可能突然加重。"],
  ease: ["v./n. 缓解；减轻", "Clear communication can ease parental anxiety before surgery.", "清晰沟通可以缓解家长术前焦虑。"],
  classify: ["v. 分类；归类", "Researchers classify tumors according to their molecular characteristics.", "研究人员根据肿瘤的分子特征进行分类。"],
  redirect: ["v. 重新引导；改变方向；转诊", "The patient was redirected to a specialist pediatric center.", "患儿被转诊至专业儿童医学中心。"],
  bewilder: ["v. 使困惑；使迷惑", "Conflicting online advice can bewilder families seeking reliable treatment information.", "相互矛盾的网络建议会让寻求可靠治疗信息的家庭感到困惑。"],
  geriatric: ["adj. 老年医学的；老年人的", "Geriatric patients often require coordinated management of multiple chronic conditions.", "老年患者通常需要对多种慢性病进行协调管理。"],
  obstetric: ["adj. 产科的", "Obstetric ultrasound can identify fetal abnormalities before birth.", "产科超声可以在出生前发现胎儿异常。"],
  uninformed: ["adj. 不了解情况的；信息不足的", "An uninformed decision may expose the patient to avoidable risk.", "信息不足的决定可能使患者面临可避免的风险。"],
  "scale up": ["phr. 扩大规模；推广", "The program aims to scale up newborn screening across rural regions.", "该项目旨在农村地区扩大新生儿筛查规模。"],
  "in brief": ["phr. 简言之；概括地说", "In brief, early diagnosis substantially improves the prognosis.", "简言之，早期诊断可显著改善预后。"],
  "in common": ["phr. 共同；共有", "These disorders have several clinical features in common.", "这些疾病有若干共同的临床特征。"],
  "in force": ["phr. 生效；有效；在实施中", "The revised infection-control rules are now in force.", "修订后的感染控制规定现已生效。"],
  "in return": ["phr. 作为回报；反过来", "Clinicians provide clear guidance and, in return, receive more reliable follow-up data.", "临床医生提供清晰指导，并相应获得更可靠的随访数据。"]
};

const words = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const aliases = { misled: "mislead" };
const orderedKeys = rows.map(([word]) => aliases[word] || word);
const byWord = new Map(words.map(item => [String(item.word).toLowerCase(), item]));
let added = 0;
let updated = 0;

for (const [shownWord, partOfSpeech] of rows) {
  const word = aliases[shownWord] || shownWord;
  let item = byWord.get(word);
  const supplementalSource = { year: 2024, type: "真题词汇表", role: "词汇表", sourceFile, confidence: "supplemental", displayedForm: shownWord };
  if (!item) {
    const [meaning, example, exampleTranslation] = details[word] || details[shownWord];
    item = {
      id: word,
      word,
      meaning,
      phonetic: "",
      category: "2024真题词汇",
      example,
      exampleTranslation,
      exampleSource: { year: 2024, type: "AI补充例句", role: "AI例句", sourceFile, confidence: "generated" },
      source: "2024 真题词汇表（图片补充）",
      forms: [{ form: word, meaning, count: 1, years: [2024], types: ["真题词汇表"], writingRequired: false }],
      examCount: 1,
      years: [2024],
      typeCounts: { 真题词汇表: 1 },
      roleCounts: { 词汇表: 1 },
      priority: 95,
      writingRequired: false,
      medical: ["permeability", "infertility", "ventilate", "geriatric", "obstetric"].includes(word),
      meshValidated: false,
      wordNetValidated: false,
      levelTags: [],
      memory: { summary: `2024真题词汇：${meaning.replace(/^[a-z./ ]+\s*/i, "")}`, affix: "", synonyms: [], antonyms: [], confusable: "", collocations: [] },
      evidenceChunk: word[0],
      supplementalSources: [supplementalSource],
      partOfSpeech
    };
    words.push(item);
    byWord.set(word, item);
    added += 1;
  } else {
    item.years = [...new Set([...(item.years || []), 2024])].sort((a, b) => a - b);
    item.source = item.source?.includes("2024 真题词汇表") ? item.source : `${item.source ? `${item.source}；` : ""}2024 真题词汇表（图片补充）`;
    item.priority = Math.max(Number(item.priority || 0), 95);
    item.supplementalSources = [...(item.supplementalSources || []).filter(source => !(source.sourceFile === sourceFile && source.displayedForm === shownWord)), supplementalSource];
    item.partOfSpeech ||= partOfSpeech;
    if (shownWord === "misled") {
      item.forms ||= [];
      const misledForm = item.forms.find(form => form.form === "misled");
      if (misledForm) {
        misledForm.years = [...new Set([...(misledForm.years || []), 2024])].sort((a, b) => a - b);
        misledForm.types = [...new Set([...(misledForm.types || []), "真题词汇表"])];
      } else {
        item.forms.push({ form: "misled", meaning: "v. 误导（mislead的过去式和过去分词）", count: 1, years: [2024], types: ["真题词汇表"], writingRequired: false });
      }
    }
    updated += 1;
  }
}

const rank = new Map(orderedKeys.map((word, index) => [word, index]));
words.sort((a, b) => {
  const aRank = rank.has(a.word) ? rank.get(a.word) : Number.MAX_SAFE_INTEGER;
  const bRank = rank.has(b.word) ? rank.get(b.word) : Number.MAX_SAFE_INTEGER;
  return aRank - bRank;
});

fs.writeFileSync(jsonPath, `${JSON.stringify(words, null, 2)}\n`, "utf8");
fs.writeFileSync(jsPath, `window.DEFAULT_WORDS = ${JSON.stringify(words)};\n`, "utf8");
console.log(JSON.stringify({ input: rows.length, added, updated, total: words.length }));
