// Orthographic, Hepburn-style hints, not a pronunciation dictionary.
// Only kana are normalized: other code points retain their exact spelling.
const groups = [
  ['あいうえお','a i u e o'], ['かきくけこ','ka ki ku ke ko'], ['がぎぐげご','ga gi gu ge go'],
  ['さしすせそ','sa shi su se so'], ['ざじずぜぞ','za ji zu ze zo'],
  ['たちつてと','ta chi tsu te to'], ['だぢづでど','da ji zu de do'],
  ['なにぬねの','na ni nu ne no'], ['はひふへほ','ha hi fu he ho'],
  ['ばびぶべぼ','ba bi bu be bo'], ['ぱぴぷぺぽ','pa pi pu pe po'],
  ['まみむめも','ma mi mu me mo'], ['やゆよ','ya yu yo'], ['らりるれろ','ra ri ru re ro'],
  ['わゐゑをんゔ','wa wi we o n vu']
];
const mono = new Map(groups.flatMap(([kana, reading]) => [...kana].map((k,i) => [k, reading.split(' ')[i]])));
for (const [k,r] of Object.entries({'ヷ':'va','ヸ':'vi','ヹ':'ve','ヺ':'vo'})) mono.set(k,r);
const pairs = new Map();
for (const [k,c] of Object.entries({'き':'ky','ぎ':'gy','し':'sh','じ':'j','ち':'ch','ぢ':'j','に':'ny','ひ':'hy','び':'by','ぴ':'py','み':'my','り':'ry','ふ':'fy','ゔ':'vy','て':'ty','で':'dy'})) {
  for (const [s,v] of Object.entries({'ゃ':'a','ゅ':'u','ょ':'o'})) pairs.set(k+s, c+v);
}
for (const [k,r] of Object.entries({
  'いぇ':'ye','うぁ':'wa','うぃ':'wi','うぇ':'we','うぉ':'wo',
  'ゔぁ':'va','ゔぃ':'vi','ゔぇ':'ve','ゔぉ':'vo',
  'しぇ':'she','じぇ':'je','ちぇ':'che','すぃ':'si','ずぃ':'zi',
  'てぃ':'ti','てゅ':'tyu','とぅ':'tu','でぃ':'di','でゅ':'dyu','どぅ':'du',
  'つぁ':'tsa','つぃ':'tsi','つぇ':'tse','つぉ':'tso',
  'ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo','ふゅ':'fyu',
  'くぁ':'kwa','くぃ':'kwi','くぇ':'kwe','くぉ':'kwo','くゎ':'kwa',
  'ぐぁ':'gwa','ぐぃ':'gwi','ぐぇ':'gwe','ぐぉ':'gwo','ぐゎ':'gwa',
  'きぇ':'kye','ぎぇ':'gye','にぇ':'nye','ひぇ':'hye','びぇ':'bye','ぴぇ':'pye','みぇ':'mye','りぇ':'rye'
})) pairs.set(k,r);

const kanaBase = /^[\u3041-\u3096\u30A1-\u30FA\uFF66-\uFF9D]$/u;
const combining = /^[\u3099\u309A\uFF9E\uFF9F]$/u;
function normalize(source) {
  return [...source.normalize('NFKC')].map(c => {
    const cp = c.codePointAt(0);
    return cp >= 0x30a1 && cp <= 0x30f6 ? String.fromCodePoint(cp - 0x60) : c;
  }).join('');
}
function units(text) {
  const a = [];
  let i = 0;
  for (const c of text) {
    const prev = a.at(-1);
    if (prev && combining.test(c) && kanaBase.test(prev.source)) {
      prev.source += c;
      prev.end += c.length;
      prev.k = normalize(prev.source);
    } else {
      a.push({source:c, start:i, end:i+c.length, k:kanaBase.test(c) || c === 'ー' ? normalize(c) : null});
    }
    i += c.length;
  }
  return a;
}
function morae(text) {
  const a = units(text);
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[i+1];
    const r = p.k && q?.k && pairs.get(p.k+q.k);
    if (r) {
      out.push({...p, source:p.source+q.source, end:q.end, r});
      i++;
    } else out.push({...p, r:mono.get(p.k) ?? null});
  }
  return out;
}
const marks = {a:'ā',i:'ī',u:'ū',e:'ē',o:'ō'};
const unmark = {'ā':'a','ī':'i','ū':'u','ē':'e','ō':'o'};
export function readingRuns(text) {
  const m = morae(text), result = [];
  let active = null;
  let lastKana = null;
  for (let i = 0; i < m.length; i++) {
    const {source, start, end, k, r} = m[i];
    const next = m[i+1]?.r;
    let hint = r;
    let previous = active?.reading?.slice(-1);
    if (k === 'ん' && next && /^[aiueoy]/.test(next)) hint = "n'";
    if (k === 'っ' && next && /^[bcdfghjkmprstvwz]/.test(next) && m[i+1].k !== 'ん') {
      hint = next.startsWith('ch') ? 't' : next[0];
    }
    // Mark ー and contiguous お-row + う/お. Explicit word breaks
    // (punctuation, space or non-kana) always reset the look-behind.
    const longO = (k === 'う' || k === 'お') && previous === 'o' && lastKana !== 'を';
    if ((k === 'ー' && (Object.hasOwn(marks,previous) || Object.hasOwn(unmark,previous))) || longO) {
      hint = '';
      active.reading = active.reading.slice(0,-1) + (marks[previous] ?? previous);
    }
    const known = hint !== null;
    if (!active || (active.reading !== null) !== known) {
      active = {source:'',reading:known?'':null,start,end};
      result.push(active);
    }
    active.source += source;
    active.end = end;
    if (known) active.reading += hint;
    lastKana = known ? k : null;
  }
  return result;
}
export function romanize(text) {
  return readingRuns(text).map(r => r.reading ?? r.source).join('');
}
export function isReading(text) {
  return typeof text === 'string' && text.length > 0 && readingRuns(text).every(r => r.reading !== null);
}
