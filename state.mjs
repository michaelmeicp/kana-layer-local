import { isReading } from './parser.mjs';

export const STORAGE_KEY = 'kana-layer.state.v1';
export const MAX_TEXT = 12_000; // UTF-16 units to agree with textarea selections.
export const MAX_BACKUP = 192_000; // UTF-8 bytes.
export const MAX_ANNOTATIONS = 300;
export const MAX_SPAN = 48;
export const MAX_READING = 96;
export const DEFAULT_TEXT = 'きょうは、がっこうへ。\nスーパーで まっちゃを かいます。\n東京の そらは あおい。';

const DEFAULT_PREFS = Object.freeze({ theme: 'light', size: 'normal', hints: true });
const PREF_VALUES = {
  theme: ['light', 'dark'],
  size: ['normal', 'large', 'extra-large'],
};
const HAN_SPAN = /^\p{Script=Han}+$/u;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze(row)));
export const EXERCISES = freezeRows([
  { id: 'yoon-kya', prompt: 'きゃ', answer: 'kya', focus: '拗音・小ゃ' },
  { id: 'sokuon-gakkou', prompt: 'がっこう', answer: 'gakkō', focus: '小促音・長母音', alternatives: Object.freeze(['gakkou', 'gakkoo']) },
  { id: 'choon-super', prompt: 'スーパー', answer: 'sūpā', focus: '長音符', alternatives: Object.freeze(['suupaa']) },
  { id: 'hiragana', prompt: 'ひらがな', answer: 'hiragana', focus: '平假名・濁音' },
  { id: 'n-boundary', prompt: 'しんよう', answer: "shin'yō", focus: '撥音詞界・長母音', alternatives: Object.freeze(["shin'you", "shin'yoo"]) },
  { id: 'sokuon-tcha', prompt: 'まっちゃ', answer: 'matcha', focus: '小促音・拗音' },
  { id: 'katakana-fa', prompt: 'ファイル', answer: 'fairu', focus: '外來語片假名' },
  { id: 'halfwidth-kana', prompt: 'ｶﾞﾗｽ', answer: 'garasu', focus: '半形片假名・濁音' },
]);
const exerciseById = new Map(EXERCISES.map((entry) => [entry.id, entry]));

export function initialState() {
  return { version: 1, text: DEFAULT_TEXT, annotations: [], prefs: { ...DEFAULT_PREFS }, mistakes: [] };
}

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value));
}

function assertText(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT || LONE_SURROGATE.test(text)) {
    fail('文字格式無效，或超過 12,000 個 UTF-16 單位。');
  }
}

function checkBounds(text, start, end) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length || end - start > MAX_SPAN) {
    fail('請選取不超過 48 個文字單位的連續漢字。');
  }
  if (!HAN_SPAN.test(text.slice(start, end))) {
    fail('標註範圍只能是連續漢字，不可包含空格、標點或假名。');
  }
}

function createAnnotation(text, start, end, reading) {
  checkBounds(text, start, end);
  if (typeof reading !== 'string' || reading.length > MAX_READING || !isReading(reading)) {
    fail('請輸入有效的平假名或片假名讀音，例如 とうきょう。');
  }
  return { start, end, reading };
}

function validatePrefs(prefs) {
  if (!isObject(prefs) || !PREF_VALUES.theme.includes(prefs.theme) || !PREF_VALUES.size.includes(prefs.size) || typeof prefs.hints !== 'boolean') {
    fail('備份的顯示設定無效。');
  }
  return { theme: prefs.theme, size: prefs.size, hints: prefs.hints };
}

export function setPrefs(state, patch) {
  return { ...state, prefs: validatePrefs({ ...state.prefs, ...patch }) };
}

export function setText(state, text) {
  assertText(text);
  // Repeated text makes inferring a span's identity from a diff ambiguous.
  return text === state.text ? state : { ...state, text, annotations: [] };
}

export function setAnnotation(state, start, end, reading) {
  const newAnnotation = createAnnotation(state.text, start, end, reading);
  const annotations = state.annotations.filter((entry) => entry.start !== start || entry.end !== end);
  if (annotations.length >= MAX_ANNOTATIONS) fail('已達 300 筆標註上限。');
  if (annotations.some((entry) => start < entry.end && end > entry.start)) {
    fail('選取範圍與既有讀音重疊，請先編輯或刪除原有標註。');
  }
  annotations.push(newAnnotation);
  return { ...state, annotations: annotations.sort((a, b) => a.start - b.start) };
}

export function removeAnnotation(state, start, end) {
  return { ...state, annotations: state.annotations.filter((entry) => entry.start !== start || entry.end !== end) };
}

export function checkAnswer(id, input) {
  const exercise = exerciseById.get(id);
  if (!exercise || typeof input !== 'string' || input.length > 96) return false;
  const answer = input.trim().normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'");
  return exercise.answer === answer || (exercise.alternatives?.includes(answer) ?? false);
}

export function recordAnswer(state, id, correct) {
  if (!exerciseById.has(id) || typeof correct !== 'boolean') fail('找不到這筆練習。');
  const mistakes = state.mistakes.filter((item) => item !== id);
  if (!correct) mistakes.push(id);
  return { ...state, mistakes };
}

export function validateState(value) {
  if (!isObject(value) || value.version !== 1) fail('不支援這個備份版本。');
  assertText(value.text);
  if (!Array.isArray(value.annotations) || value.annotations.length > MAX_ANNOTATIONS) fail('備份的標註清單無效。');
  const annotations = [];
  for (const entry of value.annotations) {
    if (!isObject(entry)) fail('備份含有無效標註。');
    const current = createAnnotation(value.text, entry.start, entry.end, entry.reading);
    if (annotations.length && current.start < annotations[annotations.length - 1].end) {
      fail('備份的標註順序錯誤或互相重疊。');
    }
    annotations.push(current);
  }
  if (!Array.isArray(value.mistakes) || value.mistakes.length > EXERCISES.length ||
      ![...value.mistakes].every((id) => typeof id === 'string' && exerciseById.has(id)) ||
      new Set(value.mistakes).size !== value.mistakes.length) {
    fail('備份的錯題清單無效。');
  }
  return { version: 1, text: value.text, annotations, prefs: validatePrefs(value.prefs), mistakes: [...value.mistakes] };
}

export function parseBackup(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_BACKUP || new TextEncoder().encode(raw).byteLength > MAX_BACKUP) {
    fail('備份檔案超過大小限制。');
  }
  let result;
  try {
    result = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    fail('無法讀取 JSON 備份，原有內容沒有更動。');
  }
  return validateState(result);
}

export function makeBackup(state) {
  return JSON.stringify(validateState(state), null, 2);
}
