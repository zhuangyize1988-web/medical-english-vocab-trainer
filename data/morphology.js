(function initMorphology(global) {
  "use strict";

  const prefixes = [
    ["super", "在上、超过"], ["under", "在下、不足"], ["inter", "相互、在……之间"],
    ["trans", "转移、穿过、转变"], ["over", "在上、过度"], ["anti", "反对、抵抗"],
    ["hyper", "过高、过度"], ["hypo", "过低、不足"], ["micro", "微小"],
    ["pre", "在前、预先"], ["pro", "向前、赞成"], ["sur", "在上、超过"],
    ["sub", "在下、次级"], ["sup", "在下；sub- 的同化形式"], ["con", "共同、一起"],
    ["com", "共同、一起"], ["col", "共同、一起；con- 的同化形式"], ["dis", "分开、否定"],
    ["dif", "分开；dis- 的同化形式"], ["per", "贯穿、完全"], ["ex", "向外、出"],
    ["ef", "向外；ex- 的同化形式"], ["re", "向后、再次"], ["in", "向内；也可表否定"],
    ["im", "向内；也可表否定，是 in- 的同化形式"], ["un", "否定、相反"],
    ["il", "否定；in- 的同化形式"], ["ab", "离开、偏离"], ["de", "向下、去除、反向"],
    ["co", "共同、一起"]
  ];

  const roots = [
    ["cardio", "心脏"], ["cephal", "头"], ["gastro", "胃"], ["hepat", "肝"],
    ["neuro", "神经"], ["psycho", "心理、精神"], ["psych", "心理、精神"], ["pharm", "药物"],
    ["therapy", "治疗"], ["obstetr", "分娩、产科"], ["pedi", "儿童"], ["geri", "老年"],
    ["cumul", "堆积、累积"], ["sumpt", "取、拿；引申为使用、消费"], ["scribe", "写"],
    ["spect", "看"], ["press", "压"], ["tract", "拉、牵引"], ["clude", "关闭"],
    ["gress", "走、步"], ["ject", "投、掷"], ["dict", "说、宣告"], ["duce", "引导、带领"],
    ["tain", "握住、保持"], ["serve", "保存、服务"], ["claim", "呼喊、声称"],
    ["port", "携带、运送"], ["vent", "来、到来"], ["pose", "放置"], ["norm", "规范、标准"],
    ["view", "看"], ["rupt", "破裂"], ["radi", "射线、辐射"], ["dense", "稠密"],
    ["sens", "感觉"], ["sent", "感觉"], ["lect", "选择、阅读"], ["ceed", "走、前进"],
    ["valu", "价值"], ["vis", "看"], ["leg", "选择、阅读"], ["nov", "新"],
    ["fer", "携带、带来"], ["flu", "流动"], ["sim", "相同、相似"], ["her", "黏附、连接"],
    ["bio", "生命、生物"], ["derm", "皮肤"], ["gen", "产生、基因"], ["path", "疾病"],
    ["pati", "承受、忍受"], ["rect", "直、引导"], ["pet", "寻求、追求、奔向"],
    ["pneum", "肺、呼吸"], ["onc", "肿瘤"], ["hemat", "血液"], ["hem", "血液"]
  ];

  const suffixes = [
    ["ation", "名词后缀：动作、过程或结果"], ["ality", "名词后缀：性质或状态"],
    ["ence", "名词后缀：性质或状态"], ["ance", "名词后缀：性质或状态"],
    ["ible", "形容词后缀：能够……的"], ["able", "形容词后缀：能够……的"],
    ["ment", "名词后缀：行为、过程或结果"], ["ness", "名词后缀：性质或状态"],
    ["tion", "名词后缀：动作、过程或结果"], ["sion", "名词后缀：动作、过程或状态"],
    ["yze", "动词后缀：使成为、进行"], ["yse", "动词后缀：使成为、进行"],
    ["ize", "动词后缀：使成为、进行"], ["ise", "动词后缀：使成为、进行"],
    ["ify", "动词后缀：使成为"], ["ian", "名词/形容词后缀：从事者或与……有关的"],
    ["ism", "名词后缀：学说、制度或状态"], ["ory", "名词/形容词后缀：场所、事物或与……有关的"],
    ["ity", "名词后缀：性质或状态"], ["ive", "形容词后缀：具有某种性质或倾向"],
    ["ous", "形容词后缀：具有、充满"], ["ful", "形容词后缀：充满、具有"],
    ["ant", "名词/形容词后缀：人、物或具有某性质"], ["ent", "名词/形容词后缀：人、物或具有某性质"],
    ["ate", "动词/形容词后缀：使成为或具有"], ["ute", "常见词尾：需结合具体词族判断词性"],
    ["ion", "名词后缀：动作、过程或结果"], ["al", "形容词后缀：与……有关的"],
    ["ed", "形容词/分词后缀：已经……的"], ["en", "动词后缀：使成为"],
    ["ic", "形容词后缀：与……有关的"],
    ["ish", "动词/形容词后缀：使成为或略带……的"], ["an", "名词/形容词后缀：人或与……有关的"]
  ];

  function longestMatch(items, predicate) {
    return items
      .filter(([token]) => predicate(token))
      .sort((a, b) => b[0].length - a[0].length)[0] || null;
  }

  function analyze(rawWord) {
    const originalWord = String(rawWord || "").toLowerCase().trim();
    if (!/^[a-z]+$/.test(originalWord) || originalWord.length < 5) return null;
    const word = originalWord.endsWith("s") && !originalWord.endsWith("ss")
      ? originalWord.slice(0, -1)
      : originalWord;

    let prefix = longestMatch(prefixes, token => word.startsWith(token) && word.length - token.length >= 3);
    const assimilated = word.match(/^a([cdfglnprst])\1/);
    if (assimilated) {
      prefix = [`a${assimilated[1]}`, "朝向、加强；ad- 的同化形式"];
    }

    const suffix = longestMatch(suffixes, token => word.endsWith(token) && word.length - token.length >= 3);
    const coreStart = prefix ? prefix[0].length : 0;
    const coreEnd = suffix ? word.length - suffix[0].length : word.length;
    const core = word.slice(coreStart, Math.max(coreStart, coreEnd));
    const root = longestMatch(roots, token => {
      if (token.length >= 4) return core.includes(token) || word.includes(token);
      return core === token || core.startsWith(token) || core.endsWith(token)
        || word.startsWith(token) || word.endsWith(token);
    });

    // A prefix and suffix alone can create a plausible-looking but false split.
    // Require a verified root so the app stays conservative.
    if (!root) return null;

    return {
      word: originalWord,
      prefix: prefix ? { form: `${prefix[0]}-`, meaning: prefix[1] } : null,
      root: root ? { form: root[0], meaning: root[1] } : null,
      suffix: suffix ? { form: `-${suffix[0]}`, meaning: suffix[1] } : null
    };
  }

  function format(rawWord) {
    const result = analyze(rawWord);
    if (!result) return "";
    const pieces = [result.prefix, result.root, result.suffix]
      .filter(Boolean)
      .map(part => `${part.form}（${part.meaning}）`);
    return `词素拆解：${pieces.join(" + ")}`;
  }

  global.MEDICAL_MORPHOLOGY = { prefixes, roots, suffixes, analyze, format };
})(typeof window !== "undefined" ? window : globalThis);
