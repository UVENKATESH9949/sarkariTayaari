// Generates a large volume of synthetic, bilingual (EN/HI) questions for TICKET-501
// load testing. This is deliberately NOT real editorial content — questions are
// templated/randomized (math with random numbers, reasoning puzzles from fixed
// families, GK/Science/Computer facts cycled from a curated bank with varied
// phrasing) so the content is real-shaped and every correct answer is genuinely
// correct, but it is not meant to survive as final published content. See
// reports/12-load-test-data-seeding/ for how this was verified.
//
// Every created question id is appended to load-test-seed-manifest.json in this
// folder, so this batch can be found and removed later via POST
// /api/questions/bulk-delete without guessing which rows are which.
//
// Usage: node scripts/generate-load-test-questions.js <adminToken>

const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:8080";
const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error("Usage: node generate-load-test-questions.js <adminToken>");
  process.exit(1);
}

// Second pass (2026-08-19): roughly doubles the first run's volume, pushing the
// total question count from ~14,000 toward V1.2's TICKET-701 target of 20k-50k+.
// This is additive on top of the existing questions (see the manifest-merge logic
// in main() below) — running this script again does not replace the first batch.
const TARGETS = {
  "Quantitative Aptitude": 7000,
  "Reasoning": 7000,
  "English": 4400,
  "General Awareness": 2600,
  "General Science": 1400,
  "Computer Knowledge": 1400,
};
const DIFFICULTIES = ["easy", "medium", "hard"];
// Smaller than the sync page-size convention (500) on purpose: bulk-importing 500
// questions each tagged to every exam sharing that subject (up to 10) turned out to
// create enough exam-link/translation write fan-out that the very first batch never
// completed in 8+ minutes against the real remote Postgres — a genuine TICKET-501
// finding in its own right, see reports/12-load-test-data-seeding/. Tagging a realistic
// subset of exams per question (see pickExamSubset) plus a smaller batch fixed it.
const BATCH_SIZE = 150;
const MANIFEST_PATH = path.join(__dirname, "load-test-seed-manifest.json");

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
/** A realistic subset (2-4) of the exams that share a subject, not every single one. */
function pickExamSubset(examCodes) {
  if (examCodes.length <= 2) return examCodes;
  const n = Math.min(examCodes.length, rand(2, 4));
  return shuffle(examCodes).slice(0, n);
}
function pick(arr) { return arr[rand(0, arr.length - 1)]; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function api(path, opts = {}, timeoutMs = 120_000) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Builds a 4-option MCQ from a correct value + 3 distinct distractors, shuffled. */
function mcq(correctValue, distractors, toText = (v) => String(v)) {
  const pool = shuffle([correctValue, ...distractors.filter((d) => d !== correctValue).slice(0, 3)]);
  while (pool.length < 4) pool.push(pool[pool.length - 1] + 1); // pad if distractors collided
  const options = pool.map(toText);
  const correctIndex = pool.indexOf(correctValue);
  return { options, correctIndex, correctLetter: "ABCD"[correctIndex] };
}

function numericDistractors(correct, spread) {
  // Needs at least 6 distinct offsets to fill the set below — a spread of 2 only gives
  // 4 possible offsets (-2,-1,1,2), which made this loop below spin forever. This is
  // exactly the kind of bug load-testing this script was meant to surface, just in the
  // generator itself rather than the backend.
  spread = Math.max(spread, 3);
  const set = new Set();
  while (set.size < 6) {
    const d = correct + rand(-spread, spread);
    if (d !== correct && d > -1000) set.add(d);
  }
  return [...set];
}

/* ------------------------------------------------------------- Quant families */

const quant = {
  percentage(en, hi) {
    const y = rand(20, 400), x = pick([5, 10, 12, 15, 20, 25, 30, 40, 50]);
    const ans = Math.round((x / 100) * y);
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, Math.max(4, Math.round(ans * 0.2))));
    en.push(`What is ${x}% of ${y}?`); hi.push(`${y} का ${x}% कितना है?`);
    return { options, correctIndex, explanation: [`${x}% of ${y} = (${x}/100) x ${y} = ${ans}.`, `${x}% of ${y} = (${x}/100) x ${y} = ${ans}.`] };
  },
  average(en, hi) {
    const n = rand(3, 5);
    const nums = Array.from({ length: n }, () => rand(5, 100));
    const sum = nums.reduce((a, b) => a + b, 0);
    const ans = Math.round(sum / n);
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, 5));
    en.push(`Find the average of ${nums.join(", ")}.`); hi.push(`${nums.join(", ")} का औसत ज्ञात करें।`);
    return { options, correctIndex, explanation: [`Average = (${nums.join("+")})/${n} = ${sum}/${n} = ${ans}.`, `औसत = (${nums.join("+")})/${n} = ${sum}/${n} = ${ans}।`] };
  },
  profitLoss(en, hi) {
    const cost = rand(100, 2000);
    const pct = pick([5, 10, 12, 15, 20, 25]);
    const isProfit = Math.random() > 0.4;
    const sell = isProfit ? Math.round(cost * (1 + pct / 100)) : Math.round(cost * (1 - pct / 100));
    const label = isProfit ? "profit" : "loss";
    const labelHi = isProfit ? "लाभ" : "हानि";
    const { options, correctIndex } = mcq(pct, [pct - 5, pct + 5, pct + 10, pct - 2].filter((v) => v > 0), (v) => `${v}%`);
    en.push(`A shopkeeper buys an article for Rs ${cost} and sells it for Rs ${sell}. Find his ${label} percentage.`);
    hi.push(`एक दुकानदार एक वस्तु को ₹${cost} में खरीदता है और ₹${sell} में बेचता है। उसका ${labelHi} प्रतिशत ज्ञात करें।`);
    return { options, correctIndex, explanation: [`${label[0].toUpperCase() + label.slice(1)} % = (|${sell}-${cost}|/${cost}) x 100 = ${pct}%.`, `${labelHi} % = (|${sell}-${cost}|/${cost}) x 100 = ${pct}%।`] };
  },
  simpleInterest(en, hi) {
    const p = pick([1000, 2000, 5000, 8000, 10000]), r = pick([4, 5, 6, 8, 10]), t = rand(1, 5);
    const ans = Math.round((p * r * t) / 100);
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, Math.max(20, Math.round(ans * 0.15))));
    en.push(`Find the simple interest on Rs ${p} at ${r}% per annum for ${t} year(s).`);
    hi.push(`₹${p} पर ${r}% वार्षिक दर से ${t} वर्ष का साधारण ब्याज ज्ञात करें।`);
    return { options, correctIndex, explanation: [`SI = (P x R x T)/100 = (${p} x ${r} x ${t})/100 = ${ans}.`, `साधारण ब्याज = (P x R x T)/100 = (${p} x ${r} x ${t})/100 = ${ans}।`] };
  },
  compoundInterest(en, hi) {
    const p = pick([1000, 2000, 4000, 5000, 10000]), r = pick([5, 10, 20]);
    const ans = Math.round(p * Math.pow(1 + r / 100, 2) - p);
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, Math.max(20, Math.round(ans * 0.15))));
    en.push(`Find the compound interest on Rs ${p} at ${r}% per annum for 2 years, compounded annually.`);
    hi.push(`₹${p} पर ${r}% वार्षिक दर से 2 वर्ष का चक्रवृद्धि ब्याज (वार्षिक चक्रवृद्धि) ज्ञात करें।`);
    return { options, correctIndex, explanation: [`CI = P(1+R/100)^2 - P = ${ans}.`, `चक्रवृद्धि ब्याज = P(1+R/100)^2 - P = ${ans}।`] };
  },
  timeWork(en, hi) {
    const a = rand(6, 20), b = rand(6, 20);
    const ans = Math.round((a * b) / (a + b) * 10) / 10;
    const { options, correctIndex } = mcq(ans, [ans + 1, ans - 1, ans + 2, ans - 0.5].map((v) => Math.round(v * 10) / 10));
    en.push(`A can complete a work in ${a} days and B in ${b} days. In how many days will they complete it together?`);
    hi.push(`A एक कार्य को ${a} दिनों में और B उसे ${b} दिनों में पूरा कर सकता है। दोनों मिलकर उस कार्य को कितने दिनों में पूरा करेंगे?`);
    return { options: options.map((v) => `${v} days`), correctIndex, explanation: [`Together = (A x B)/(A+B) = (${a} x ${b})/(${a + b}) = ${ans} days.`, `साथ में = (A x B)/(A+B) = (${a} x ${b})/(${a + b}) = ${ans} दिन।`] };
  },
  timeSpeedDistance(en, hi) {
    const s = rand(30, 100), t = rand(2, 8);
    const ans = s * t;
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, 20));
    en.push(`A car travels at ${s} km/hr. How much distance will it cover in ${t} hours?`);
    hi.push(`एक कार ${s} किमी/घंटा की गति से चलती है। यह ${t} घंटों में कितनी दूरी तय करेगी?`);
    return { options: options.map((v) => `${v} km`), correctIndex, explanation: [`Distance = Speed x Time = ${s} x ${t} = ${ans} km.`, `दूरी = चाल x समय = ${s} x ${t} = ${ans} किमी।`] };
  },
  ratio(en, hi) {
    const total = pick([100, 200, 500, 1000, 1200]);
    const x = rand(1, 5), y = rand(1, 5);
    const smaller = Math.round((Math.min(x, y) / (x + y)) * total);
    const { options, correctIndex } = mcq(smaller, numericDistractors(smaller, Math.max(5, Math.round(smaller * 0.2))));
    en.push(`Divide Rs ${total} in the ratio ${x}:${y}. Find the smaller share.`);
    hi.push(`₹${total} को ${x}:${y} के अनुपात में बांटें। छोटा हिस्सा ज्ञात करें।`);
    return { options, correctIndex, explanation: [`Smaller share = ${total} x ${Math.min(x, y)}/${x + y} = ${smaller}.`, `छोटा हिस्सा = ${total} x ${Math.min(x, y)}/${x + y} = ${smaller}।`] };
  },
  simplification(en, hi) {
    const a = rand(5, 30), b = rand(2, 12), c = rand(2, 9), d = rand(1, 20);
    const ans = a + b * c - d;
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, 6));
    en.push(`Simplify: ${a} + ${b} x ${c} - ${d}`); hi.push(`सरल करें: ${a} + ${b} x ${c} - ${d}`);
    return { options, correctIndex, explanation: [`By order of operations: ${b}x${c}=${b * c}, then ${a}+${b * c}-${d}=${ans}.`, `संक्रिया के क्रम से: ${b}x${c}=${b * c}, फिर ${a}+${b * c}-${d}=${ans}।`] };
  },
  numberSeries(en, hi) {
    const start = rand(2, 20), diff = rand(2, 9);
    const seq = [start, start + diff, start + 2 * diff, start + 3 * diff];
    const ans = start + 4 * diff;
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, diff));
    en.push(`Find the next number in the series: ${seq.join(", ")}, ?`); hi.push(`श्रृंखला में अगली संख्या ज्ञात करें: ${seq.join(", ")}, ?`);
    return { options, correctIndex, explanation: [`Each term increases by ${diff}, so the next term is ${seq[3]}+${diff}=${ans}.`, `प्रत्येक पद ${diff} से बढ़ता है, इसलिए अगला पद ${seq[3]}+${diff}=${ans} है।`] };
  },
  lcmHcf(en, hi) {
    const [x, y] = pick([[12, 18], [8, 12], [15, 20], [24, 36], [9, 15], [16, 24]]);
    const wantLcm = Math.random() > 0.5;
    function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
    const g = gcd(x, y), l = (x * y) / g;
    const ans = wantLcm ? l : g;
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, Math.max(4, Math.round(ans * 0.2))));
    en.push(`Find the ${wantLcm ? "LCM" : "HCF"} of ${x} and ${y}.`); hi.push(`${x} और ${y} का ${wantLcm ? "LCM (लघुत्तम समापवर्त्य)" : "HCF (महत्तम समापवर्तक)"} ज्ञात करें।`);
    return { options, correctIndex, explanation: [`${wantLcm ? "LCM" : "HCF"}(${x}, ${y}) = ${ans}.`, `${wantLcm ? "LCM" : "HCF"}(${x}, ${y}) = ${ans}।`] };
  },
  ages(en, hi) {
    const diff = rand(2, 15), bAge = rand(10, 40);
    const ans = bAge + diff;
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, 3));
    en.push(`A is ${diff} years older than B. If B is ${bAge} years old, find A's age.`); hi.push(`A, B से ${diff} वर्ष बड़ा है। यदि B की आयु ${bAge} वर्ष है, तो A की आयु ज्ञात करें।`);
    return { options: options.map((v) => `${v} years`), correctIndex, explanation: [`A's age = ${bAge} + ${diff} = ${ans} years.`, `A की आयु = ${bAge} + ${diff} = ${ans} वर्ष।`] };
  },
  mensuration(en, hi) {
    const l = rand(4, 30), b = rand(3, 20);
    const ans = l * b;
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, Math.max(5, Math.round(ans * 0.15))));
    en.push(`Find the area of a rectangle with length ${l} cm and breadth ${b} cm.`); hi.push(`${l} सेमी लंबाई और ${b} सेमी चौड़ाई वाले एक आयत का क्षेत्रफल ज्ञात करें।`);
    return { options: options.map((v) => `${v} sq cm`), correctIndex, explanation: [`Area = length x breadth = ${l} x ${b} = ${ans} sq cm.`, `क्षेत्रफल = लंबाई x चौड़ाई = ${l} x ${b} = ${ans} वर्ग सेमी।`] };
  },
  trigonometry(en, hi) {
    const table = [["1/2", 30], ["1/√2", 45], ["√3/2", 60], ["1", 90], ["0", 0]];
    const [val, ans] = pick(table);
    const { options, correctIndex } = mcq(ans, [0, 30, 45, 60, 90].filter((v) => v !== ans));
    en.push(`If sin θ = ${val}, find θ (in degrees), where 0° <= θ <= 90°.`); hi.push(`यदि sin θ = ${val}, तो θ (डिग्री में) ज्ञात करें, जहाँ 0° <= θ <= 90°।`);
    return { options: options.map((v) => `${v}°`), correctIndex, explanation: [`sin ${ans}° = ${val}.`, `sin ${ans}° = ${val}।`] };
  },
  algebra(en, hi) {
    const x = rand(2, 15), b = rand(2, 9), c = b * x + rand(1, 10);
    const rem = c - b * x;
    const ans = x;
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, 4));
    en.push(`If ${b}x + ${rem} = ${c}, find x.`); hi.push(`यदि ${b}x + ${rem} = ${c}, तो x ज्ञात करें।`);
    return { options, correctIndex, explanation: [`${b}x = ${c} - ${rem} = ${b * x}, so x = ${ans}.`, `${b}x = ${c} - ${rem} = ${b * x}, अतः x = ${ans}।`] };
  },
  probability(en, hi) {
    const green = rand(2, 8), red = rand(2, 8);
    const total = green + red;
    function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
    const g = gcd(red, total);
    const ansText = `${red / g}/${total / g}`;
    const distractors = [`${green}/${total}`, `${red}/${green}`, `1/${total}`, `${total}/${red}`];
    const options = shuffle([ansText, ...distractors]).slice(0, 4);
    if (!options.includes(ansText)) options[0] = ansText;
    const correctIndex = options.indexOf(ansText);
    en.push(`A bag contains ${green} green and ${red} red balls. Find the probability of picking a red ball.`);
    hi.push(`एक थैले में ${green} हरी और ${red} लाल गेंदें हैं। एक लाल गेंद निकालने की प्रायिकता ज्ञात करें।`);
    return { options, correctIndex, explanation: [`P(red) = ${red}/${total} = ${ansText}.`, `P(लाल) = ${red}/${total} = ${ansText}।`] };
  },
  permutation(en, hi) {
    const n = rand(3, 6);
    function fact(k) { return k <= 1 ? 1 : k * fact(k - 1); }
    const ans = fact(n);
    const { options, correctIndex } = mcq(ans, [fact(n - 1), fact(n + 1), ans - n, ans + n].filter((v) => v !== ans && v > 0));
    en.push(`In how many ways can ${n} distinct objects be arranged in a row?`); hi.push(`${n} भिन्न वस्तुओं को एक पंक्ति में कितने तरीकों से व्यवस्थित किया जा सकता है?`);
    return { options, correctIndex, explanation: [`Number of arrangements = ${n}! = ${ans}.`, `व्यवस्थाओं की संख्या = ${n}! = ${ans}।`] };
  },
};

const quantTopicMap = {
  "Number System": "simplification", "Simplification & Approximation": "simplification",
  "LCM & HCF": "lcmHcf", "Percentage": "percentage", "Ratio & Proportion": "ratio",
  "Average": "average", "Profit & Loss": "profitLoss", "Discount": "profitLoss",
  "Simple Interest": "simpleInterest", "Compound Interest": "compoundInterest",
  "Time & Work": "timeWork", "Pipes & Cisterns": "timeWork",
  "Time, Speed & Distance": "timeSpeedDistance", "Boats & Streams": "timeSpeedDistance",
  "Problems on Trains": "timeSpeedDistance", "Mixture & Alligation": "ratio",
  "Partnership": "ratio", "Problems on Ages": "ages", "Mensuration": "mensuration",
  "Geometry": "mensuration", "Trigonometry": "trigonometry", "Height & Distance": "trigonometry",
  "Algebra": "algebra", "Number Series": "numberSeries", "Data Interpretation": "average",
  "Probability": "probability", "Permutation & Combination": "permutation",
};

/* --------------------------------------------------------- Reasoning families */

const reasoning = {
  numberSeries: quant.numberSeries,
  letterSeries(en, hi) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const startIdx = rand(0, 15), step = rand(2, 4);
    const seq = [0, 1, 2, 3].map((i) => letters[startIdx + i * step]);
    const ansIdx = startIdx + 4 * step;
    const ans = letters[ansIdx] || letters[ansIdx % 26];
    const distractors = shuffle(letters.split("")).filter((l) => l !== ans).slice(0, 5);
    const { options, correctIndex } = mcq(ans, distractors);
    en.push(`Find the next letter in the series: ${seq.join(", ")}, ?`); hi.push(`श्रृंखला में अगला अक्षर ज्ञात करें: ${seq.join(", ")}, ?`);
    return { options, correctIndex, explanation: [`Each letter advances by ${step} positions in the alphabet.`, `प्रत्येक अक्षर वर्णमाला में ${step} स्थान आगे बढ़ता है।`] };
  },
  codingDecoding(en, hi) {
    const words = ["CAT", "DOG", "SUN", "MAP", "PEN", "BAT", "CAR", "BOOK", "FISH", "BIRD"];
    const word = pick(words);
    const target = pick(words.filter((w) => w !== word));
    const shift = rand(1, 3);
    function code(w) { return w.split("").map((c) => String.fromCharCode(((c.charCodeAt(0) - 65 + shift) % 26) + 65)).join(""); }
    const codedWord = code(word), codedTarget = code(target);
    const distractors = [code(pick(words)), code(pick(words)), target.split("").reverse().join(""), codedTarget.slice(1) + codedTarget[0]];
    const { options, correctIndex } = mcq(codedTarget, distractors);
    en.push(`If ${word} is coded as ${codedWord}, how is ${target} coded in the same language?`);
    hi.push(`यदि ${word} को ${codedWord} के रूप में कोडित किया जाता है, तो उसी भाषा में ${target} को कैसे कोडित किया जाएगा?`);
    return { options, correctIndex, explanation: [`Each letter is shifted forward by ${shift}, so ${target} becomes ${codedTarget}.`, `प्रत्येक अक्षर को ${shift} आगे खिसकाया गया है, इसलिए ${target}, ${codedTarget} बनता है।`] };
  },
  bloodRelations(en, hi) {
    const relations = [
      { q: "A is B's father. B is C's mother. How is A related to C?", a: "Grandfather", qHi: "A, B का पिता है। B, C की माँ है। A का C से क्या संबंध है?", aHi: "दादा" },
      { q: "A is B's brother. B is C's mother. How is A related to C?", a: "Maternal Uncle", qHi: "A, B का भाई है। B, C की माँ है। A का C से क्या संबंध है?", aHi: "मामा" },
      { q: "A is B's mother. B is C's father. How is A related to C?", a: "Grandmother", qHi: "A, B की माँ है। B, C का पिता है। A का C से क्या संबंध है?", aHi: "दादी" },
      { q: "A is B's sister. B is C's father. How is A related to C?", a: "Aunt", qHi: "A, B की बहन है। B, C का पिता है। A का C से क्या संबंध है?", aHi: "बुआ" },
      { q: "A is B's son. B is C's sister. How is A related to C?", a: "Nephew", qHi: "A, B का बेटा है। B, C की बहन है। A का C से क्या संबंध है?", aHi: "भतीजा" },
    ];
    const r = pick(relations);
    const others = ["Grandfather", "Grandmother", "Maternal Uncle", "Aunt", "Nephew", "Cousin", "Brother", "Father"].filter((v) => v !== r.a);
    const { options, correctIndex } = mcq(r.a, shuffle(others));
    en.push(r.q); hi.push(r.qHi);
    return { options, correctIndex, explanation: [`Working through the relation chain gives: ${r.a}.`, `संबंध श्रृंखला से पता चलता है: ${r.aHi}।`] };
  },
  directionSense(en, hi) {
    const dirs = ["North", "East", "South", "West"];
    const dirsHi = { North: "उत्तर", East: "पूर्व", South: "दक्षिण", West: "पश्चिम" };
    const startIdx = rand(0, 3);
    const turn = pick(["right", "left"]);
    const endIdx = turn === "right" ? (startIdx + 1) % 4 : (startIdx + 3) % 4;
    const { options, correctIndex } = mcq(dirs[endIdx], dirs.filter((d) => d !== dirs[endIdx]));
    en.push(`A man is facing ${dirs[startIdx]}. He turns ${turn}. Which direction is he facing now?`);
    hi.push(`एक व्यक्ति ${dirsHi[dirs[startIdx]]} की ओर मुख किए हुए है। वह ${turn === "right" ? "दाएं" : "बाएं"} मुड़ता है। अब उसका मुख किस दिशा में है?`);
    return { options: options.map((d) => dirsHi[d] ? d : d), correctIndex, explanation: [`Turning ${turn} from ${dirs[startIdx]} faces ${dirs[endIdx]}.`, `${dirsHi[dirs[startIdx]]} से ${turn === "right" ? "दाएं" : "बाएं"} मुड़ने पर मुख ${dirsHi[dirs[endIdx]]} की ओर होता है।`] };
  },
  analogy(en, hi) {
    const pairs = [
      ["Bird", "Sky", "Fish", "Water"], ["Doctor", "Hospital", "Teacher", "School"],
      ["Pen", "Write", "Knife", "Cut"], ["Cow", "Calf", "Dog", "Puppy"],
      ["Hand", "Glove", "Foot", "Shoe"], ["Book", "Author", "Painting", "Painter"],
      ["Fish", "Water", "Bird", "Air"], ["Puppy", "Dog", "Kitten", "Cat"],
    ];
    const [a, b, c, d] = pick(pairs);
    const distractors = shuffle(pairs.flat()).filter((w) => w !== d).slice(0, 5);
    const { options, correctIndex } = mcq(d, distractors);
    en.push(`${a} : ${b} :: ${c} : ?`); hi.push(`${a} : ${b} :: ${c} : ?`);
    return { options, correctIndex, explanation: [`${a} relates to ${b} the same way ${c} relates to ${d}.`, `${a} का ${b} से वही संबंध है जो ${c} का ${d} से है।`] };
  },
  classification(en, hi) {
    const groups = [
      { items: ["Apple", "Mango", "Banana", "Potato"], odd: "Potato" },
      { items: ["Rose", "Lily", "Lotus", "Mango"], odd: "Mango" },
      { items: ["Delhi", "Mumbai", "Kolkata", "India"], odd: "India" },
      { items: ["Circle", "Square", "Triangle", "Sphere"], odd: "Sphere" },
      { items: ["Gold", "Silver", "Iron", "Oxygen"], odd: "Oxygen" },
      { items: ["Cricket", "Football", "Hockey", "Piano"], odd: "Piano" },
    ];
    const g = pick(groups);
    const { options, correctIndex } = mcq(g.odd, g.items.filter((i) => i !== g.odd));
    en.push(`Which one is different from the others?`); hi.push(`इनमें से कौन-सा अन्य से भिन्न है?`);
    return { options, correctIndex, explanation: [`${g.odd} does not belong to the same category as the rest.`, `${g.odd} शेष के समान श्रेणी में नहीं आता।`] };
  },
  inequality(en, hi) {
    const [a, b, c] = ["A", "B", "C"];
    const ans = `${a} > ${c}`;
    const distractors = [`${c} > ${a}`, `${a} = ${c}`, `${c} >= ${a}`];
    const { options, correctIndex } = mcq(ans, distractors);
    en.push(`If ${a} > ${b} and ${b} > ${c}, which of the following is definitely true?`);
    hi.push(`यदि ${a} > ${b} और ${b} > ${c}, तो निम्नलिखित में से कौन निश्चित रूप से सत्य है?`);
    return { options, correctIndex, explanation: [`By transitivity, ${a} > ${b} > ${c} implies ${a} > ${c}.`, `संक्रामकता से, ${a} > ${b} > ${c} का अर्थ है ${a} > ${c}।`] };
  },
  ranking(en, hi) {
    const n = rand(15, 40), k = rand(2, n - 2);
    const ans = n - k + 1;
    const { options, correctIndex } = mcq(ans, numericDistractors(ans, 3));
    en.push(`In a row of ${n} students, A is ${k}${ordinalSuffix(k)} from the left. What is A's position from the right?`);
    hi.push(`${n} छात्रों की एक पंक्ति में, A बाएं से ${k}वें स्थान पर है। दाईं ओर से A का स्थान क्या है?`);
    return { options, correctIndex, explanation: [`Position from right = ${n} - ${k} + 1 = ${ans}.`, `दाईं ओर से स्थान = ${n} - ${k} + 1 = ${ans}।`] };
  },
};
function ordinalSuffix(n) { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; }

const reasoningFamilies = Object.keys(reasoning);
const reasoningTopicMap = {
  "Analogy": "analogy", "Classification": "classification", "Number & Alphabet Series": "letterSeries",
  "Coding-Decoding": "codingDecoding", "Blood Relations": "bloodRelations", "Direction Sense": "directionSense",
  "Order & Ranking": "ranking", "Inequality": "inequality",
};

/* ----------------------------------------------------------- English families */

const synonymBank = [["Happy", "Joyful"], ["Sad", "Sorrowful"], ["Big", "Huge"], ["Fast", "Quick"], ["Angry", "Furious"], ["Brave", "Courageous"], ["Smart", "Intelligent"], ["Beautiful", "Gorgeous"], ["Rich", "Wealthy"], ["Old", "Ancient"], ["Begin", "Commence"], ["End", "Conclude"], ["Help", "Assist"], ["Try", "Attempt"], ["Show", "Display"]];
const antonymBank = [["Hot", "Cold"], ["Light", "Dark"], ["Fast", "Slow"], ["Happy", "Sad"], ["Big", "Small"], ["Rich", "Poor"], ["Strong", "Weak"], ["Full", "Empty"], ["Ancient", "Modern"], ["Brave", "Cowardly"], ["Wise", "Foolish"], ["Generous", "Stingy"]];
const oneWordBank = [["A person who loves books", "Bibliophile"], ["A place where birds are kept", "Aviary"], ["One who cannot be defeated", "Invincible"], ["A person who studies stars", "Astronomer"], ["A word that sounds the same forwards and backwards", "Palindrome"], ["A person who does not believe in God", "Atheist"]];
const idiomBank = [["Break the ice", "To initiate conversation"], ["Once in a blue moon", "Very rarely"], ["Piece of cake", "Something very easy"], ["Under the weather", "Feeling unwell"], ["Hit the sack", "Go to sleep"], ["Spill the beans", "Reveal a secret"], ["Burn the midnight oil", "Work late into the night"]];
const spellingBank = ["Necessary", "Occurrence", "Separate", "Definitely", "Accommodate", "Embarrass", "Rhythm", "Conscience", "Privilege", "Maintenance"];

const english = {
  synonym(en, hi) {
    const [word, ans] = pick(synonymBank);
    const distractors = shuffle(synonymBank.flat()).filter((w) => w !== ans && w !== word).slice(0, 5);
    const { options, correctIndex } = mcq(ans, distractors);
    en.push(`Choose the word most similar in meaning to '${word}'.`); hi.push(`'${word}' के सबसे निकट समानार्थी शब्द का चयन करें।`);
    return { options, correctIndex, explanation: [`${ans} is a synonym of ${word}.`, `${ans}, ${word} का समानार्थी शब्द है।`] };
  },
  antonym(en, hi) {
    const [word, ans] = pick(antonymBank);
    const distractors = shuffle(antonymBank.flat()).filter((w) => w !== ans && w !== word).slice(0, 5);
    const { options, correctIndex } = mcq(ans, distractors);
    en.push(`Choose the word most opposite in meaning to '${word}'.`); hi.push(`'${word}' के विपरीत अर्थ वाले शब्द का चयन करें।`);
    return { options, correctIndex, explanation: [`${ans} is an antonym of ${word}.`, `${ans}, ${word} का विलोम शब्द है।`] };
  },
  oneWord(en, hi) {
    const [phrase, ans] = pick(oneWordBank);
    const distractors = shuffle(oneWordBank.map((p) => p[1])).filter((w) => w !== ans).slice(0, 5);
    const { options, correctIndex } = mcq(ans, distractors);
    en.push(`Choose the one word for: "${phrase}"`); hi.push(`इस वाक्यांश के लिए एक शब्द चुनें: "${phrase}"`);
    return { options, correctIndex, explanation: [`"${phrase}" is best replaced with '${ans}'.`, `"${phrase}" के लिए सबसे उपयुक्त शब्द '${ans}' है।`] };
  },
  idiom(en, hi) {
    const [phrase, ans] = pick(idiomBank);
    const distractors = shuffle(idiomBank.map((p) => p[1])).filter((w) => w !== ans).slice(0, 5);
    const { options, correctIndex } = mcq(ans, distractors);
    en.push(`Choose the correct meaning of the idiom: "${phrase}"`); hi.push(`मुहावरे का सही अर्थ चुनें: "${phrase}"`);
    return { options, correctIndex, explanation: [`"${phrase}" means: ${ans}.`, `"${phrase}" का अर्थ है: ${ans}।`] };
  },
  spelling(en, hi) {
    const correct = pick(spellingBank);
    function misspell(w) {
      const i = rand(1, w.length - 2);
      return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    }
    const distractors = [misspell(correct), misspell(correct), misspell(correct)];
    const { options, correctIndex } = mcq(correct, distractors);
    en.push(`Choose the correctly spelled word.`); hi.push(`सही वर्तनी वाला शब्द चुनें।`);
    return { options, correctIndex, explanation: [`'${correct}' is the correct spelling.`, `'${correct}' सही वर्तनी है।`] };
  },
};
const englishTopicMap = {
  "Synonyms": "synonym", "Antonyms": "antonym", "One Word Substitution": "oneWord",
  "Idioms & Phrases": "idiom", "Spelling Correction": "spelling",
};

/* -------------------------------------------------------- Fact-bank subjects */

// [English question, Hindi question, correct answer, distractors]. The answer/option
// text (proper nouns, abbreviations) intentionally stays the same in both languages —
// this matches how real Hindi-medium banking/SSC content actually renders technical
// terms and names, not a shortcut.
const gaFacts = [
  ["What is the capital of France?", "फ्रांस की राजधानी क्या है?", "Paris", ["Berlin", "Rome", "Madrid"]],
  ["What is the capital of Japan?", "जापान की राजधानी क्या है?", "Tokyo", ["Beijing", "Seoul", "Bangkok"]],
  ["What is the capital of India?", "भारत की राजधानी क्या है?", "New Delhi", ["Mumbai", "Kolkata", "Chennai"]],
  ["Which river is known as the Ganga of the South?", "दक्षिण की गंगा किस नदी को कहा जाता है?", "Godavari", ["Krishna", "Kaveri", "Narmada"]],
  ["Who was the first Prime Minister of India?", "भारत के पहले प्रधानमंत्री कौन थे?", "Jawaharlal Nehru", ["Mahatma Gandhi", "Sardar Patel", "Dr. Rajendra Prasad"]],
  ["Who wrote the Indian National Anthem?", "भारतीय राष्ट्रगान किसने लिखा था?", "Rabindranath Tagore", ["Bankim Chandra Chatterjee", "Sarojini Naidu", "Mahatma Gandhi"]],
  ["In which year did India gain independence?", "भारत को किस वर्ष स्वतंत्रता मिली थी?", "1947", ["1930", "1950", "1942"]],
  ["Which is the largest state in India by area?", "क्षेत्रफल की दृष्टि से भारत का सबसे बड़ा राज्य कौन-सा है?", "Rajasthan", ["Madhya Pradesh", "Maharashtra", "Uttar Pradesh"]],
  ["Which is the smallest state in India by area?", "क्षेत्रफल की दृष्टि से भारत का सबसे छोटा राज्य कौन-सा है?", "Goa", ["Sikkim", "Tripura", "Manipur"]],
  ["When is Republic Day celebrated in India?", "भारत में गणतंत्र दिवस कब मनाया जाता है?", "26 January", ["15 August", "2 October", "14 November"]],
  ["When is Independence Day celebrated in India?", "भारत में स्वतंत्रता दिवस कब मनाया जाता है?", "15 August", ["26 January", "2 October", "1 May"]],
  ["Who is known as the Father of the Nation in India?", "भारत में राष्ट्रपिता किसे कहा जाता है?", "Mahatma Gandhi", ["Jawaharlal Nehru", "Bhagat Singh", "Subhas Chandra Bose"]],
  ["Which sport is associated with the term 'shuttlecock'?", "'शटलकॉक' शब्द किस खेल से संबंधित है?", "Badminton", ["Tennis", "Squash", "Table Tennis"]],
  ["Which country hosted the 2016 Summer Olympics?", "2016 के ग्रीष्मकालीन ओलंपिक की मेजबानी किस देश ने की थी?", "Brazil", ["China", "United Kingdom", "Russia"]],
  ["Who was India's first Deputy Prime Minister?", "भारत के पहले उप-प्रधानमंत्री कौन थे?", "Sardar Vallabhbhai Patel", ["Lal Bahadur Shastri", "Morarji Desai", "Rajiv Gandhi"]],
  ["Which is the longest river in India?", "भारत की सबसे लंबी नदी कौन-सी है?", "Ganga", ["Godavari", "Yamuna", "Brahmaputra"]],
  ["Which Indian state is known as the 'Land of Five Rivers'?", "किस भारतीय राज्य को 'पांच नदियों की भूमि' कहा जाता है?", "Punjab", ["Haryana", "Rajasthan", "Gujarat"]],
  ["Which is the national animal of India?", "भारत का राष्ट्रीय पशु कौन-सा है?", "Tiger", ["Lion", "Elephant", "Leopard"]],
  ["Which is the national bird of India?", "भारत का राष्ट्रीय पक्षी कौन-सा है?", "Peacock", ["Parrot", "Crow", "Sparrow"]],
  ["Who was the first woman Prime Minister of India?", "भारत की पहली महिला प्रधानमंत्री कौन थीं?", "Indira Gandhi", ["Sonia Gandhi", "Pratibha Patil", "Sushma Swaraj"]],
  ["Which Indian city is known as the 'Silicon Valley of India'?", "किस भारतीय शहर को 'भारत की सिलिकॉन वैली' कहा जाता है?", "Bengaluru", ["Hyderabad", "Pune", "Chennai"]],
  ["Which is the highest civilian award in India?", "भारत का सर्वोच्च नागरिक सम्मान कौन-सा है?", "Bharat Ratna", ["Padma Vibhushan", "Padma Bhushan", "Padma Shri"]],
  ["Which commission recommended the reorganisation of Indian states on a linguistic basis?", "भाषाई आधार पर भारतीय राज्यों के पुनर्गठन की सिफारिश किस आयोग ने की थी?", "States Reorganisation Commission", ["Sarkaria Commission", "Finance Commission", "Planning Commission"]],
  ["Which bank is known as the banker's bank in India?", "भारत में 'बैंकों के बैंक' के रूप में किसे जाना जाता है?", "Reserve Bank of India", ["State Bank of India", "NABARD", "Punjab National Bank"]],
  ["What does 'GST' stand for?", "'GST' का पूर्ण रूप क्या है?", "Goods and Services Tax", ["General Sales Tax", "Government Service Tax", "Gross Sales Tax"]],
  ["Which is the apex court of India?", "भारत का सर्वोच्च न्यायालय कौन-सा है?", "Supreme Court", ["High Court", "District Court", "Parliament"]],
  ["Who is the head of the Indian judiciary?", "भारतीय न्यायपालिका का प्रमुख कौन होता है?", "Chief Justice of India", ["President", "Prime Minister", "Attorney General"]],
  ["What is the currency of Japan?", "जापान की मुद्रा क्या है?", "Yen", ["Won", "Yuan", "Ringgit"]],
  ["What is the currency of the United Kingdom?", "यूनाइटेड किंगडम की मुद्रा क्या है?", "Pound Sterling", ["Euro", "Dollar", "Franc"]],
  ["Which country is known as the 'Land of the Rising Sun'?", "किस देश को 'उगते सूरज की भूमि' कहा जाता है?", "Japan", ["China", "South Korea", "Thailand"]],
];

const scienceFacts = [
  ["What is the SI unit of force?", "बल की SI इकाई क्या है?", "Newton", ["Joule", "Watt", "Pascal"]],
  ["What is the chemical formula of water?", "पानी का रासायनिक सूत्र क्या है?", "H2O", ["CO2", "O2", "H2O2"]],
  ["Which organ is known as the powerhouse of the cell?", "कोशिका का पावरहाउस किसे कहा जाता है?", "Mitochondria", ["Nucleus", "Ribosome", "Golgi body"]],
  ["What is the SI unit of electric current?", "विद्युत धारा की SI इकाई क्या है?", "Ampere", ["Volt", "Ohm", "Watt"]],
  ["Which gas do plants absorb from the atmosphere for photosynthesis?", "प्रकाश संश्लेषण के लिए पौधे वायुमंडल से कौन-सी गैस अवशोषित करते हैं?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Hydrogen"]],
  ["What is the atomic number of Hydrogen?", "हाइड्रोजन की परमाणु संख्या क्या है?", "1", ["2", "6", "8"]],
  ["Which vitamin is produced in human skin on exposure to sunlight?", "सूर्य के प्रकाश के संपर्क में आने पर मानव त्वचा में कौन-सा विटामिन बनता है?", "Vitamin D", ["Vitamin A", "Vitamin C", "Vitamin K"]],
  ["What is the normal body temperature of a healthy human, in Celsius?", "एक स्वस्थ मनुष्य के शरीर का सामान्य तापमान (सेल्सियस में) कितना होता है?", "37°C", ["35°C", "40°C", "42°C"]],
  ["Which part of the human body is affected by Myopia?", "मायोपिया मानव शरीर के किस अंग को प्रभावित करता है?", "Eye", ["Ear", "Heart", "Lungs"]],
  ["What is the chemical symbol for Gold?", "सोने का रासायनिक प्रतीक क्या है?", "Au", ["Ag", "Gd", "Go"]],
  ["What is the speed of light in vacuum, approximately?", "निर्वात में प्रकाश की गति लगभग कितनी होती है?", "3 x 10^8 m/s", ["3 x 10^6 m/s", "3 x 10^10 m/s", "3 x 10^5 m/s"]],
  ["Which blood group is known as the universal donor?", "किस रक्त समूह को सार्वभौमिक दाता कहा जाता है?", "O negative", ["AB positive", "A positive", "B negative"]],
  ["What is the study of heavenly bodies called?", "खगोलीय पिंडों के अध्ययन को क्या कहते हैं?", "Astronomy", ["Astrology", "Geology", "Meteorology"]],
  ["Which gas is most abundant in the Earth's atmosphere?", "पृथ्वी के वायुमंडल में सबसे अधिक मात्रा में कौन-सी गैस पाई जाती है?", "Nitrogen", ["Oxygen", "Carbon dioxide", "Argon"]],
  ["What is the hardest natural substance on Earth?", "पृथ्वी पर सबसे कठोर प्राकृतिक पदार्थ कौन-सा है?", "Diamond", ["Gold", "Iron", "Quartz"]],
];

const compFacts = [
  ["What does 'CPU' stand for?", "'CPU' का पूर्ण रूप क्या है?", "Central Processing Unit", ["Central Program Unit", "Computer Processing Unit", "Central Processor Utility"]],
  ["What does 'RAM' stand for?", "'RAM' का पूर्ण रूप क्या है?", "Random Access Memory", ["Read Access Memory", "Random Available Memory", "Read Available Memory"]],
  ["What is the keyboard shortcut for Copy?", "कॉपी करने के लिए कीबोर्ड शॉर्टकट क्या है?", "Ctrl+C", ["Ctrl+V", "Ctrl+X", "Ctrl+Z"]],
  ["What is the keyboard shortcut for Paste?", "पेस्ट करने के लिए कीबोर्ड शॉर्टकट क्या है?", "Ctrl+V", ["Ctrl+C", "Ctrl+P", "Ctrl+B"]],
  ["Which company developed the Windows operating system?", "विंडोज ऑपरेटिंग सिस्टम किस कंपनी ने विकसित किया?", "Microsoft", ["Apple", "Google", "IBM"]],
  ["What does 'HTML' stand for?", "'HTML' का पूर्ण रूप क्या है?", "HyperText Markup Language", ["HighText Markup Language", "HyperTransfer Markup Language", "HyperText Modern Language"]],
  ["What does 'URL' stand for?", "'URL' का पूर्ण रूप क्या है?", "Uniform Resource Locator", ["Universal Resource Link", "Uniform Reference Locator", "Universal Reference Link"]],
  ["Which of these is an input device?", "इनमें से कौन-सा एक इनपुट डिवाइस है?", "Keyboard", ["Monitor", "Printer", "Speaker"]],
  ["Which of these is an output device?", "इनमें से कौन-सा एक आउटपुट डिवाइस है?", "Monitor", ["Keyboard", "Mouse", "Scanner"]],
  ["What does 'USB' stand for?", "'USB' का पूर्ण रूप क्या है?", "Universal Serial Bus", ["Universal System Bus", "United Serial Bus", "Universal Serial Board"]],
  ["Who is known as the father of the computer?", "कंप्यूटर के जनक के रूप में किसे जाना जाता है?", "Charles Babbage", ["Alan Turing", "Bill Gates", "Steve Jobs"]],
  ["What does 'PDF' stand for?", "'PDF' का पूर्ण रूप क्या है?", "Portable Document Format", ["Personal Document File", "Printable Document Format", "Portable Data File"]],
  ["What is the full form of 'LAN'?", "'LAN' का पूर्ण रूप क्या है?", "Local Area Network", ["Large Area Network", "Long Area Network", "Local Access Network"]],
  ["Which shortcut is used to undo an action?", "किसी क्रिया को पूर्ववत करने के लिए कौन-सा शॉर्टकट प्रयोग होता है?", "Ctrl+Z", ["Ctrl+Y", "Ctrl+U", "Ctrl+R"]],
  ["What does 'DBMS' stand for?", "'DBMS' का पूर्ण रूप क्या है?", "Database Management System", ["Data Backup Management System", "Database Monitoring System", "Data Base Machine System"]],
];

function factQuestion(bank) {
  const [qEn, qHi, ans, distractors] = pick(bank);
  const { options, correctIndex } = mcq(ans, distractors);
  return { en: qEn, hi: qHi, options, correctIndex, explanationEn: `The correct answer is ${ans}.`, explanationHi: `सही उत्तर ${ans} है।` };
}

/* ------------------------------------------------------------- topic helpers */

async function getSubjects() { return api("/api/subjects"); }
async function getTopics(subjectId) { return api(`/api/topics?subjectId=${subjectId}`); }

function buildQuestion(subjectName, topicName, examCodes, generatorPick) {
  const en = [], hi = [];
  const result = generatorPick(en, hi);
  const difficulty = pick(DIFFICULTIES);
  const explanationEn = result.explanationEn ?? (Array.isArray(result.explanation) ? result.explanation[0] : result.explanation);
  const explanationHi = result.explanationHi ?? (Array.isArray(result.explanation) ? result.explanation[1] : result.explanation);
  const questionTextEn = result.en ?? en[0];
  const questionTextHi = result.hi ?? hi[0];
  return {
    correctAnswer: "ABCD"[result.correctIndex],
    subjectName, topicName, difficulty, examCodes,
    translations: [
      { languageCode: "en", questionText: questionTextEn, options: result.options, explanation: explanationEn },
      { languageCode: "hi", questionText: questionTextHi, options: result.options, explanation: explanationHi },
    ],
  };
}

async function generateForSubject(subject, topics, target) {
  const examCodes = subject.examCodes && subject.examCodes.length ? subject.examCodes : [];
  if (examCodes.length === 0) { console.log(`  skipping ${subject.name} — no exams reference it`); return []; }
  const topicNames = topics.map((t) => t.name);
  const questions = [];

  const name = subject.name;
  for (let i = 0; i < target; i++) {
    const topicName = pick(topicNames);
    let gen;
    if (name === "Quantitative Aptitude") {
      const family = quantTopicMap[topicName] ?? pick(Object.keys(quant));
      gen = (en, hi) => quant[family](en, hi);
    } else if (name === "Reasoning") {
      const family = reasoningTopicMap[topicName] ?? pick(reasoningFamilies);
      gen = (en, hi) => reasoning[family](en, hi);
    } else if (name === "English") {
      const family = englishTopicMap[topicName] ?? pick(Object.keys(english));
      gen = (en, hi) => english[family](en, hi);
    } else if (name === "General Awareness") {
      gen = () => { const f = factQuestion(gaFacts); return { en: f.en, hi: f.hi, options: f.options, correctIndex: f.correctIndex, explanationEn: f.explanationEn, explanationHi: f.explanationHi }; };
    } else if (name === "General Science") {
      gen = () => { const f = factQuestion(scienceFacts); return { en: f.en, hi: f.hi, options: f.options, correctIndex: f.correctIndex, explanationEn: f.explanationEn, explanationHi: f.explanationHi }; };
    } else if (name === "Computer Knowledge") {
      gen = () => { const f = factQuestion(compFacts); return { en: f.en, hi: f.hi, options: f.options, correctIndex: f.correctIndex, explanationEn: f.explanationEn, explanationHi: f.explanationHi }; };
    } else {
      continue;
    }
    questions.push(buildQuestion(name, topicName, pickExamSubset(examCodes), gen));
  }
  return questions;
}

async function bulkImport(questions) {
  const createdIds = [];
  const failures = [];
  const totalBatches = Math.ceil(questions.length / BATCH_SIZE);
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    const batchNum = i / BATCH_SIZE + 1;
    const startedAt = Date.now();
    console.log(`  batch ${batchNum}/${totalBatches}: sending ${batch.length}...`);
    const res = await api("/api/questions/bulk-import", { method: "POST", body: JSON.stringify({ questions: batch }) });
    createdIds.push(...res.ids);
    if (res.failures && res.failures.length) failures.push(...res.failures);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`  batch ${batchNum}/${totalBatches}: created ${res.createdCount}, failed ${res.failures?.length ?? 0} in ${seconds}s (running total: ${createdIds.length})`);
  }
  return { createdIds, failures };
}

async function main() {
  console.log("Fetching live subjects/topics...");
  const subjects = (await getSubjects()).filter((s) => s.name !== "Automated Test Subject");
  const allCreatedIds = [];
  const allFailures = [];

  for (const subject of subjects) {
    const target = TARGETS[subject.name];
    if (!target) { console.log(`Skipping ${subject.name} (not in TARGETS)`); continue; }
    const topics = await getTopics(subject.id);
    console.log(`\n=== ${subject.name}: generating ${target} questions across ${topics.length} topics, exams [${subject.examCodes.join(", ")}] ===`);
    const questions = await generateForSubject(subject, topics, target);
    const { createdIds, failures } = await bulkImport(questions);
    allCreatedIds.push(...createdIds);
    allFailures.push(...failures.map((f) => ({ subject: subject.name, ...f })));
  }

  // Merge with any existing manifest rather than overwrite it — this script is
  // re-run to add further batches (see reports/12-load-test-data-seeding/), and a
  // plain overwrite would silently lose the previous run's ids, breaking the
  // documented cleanup path (POST /api/questions/bulk-delete against this file).
  let previousIds = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      previousIds = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")).questionIds ?? [];
    } catch (err) {
      console.warn(`Could not read existing manifest, starting fresh: ${err.message}`);
    }
  }
  const combinedIds = [...new Set([...previousIds, ...allCreatedIds])];

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), count: combinedIds.length, questionIds: combinedIds }, null, 2));
  console.log(`\n=== DONE: ${allCreatedIds.length} questions created this run, ${allFailures.length} failures ===`);
  if (allFailures.length) console.log("First few failures:", allFailures.slice(0, 5));
  console.log(`Manifest written to ${MANIFEST_PATH} (${combinedIds.length} total ids across all runs)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
