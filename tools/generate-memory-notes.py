import json
import re
from difflib import SequenceMatcher
from pathlib import Path

from nltk.corpus import wordnet as wn


ROOT = Path(__file__).resolve().parents[1]
WORDS_PATH = ROOT / "data" / "words.json"
JSON_PATH = ROOT / "data" / "memory-notes.json"
JS_PATH = ROOT / "data" / "memory-notes.js"

PREFIXES = {
    "ab": "离开、偏离",
    "ad": "朝向、加强",
    "anti": "抗、反",
    "auto": "自身、自动",
    "contra": "相反、对抗",
    "de": "去除、向下",
    "dis": "分离、否定",
    "extra": "外、超过",
    "hyper": "过高、过度",
    "hypo": "过低、不足",
    "inter": "在……之间",
    "intra": "在……内部",
    "mal": "不良、异常",
    "micro": "微小",
    "multi": "多",
    "non": "非、不",
    "post": "之后",
    "pre": "之前",
    "pro": "向前、促进",
    "re": "再次、返回",
    "sub": "下、次级",
    "super": "上、过度",
    "trans": "跨越、转移",
    "un": "不、相反",
}

ROOTS = {
    "abdomin": "腹部",
    "academ": "学术、学院",
    "accept": "接受",
    "access": "接近、进入",
    "account": "计算、说明、责任",
    "acu": "尖、锐",
    "adapt": "适应",
    "addict": "束缚、成瘾",
    "advers": "转向对立面",
    "arbitr": "裁决、仲裁",
    "allerg": "过敏反应",
    "alloc": "分配",
    "amyl": "淀粉、淀粉样物",
    "angi": "血管",
    "arthr": "关节",
    "bacter": "细菌",
    "benef": "好处、利益",
    "biot": "生命、生物",
    "blast": "胚细胞、幼稚细胞",
    "bronch": "支气管",
    "carcin": "癌",
    "cardi": "心脏",
    "cephal": "头",
    "cerebr": "脑",
    "chem": "化学、药物",
    "chol": "胆汁、胆固醇",
    "chron": "时间、长期",
    "cogn": "认识、认知",
    "commun": "共同、交流",
    "cort": "皮质",
    "crani": "颅",
    "cyt": "细胞",
    "dent": "牙",
    "derm": "皮肤",
    "diagnos": "辨别、诊断",
    "dict": "说、断言",
    "duct": "引导、传导",
    "embry": "胚胎",
    "endocrin": "内分泌",
    "enter": "肠",
    "epidemi": "人群中的疾病",
    "erythr": "红",
    "etiolog": "病因",
    "evid": "清楚、证据",
    "effic": "产生效果、效率",
    "equit": "公平、均衡",
    "feas": "可做、可行",
    "fibr": "纤维",
    "gastr": "胃",
    "genet": "遗传、基因",
    "genom": "基因组",
    "glyc": "糖",
    "govern": "治理、控制",
    "gynec": "女性、妇科",
    "hemat": "血液",
    "haemat": "血液",
    "hepat": "肝",
    "hist": "组织",
    "hormon": "激素",
    "immun": "免疫",
    "infect": "感染",
    "inflamm": "炎症、燃烧",
    "lapar": "腹部、腹壁",
    "legis": "法律",
    "liter": "文字、读写能力",
    "leuk": "白",
    "lip": "脂肪",
    "lith": "结石、石头",
    "malign": "恶性、有害",
    "mamm": "乳房",
    "medic": "医疗、医治",
    "metabol": "代谢、变化",
    "microb": "微生物",
    "morph": "形态",
    "myo": "肌肉",
    "nephr": "肾",
    "neur": "神经",
    "obstetr": "产科、分娩",
    "onc": "肿瘤",
    "ophthalm": "眼",
    "opt": "视力、选择",
    "orth": "正、直",
    "oste": "骨",
    "path": "疾病、病变",
    "pedi": "儿童",
    "pharm": "药物",
    "phleb": "静脉",
    "pneum": "肺、呼吸",
    "psych": "心理、精神",
    "pulmon": "肺",
    "radi": "射线、放射",
    "preval": "占优势、普遍存在",
    "prevent": "预防、阻止",
    "renal": "肾",
    "respir": "呼吸",
    "respons": "回应、责任",
    "rhin": "鼻",
    "sarc": "肉、结缔组织",
    "somat": "身体",
    "stat": "站立、状态",
    "sustain": "支撑、维持",
    "surg": "外科手术",
    "symptom": "症状",
    "therap": "治疗",
    "thromb": "血栓",
    "toxic": "毒、有害",
    "transplant": "移植",
    "trauma": "创伤",
    "urolog": "泌尿系统",
    "vaccin": "疫苗",
    "ven": "来、走",
    "vasc": "血管",
    "vir": "病毒",
    "vulner": "易受伤害",
    "normal": "规范、正常",
    "morbid": "疾病、病态",
    "mortal": "死亡",
    "regul": "规则、调节",
    "implement": "执行、实施",
    "assess": "评估",
    "assum": "承担、假定",
}

# 短词根很容易在无关单词中“撞字母”。只有位于词首、紧接有效前缀，
# 或列入人工确认的复合词时才采用；少数词首同形词则明确排除。
ROOT_ALLOW_MID = {
    ("acinetobacter", "bacter"),
    ("amyotrophic", "myo"),
    ("artificialrespiration", "respir"),
    ("cardiovascular", "vasc"),
    ("coronavirus", "vir"),
    ("physiotherapy", "therap"),
    ("psychotherapists", "therap"),
}

ROOT_EXCLUSIONS = {
    ("adopt", "opt"),
    ("cardinal", "cardi"),
    ("optimism", "opt"),
    ("optimistic", "opt"),
    ("veneration", "ven"),
}

POS_OVERRIDES = {
    "abuse": "v",
    "address": "v",
    "associate": "v",
    "check": "v",
    "complement": "v",
    "follow": "v",
    "followed": "v",
    "match": "v",
    "off": "a",
    "record": "v",
    "refuse": "v",
    "represent": "v",
    "resume": "v",
    "trace": "v",
    "trigger": "v",
}

SYNSET_OVERRIDES = {
    "address": "address.v.03",
    "associate": "associate.v.01",
    "off": "off.a.01",
    "operation": "surgery.n.01",
    "stress": "tension.n.01",
    "terminal": "terminal.s.04",
    "trigger": "trip.v.04",
    "well": "well.r.01",
}

MANUAL_NOTES = {
    "acinetobacter": "医学拆解：bacter = 细菌；Acinetobacter = 不动杆菌属。临床常见搭配：multidrug-resistant Acinetobacter = 多重耐药不动杆菌",
    "address": "搭配：address a problem / concern = 处理问题或担忧；一词多义：deliver an address = 发表演说，an email address = 邮箱地址",
    "aestheticism": "构词：aesthetic（审美的）+ -ism（主义、倾向）→ 唯美主义；词族：aesthetic / aesthetics",
    "alzheimer": "医学用法：Alzheimer's disease = 阿尔茨海默病；常见搭配：patients with Alzheimer's disease；注意专名首字母大写",
    "although": "句法：although + 从句，表示“尽管”；可与 yet / still 呼应，但不能与 but 同时连用",
    "amyotrophic": "医学拆解：a-（无、缺乏）+ myo（肌肉）+ troph（营养、生长）+ -ic；固定词组：amyotrophic lateral sclerosis (ALS) = 肌萎缩侧索硬化",
    "bacteriophages": "医学拆解：bacterio（细菌）+ phage（吞噬者）→ bacteriophage = 噬菌体，即感染细菌的病毒",
    "coronavirus": "医学拆解：corona（冠状）+ virus（病毒）；搭配：novel coronavirus = 新型冠状病毒，coronavirus infection = 冠状病毒感染",
    "else": "用法组：something else = 别的事物；or else = 否则；what else = 还有什么",
    "heritability": "构词：heritable（可遗传的）+ -ity（性质）→ 遗传度；辨析：heritability 是群体统计量，不等于个体患病概率",
    "inflammable": "易错提醒：inflammable = flammable = 易燃的，并不是“不易燃”；表示“不易燃”用 nonflammable / fire-resistant",
    "intervention": "医学搭配：clinical intervention = 临床干预；early intervention = 早期干预；intervention study = 干预研究；词族：intervene（干预）",
    "neurodegenerative": "医学拆解：neuro（神经）+ degenerative（退行性的）；搭配：neurodegenerative disease = 神经退行性疾病",
    "neuroplasticity": "医学拆解：neuro（神经）+ plasticity（可塑性）→ 神经可塑性；搭配：enhance neuroplasticity = 增强神经可塑性",
    "neurotransmitter": "医学拆解：neuro（神经）+ transmitter（传递者）→ 神经递质；搭配：release a neurotransmitter = 释放神经递质",
    "knudsen": "专有名词：Knudsen（人名）；在真题中以识别人名和句中逻辑为主，不作为普通词汇硬背",
    "lang": "专有名词：Lang（人名或姓氏）；看到首字母大写时优先按专名处理",
    "malnutritional": "构词：mal-（不良）+ nutritional（营养的）→ 营养不良的；更常见表达：malnourished / related to malnutrition",
    "morrell": "专有名词：Morrell（人名）；记住它是专名即可，重点理解所在真题句子的逻辑",
    "napster": "专有名词：Napster（网络音乐服务名称）；真题中按产品或公司名识别，不必拆词",
    "noncancerous": "构词：non-（非）+ cancerous（癌性的）→ 非癌性的；医学近义：benign（良性的），反义：malignant（恶性的）",
    "off": "用法组：be off = 离开或停止运行；turn off = 关闭；take time off = 请假。注意 of 是介词，off 强调离开、脱离",
    "operation": "医学搭配：undergo an operation = 接受手术；perform an operation = 实施手术；postoperative care = 术后护理",
    "pathogenesis": "医学拆解：patho（疾病）+ genesis（发生、起源）→ 发病机制；搭配：underlying pathogenesis = 潜在发病机制",
    "physiotherapy": "医学拆解：physio（身体功能）+ therapy（治疗）→ 物理治疗；近义表达：physical therapy",
    "revivable": "构词：revive（复苏、恢复）+ -able（能够……的）→ 可复苏的、可恢复的；词族：revival / resuscitation",
    "stress": "医学搭配：chronic stress = 慢性压力；under stress = 处于压力下；stress-related disorders = 压力相关疾病",
    "stroke": "医学辨析：stroke 单独出现常指卒中；heat stroke = 中暑；易混 heart attack = 心肌梗死",
    "sum": "搭配：the sum of = ……的总和；sum up = 总结。不要只记成 a sum of money（一笔钱）",
    "surveillance": "医学搭配：disease surveillance = 疾病监测；active surveillance = 主动监测；surveillance system = 监测系统",
    "sveiby": "专有名词：Sveiby（人名）；真题中辨认作者或学者身份即可，不作为普通词根拆解",
    "terminal": "医学搭配：terminal illness = 终末期疾病；terminal stage = 终末期；terminal care = 临终关怀",
    "trigger": "搭配：trigger a response / symptom = 引发反应或症状；记忆链：trigger（扳机）→ 扣动后使事件发生 → 触发",
    "trumble": "专有名词：Trumble（人名）；真题中识别为专名即可，不作为普通词汇硬背",
    "virulent": "医学辨析：virulent = 毒力强的、致病性强的；词族：virulence（毒力）；搭配：a highly virulent strain = 高毒力菌株",
    "ward": "医学搭配：hospital ward = 医院病房；pediatric ward = 儿科病房；ward off infection = 预防感染",
    "well": "用法：well 可修饰动词，表示“很好地/充分地”；be well 表示身体健康；as well as = 以及",
    "whereas": "句法：whereas 连接两个对照事实，表示“而、然而”；常用于比较两组研究结果或两种治疗方式",
}

SUFFIXES = {
    "ectomy": ("切除术", {"n"}),
    "ostomy": ("造口术", {"n"}),
    "otomy": ("切开术", {"n"}),
    "scopy": ("镜检、观察", {"n"}),
    "therapy": ("治疗", {"n"}),
    "pathy": ("疾病、病变", {"n"}),
    "logy": ("学科、研究", {"n"}),
    "emia": ("血液状态", {"n"}),
    "itis": ("炎症", {"n"}),
    "oma": ("肿瘤、肿块", {"n"}),
    "osis": ("病理状态、过程", {"n"}),
    "genic": ("产生……的", {"a", "s"}),
    "tion": ("名词：动作或结果", {"n"}),
    "sion": ("名词：动作或状态", {"n"}),
    "ment": ("名词：行为或结果", {"n"}),
    "ness": ("名词：性质或状态", {"n"}),
    "ability": ("名词：能力、性质", {"n"}),
    "ibility": ("名词：能力、性质", {"n"}),
    "ity": ("名词：性质或状态", {"n"}),
    "ance": ("名词：状态或行为", {"n"}),
    "ence": ("名词：状态或行为", {"n"}),
    "able": ("形容词：能够……的", {"a", "s"}),
    "ible": ("形容词：能够……的", {"a", "s"}),
    "ive": ("形容词：具有某种倾向", {"a", "s"}),
    "ous": ("形容词：具有、充满", {"a", "s"}),
    "ical": ("形容词：与……有关", {"a", "s"}),
    "al": ("形容词：与……有关", {"a", "s"}),
    "ic": ("形容词：与……有关", {"a", "s"}),
    "ize": ("动词：使成为", {"v"}),
    "ise": ("动词：使成为", {"v"}),
}

CONFUSIONS = {
    "accept": ["except"],
    "access": ["assess"],
    "adapt": ["adopt", "adept"],
    "adopt": ["adapt", "adept"],
    "adverse": ["averse"],
    "affect": ["effect"],
    "arbitral": ["arbitrary"],
    "causal": ["casual"],
    "complement": ["compliment"],
    "conscious": ["conscientious"],
    "disease": ["decease"],
    "economic": ["economical"],
    "effect": ["affect"],
    "eligible": ["illegible"],
    "eminent": ["imminent"],
    "ensure": ["assure", "insure"],
    "incidence": ["incident"],
    "later": ["latter"],
    "morbidity": ["mortality"],
    "mortality": ["morbidity"],
    "personal": ["personnel"],
    "physiological": ["psychological"],
    "precede": ["proceed"],
    "principal": ["principle"],
    "stationary": ["stationery"],
    "symptom": ["syndrome"],
}

POS_LABELS = {"n": "n.", "v": "v.", "a": "adj.", "s": "adj.", "r": "adv."}

BASIC_TOKENS = {
    "a": "一个",
    "an": "一个",
    "are": "be动词",
    "again": "再次",
    "based": "以……为基础",
    "bacteria": "细菌",
    "blood": "血液",
    "body": "身体",
    "cancer": "癌症",
    "cell": "细胞",
    "cells": "细胞",
    "disease": "疾病",
    "drug": "药物",
    "effect": "作用、影响",
    "effects": "作用、影响",
    "ethics": "伦理",
    "factor": "因素",
    "herd": "群体",
    "health": "健康",
    "immune": "免疫的",
    "medical": "医学的",
    "medicine": "医学、药物",
    "mental": "心理的、精神的",
    "patient": "患者",
    "public": "公共的",
    "reaction": "反应",
    "resistant": "耐药的、抵抗的",
    "risk": "风险",
    "pressure": "压力",
    "shot": "shoot的过去分词；拍摄、注射",
    "system": "系统",
    "treatment": "治疗",
    "trial": "试验",
}


def compact(text, limit):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip(" ,;:") + "…"


def infer_pos(item):
    word = item["word"].lower()
    if word in POS_OVERRIDES:
        return POS_OVERRIDES[word]
    meaning = item.get("meaning", "")
    if "的" in meaning or word.endswith(("ous", "ive", "able", "ible", "ical")):
        return "a"
    if word.endswith("ly"):
        return "r"
    if word.endswith(("tion", "sion", "ment", "ness", "ity", "ance", "ence", "oma", "itis", "osis", "emia")):
        return "n"
    if word.endswith(("ize", "ise", "ify")):
        return "v"
    return ""


def choose_synset(item):
    query = item["word"].lower().replace(" ", "_")
    override = SYNSET_OVERRIDES.get(item["word"].lower())
    if override:
        try:
            return wn.synset(override)
        except Exception:
            pass
    synsets = wn.synsets(query)
    if not synsets and "-" in query:
        synsets = wn.synsets(query.replace("-", "_"))
    if not synsets:
        return None
    preferred = infer_pos(item)
    if preferred:
        match = next((synset for synset in synsets if synset.pos() == preferred or (preferred == "a" and synset.pos() == "s")), None)
        if match:
            return match
    return synsets[0]


def component_meaning(token, meaning_map):
    if token.lower() in BASIC_TOKENS:
        return BASIC_TOKENS[token.lower()]
    value = meaning_map.get(token.lower(), "")
    if value:
        return compact(value, 20)
    synsets = wn.synsets(token.lower())
    if synsets:
        return compact(synsets[0].definition(), 32)
    return ""


def phrase_note(word, meaning_map):
    tokens = [token for token in re.split(r"[\s-]+", word.lower()) if token]
    if len(tokens) < 2:
        return ""
    parts = []
    for token in tokens[:4]:
        meaning = component_meaning(token, meaning_map)
        parts.append(f"{token}（{meaning}）" if meaning else token)
    return "词组结构：" + " + ".join(parts)


def morphology_note(word, pos):
    lower = word.lower()
    if not re.fullmatch(r"[a-z-]+", lower) or " " in lower:
        return ""
    root_matches = []
    for root, meaning in ROOTS.items():
        start = lower.find(root)
        if start < 0 or (lower, root) in ROOT_EXCLUSIONS:
            continue
        exact_prefix = any(lower.startswith(prefix) and len(prefix) == start for prefix in PREFIXES)
        verified_mid = (lower, root) in ROOT_ALLOW_MID
        if start != 0 and not exact_prefix and not verified_mid:
            continue
        root_matches.append((root, meaning, start))
    root_matches.sort(key=lambda item: (-len(item[0]), item[2]))
    selected_roots = []
    for candidate in root_matches:
        start = candidate[2]
        end = start + len(candidate[0])
        if any(not (end <= other[2] or start >= other[2] + len(other[0])) for other in selected_roots):
            continue
        selected_roots.append(candidate)
    selected_roots.sort(key=lambda item: item[2])
    if not selected_roots:
        return ""
    pieces = []
    root_start = selected_roots[0][2]
    root_end = selected_roots[-1][2] + len(selected_roots[-1][0])
    prefix_match = None
    if root_start > 0:
        prefix_match = next(
            ((prefix, meaning) for prefix, meaning in sorted(PREFIXES.items(), key=lambda item: -len(item[0])) if lower.startswith(prefix) and len(prefix) == root_start),
            None,
        )
    if prefix_match:
        pieces.append(f"{prefix_match[0]}-（{prefix_match[1]}）")
    for root, meaning, _ in selected_roots:
        pieces.append(f"{root}（{meaning}）")
    suffix_match = None
    for suffix, (meaning, allowed_pos) in sorted(SUFFIXES.items(), key=lambda item: -len(item[0])):
        if not lower.endswith(suffix):
            continue
        suffix_start = len(lower) - len(suffix)
        if suffix_start < root_end:
            continue
        if suffix in {"ectomy", "ostomy", "otomy", "scopy", "therapy", "pathy", "logy", "emia", "itis", "oma", "osis", "genic"} or not pos or pos in allowed_pos:
            suffix_match = (suffix, meaning)
            break
    if suffix_match:
        pieces.append(f"-{suffix_match[0]}（{suffix_match[1]}）")
    if not pieces:
        return ""
    return "拆解：" + " + ".join(pieces)


def synonyms_and_family(word, synset):
    if not synset:
        return [], []
    normalized = word.lower().replace(" ", "_")
    synonyms = []
    for lemma in synset.lemmas():
        candidate = lemma.name().replace("_", " ")
        if lemma.name().lower() != normalized and candidate.lower() != word.lower() and candidate not in synonyms:
            synonyms.append(candidate)
    family = []
    target_names = {word.lower().replace(" ", "_"), word.lower().replace("-", "_")}
    target_lemmas = [lemma for lemma in synset.lemmas() if lemma.name().lower() in target_names]
    if not target_lemmas:
        target_lemmas = synset.lemmas()[:1]
    for lemma in target_lemmas:
        for derived in lemma.derivationally_related_forms():
            candidate = derived.name().replace("_", " ")
            if candidate.lower() != word.lower() and candidate not in family and " " not in candidate:
                family.append(candidate)
    return synonyms[:3], family[:4]


def close_words(word, all_words, meaning_map):
    if " " in word or len(word) < 5:
        return []
    manual = CONFUSIONS.get(word.lower(), [])
    candidates = []
    for candidate in manual:
        candidates.append(candidate)
    if len(candidates) < 2:
        for candidate in all_words:
            if candidate == word or " " in candidate or abs(len(candidate) - len(word)) > 2:
                continue
            if candidate.rstrip("s") == word.rstrip("s"):
                continue
            ratio = SequenceMatcher(None, word.lower(), candidate.lower()).ratio()
            if ratio >= 0.86:
                candidates.append(candidate)
    result = []
    for candidate in candidates:
        if candidate.lower() == word.lower() or candidate in result:
            continue
        meaning = meaning_map.get(candidate.lower(), "")
        result.append(f"{candidate}（{compact(meaning, 18)}）" if meaning else candidate)
        if len(result) == 2:
            break
    return result


def useful_example(item):
    word = item["word"]
    example = re.sub(r"\s+", " ", item.get("example", "")).strip()
    if not 22 <= len(example) <= 260 or re.search(r"[\u4e00-\u9fff]", example):
        return ""
    if not re.match(r"^[A-Z\"']", example) or re.search(r"Part\s+[IVX]|Directions:|\d+%", example, re.IGNORECASE):
        return ""
    pattern = re.compile(re.escape(word), re.IGNORECASE)
    if not pattern.search(example):
        return ""
    return compact(pattern.sub("____", example), 180)


def build_note(item, all_words, meaning_map):
    word = item["word"].strip()
    if word.lower() in MANUAL_NOTES:
        sections = [MANUAL_NOTES[word.lower()]]
        example = useful_example(item)
        if example:
            sections.append("真题钩子：" + example)
        return "；".join(sections)
    synset = choose_synset(item)
    pos = synset.pos() if synset else infer_pos(item)
    sections = []
    if " " in word or "-" in word:
        phrase = phrase_note(word, meaning_map)
        if phrase:
            sections.append(phrase)
    else:
        morphology = morphology_note(word, pos)
        if morphology:
            sections.append(morphology)
    synonyms, family = synonyms_and_family(word, synset)
    if family:
        sections.append("词族：" + " / ".join(family))
    if synonyms:
        sections.append("同义近义：" + " / ".join(synonyms))
    confusions = close_words(word, all_words, meaning_map)
    if confusions:
        sections.append("易混近形：" + "；".join(confusions))
    example = useful_example(item)
    if example:
        sections.append("真题钩子：" + example)
    elif synset:
        pos_label = POS_LABELS.get(synset.pos(), "")
        sections.append(f"英英钩子：{pos_label} {compact(synset.definition(), 120)}".strip())
    if not sections:
        sections.append(f"语境钩子：把它固定在“{item.get('category') or '真题词汇'}”题型中，回忆原句位置与词性。")
    priorities = {"拆解": 0, "词组结构": 0, "词族": 1, "同义近义": 2, "易混近形": 3, "真题钩子": 4, "英英钩子": 4, "语境钩子": 4}
    sections.sort(key=lambda section: priorities.get(section.split("：", 1)[0], 9))
    if len(sections) > 4:
        hook = next((section for section in sections if section.startswith(("真题钩子：", "英英钩子："))), None)
        selected = sections[:3]
        if hook and hook not in selected:
            selected.append(hook)
        else:
            selected = sections[:4]
        sections = selected
    return "；".join(sections)


def main():
    words = json.loads(WORDS_PATH.read_text(encoding="utf-8"))
    meaning_map = {item["word"].lower(): item.get("meaning", "") for item in words}
    all_words = [item["word"] for item in words]
    notes = {item["word"]: build_note(item, all_words, meaning_map) for item in words}
    JSON_PATH.write_text(json.dumps(notes, ensure_ascii=False, indent=2), encoding="utf-8")
    JS_PATH.write_text("window.MEMORY_NOTES_VERSION = 4;\nwindow.MEMORY_NOTES = " + json.dumps(notes, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    counts = {
        "total": len(notes),
        "morphology": sum("拆解：" in note for note in notes.values()),
        "family": sum("词族：" in note for note in notes.values()),
        "synonyms": sum("同义近义：" in note for note in notes.values()),
        "confusions": sum("易混近形：" in note for note in notes.values()),
        "exam_context": sum("真题钩子：" in note for note in notes.values()),
        "english_definition": sum("英英钩子：" in note for note in notes.values()),
    }
    print(json.dumps(counts, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
