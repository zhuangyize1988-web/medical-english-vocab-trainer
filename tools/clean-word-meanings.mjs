import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(root, "data", "words.json");
const jsPath = path.join(root, "data", "words.js");

const corrections = {
  address: "处理；解决；演说；地址",
  alone: "独自；单独",
  approach: "方法；接近；处理",
  animal: "动物",
  animals: "动物（复数）",
  astonishingly: "令人惊讶地",
  author: "作者",
  aware: "意识到的；知晓的",
  away: "离开；在远处",
  bay: "海湾；使无法接近",
  bonus: "奖金；额外好处",
  case: "情况；病例；案例",
  coincidence: "巧合",
  detrimental: "有害的；不利的",
  devastating: "毁灭性的；破坏性极强的",
  diseases: "疾病（复数）",
  eating: "饮食；进食",
  else: "其他；否则",
  energy: "能量；精力",
  enough: "足够的；足够地",
  fascinated: "着迷的；被吸引的",
  follow: "跟随；接着发生；遵循",
  foot: "脚；英尺；底部",
  fortunes: "命运；财富",
  graphic: "图解的；生动的",
  horses: "马（复数）",
  however: "然而；无论如何",
  hours: "小时（复数）",
  index: "指数；索引",
  indicator: "指标；指示物",
  information: "信息；资料",
  ingenuity: "独创性；聪明才智",
  knuckle: "指关节",
  lonely: "孤独的；寂寞的",
  memory: "记忆；记忆力",
  moments: "时刻；片刻",
  nash: "纳什（人名）",
  number: "数字；数量",
  off: "离开；关闭；停止运行",
  often: "经常；常常",
  out: "在外；熄灭；失去知觉",
  pattern: "模式；图案；规律",
  pretext: "借口；托词",
  problem: "问题；难题",
  results: "结果（复数）",
  school: "学校；学派",
  scientific: "科学的",
  services: "服务；医疗或公共服务（复数）",
  sheet: "薄片；表格；床单",
  silent: "沉默的；无声的",
  sleep: "睡眠；睡觉",
  social: "社会的；社交的",
  somatic: "躯体的；身体的",
  still: "仍然；静止的",
  students: "学生（复数）",
  supervise: "监督；指导",
  sustain: "维持；支撑",
  though: "尽管；然而",
  transaction: "交易；事务",
  transformation: "转变；转化",
  transition: "过渡；转变",
  transmission: "传播；传递",
  transparency: "透明度；透明性",
  trumble: "特朗布尔（人名）",
  ward: "病房；防止",
};

const words = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
let changed = 0;
for (const item of words) {
  if (!Object.hasOwn(corrections, item.word)) continue;
  item.meaning = corrections[item.word];
  changed += 1;
}

fs.writeFileSync(jsonPath, `${JSON.stringify(words, null, 2)}\n`, "utf8");
fs.writeFileSync(jsPath, `window.DEFAULT_WORDS = ${JSON.stringify(words)};\n`, "utf8");
console.log(JSON.stringify({ changed, total: words.length }));
