import assert from 'node:assert/strict';
import test from 'node:test';
import { romanize } from './parser.mjs';
import {
  checkAnswer, EXERCISES, initialState, makeBackup, MAX_ANNOTATIONS, MAX_BACKUP,
  MAX_READING, MAX_SPAN, MAX_TEXT, parseBackup, recordAnswer, removeAnnotation,
  setAnnotation, setPrefs, setText, validateState,
} from './state.mjs';

test('annotates, replaces, and removes only selected kanji; offsets match a textarea', () => {
  const base = setText(initialState(), '🙂東京京都。\n東京　はな');
  const first = setAnnotation(base, 2, 4, 'とうきょう');
  const second = setAnnotation(first, 8, 10, 'トウキョウ');
  const updated = setAnnotation(second, 2, 4, 'トウキョー');
  assert.deepEqual(base.annotations, []);
  assert.deepEqual(updated.annotations, [
    { start: 2, end: 4, reading: 'トウキョー' },
    { start: 8, end: 10, reading: 'トウキョウ' },
  ]);
  assert.deepEqual(removeAnnotation(updated, 2, 4).annotations, [updated.annotations[1]]);
  assert.equal(updated.text, '🙂東京京都。\n東京　はな');
});

test('accepts astral kanji as a whole, rejects invalid or overlapping selections', () => {
  const base = setText(initialState(), '𠮷田。かな');
  const tagged = setAnnotation(base, 0, 3, 'よしだ');
  assert.throws(() => setAnnotation(tagged, 0, 2, 'よし'), /重疊/);
  for (const [start, end] of [[0, 1], [1, 2], [2, 4], [4, 6], [0, 9], [-1, 2], [0, 0], [0.25, 3]]) {
    assert.throws(() => setAnnotation(base, start, end, 'よしだ'));
  }
});

test('validates the reading as kana, not automatic knowledge of a character', () => {
  const base = setText(initialState(), '読');
  for (const bad of ['yomi', '読み', 'よみ。', ' よみ', 'よ　み', '🙂', 'ー', '゙', 'っ', '', 'あ'.repeat(MAX_READING + 1)]) {
    assert.throws(() => setAnnotation(base, 0, 1, bad), /有效/);
  }
  for (const good of ['よみ', 'ｶﾞﾗｽ', 'か\u3099']) {
    assert.equal(setAnnotation(base, 0, 1, good).annotations[0].reading, good);
  }
});

test('any changed source clears annotations so repeated kanji cannot inherit a reading', () => {
  const base = setAnnotation(setText(initialState(), '東京東京'), 0, 2, 'とうきょう');
  assert.equal(setText(base, base.text), base);
  for (const changed of ['東京', '東京東京。', '京都東京東京', '東京\n東京']) {
    assert.deepEqual(setText(base, changed).annotations, []);
  }
  assert.equal(base.annotations.length, 1);
});

test('bounded text and annotation count/span validation', () => {
  assert.equal(setText(initialState(), '水'.repeat(MAX_TEXT)).text.length, MAX_TEXT);
  assert.throws(() => setText(initialState(), '水'.repeat(MAX_TEXT + 1)), /格式無效/);
  assert.throws(() => setText(initialState(), '\uD800'), /格式無效/);
  const base = setText(initialState(), '水'.repeat(MAX_ANNOTATIONS + 1));
  assert.throws(() => setAnnotation(base, 0, MAX_SPAN + 1, 'みず'), /48/);
  let state = base;
  for (let i = 0; i < MAX_ANNOTATIONS; i++) state = setAnnotation(state, i, i + 1, 'みず');
  assert.throws(() => setAnnotation(state, MAX_ANNOTATIONS, MAX_ANNOTATIONS + 1, 'みず'), /300/);
  assert.doesNotThrow(() => setAnnotation(state, 0, 1, 'すい'));
});

test('stable mistake ids are deduplicated, retained across source edits, and cleared on retry', () => {
  const initial = initialState();
  const wrong = recordAnswer(initial, 'yoon-kya', false);
  assert.deepEqual(recordAnswer(wrong, 'yoon-kya', false).mistakes, ['yoon-kya']);
  assert.deepEqual(setText(wrong, '').mistakes, ['yoon-kya']);
  assert.deepEqual(recordAnswer(wrong, 'yoon-kya', true).mistakes, []);
  assert.deepEqual(initial.mistakes, []);
  assert.throws(() => recordAnswer(initial, '__proto__', true), /找不到/);
  assert.equal(checkAnswer('n-boundary', ' SHIN’YOU '), true);
  assert.equal(checkAnswer('n-boundary', 'shinyou'), false);
  assert.equal(checkAnswer('sokuon-gakkou', 'GAKKＯ̄'), true);
  assert.equal(checkAnswer('choon-super', 'suupaa'), true);
  assert.ok(EXERCISES.every((exercise) => romanize(exercise.prompt) === exercise.answer));
});

test('backup restores exact source, reading, prefs and mistakes without retaining reference aliases', () => {
  const state = recordAnswer(setPrefs(setAnnotation(setText(initialState(), 'Ａ\n大阪！🤔'), 2, 4, 'おおさか'),
    { hints: false, theme: 'dark', size: 'extra-large' }), 'hiragana', false);
  const restored = parseBackup('\uFEFF' + makeBackup(state));
  assert.deepEqual(restored, state);
  restored.annotations[0].reading = 'でたらめ';
  restored.prefs.hints = true;
  restored.mistakes.push('yoon-kya');
  assert.equal(state.annotations[0].reading, 'おおさか');
  assert.equal(state.prefs.hints, false);
  assert.equal(state.mistakes.length, 1);
  assert.throws(() => setPrefs(state, { size: 'huge' }), /設定/);
});

test('backup rejects corrupted, oversized, malformed, unsupported and duplicate data', () => {
  assert.throws(() => parseBackup('{'), /無法讀取/);
  assert.throws(() => parseBackup('界'.repeat(Math.ceil(MAX_BACKUP / 3) + 1)), /大小限制/);
  assert.throws(() => parseBackup(null), /大小限制/);
  assert.throws(() => validateState({ ...initialState(), version: 2 }), /版本/);
  assert.throws(() => validateState({ ...initialState(), prefs: null }), /設定/);
  assert.throws(() => validateState({ ...initialState(), mistakes: ['spoof'] }), /錯題/);
  assert.throws(() => validateState({ ...initialState(), mistakes: Array(1) }), /錯題/);
  assert.throws(() => validateState({ ...initialState(), mistakes: ['hiragana', 'hiragana'] }), /錯題/);
  const annotation = { start: 0, end: 1, reading: 'あ' };
  assert.throws(() => validateState({ ...initialState(), text: '漢', annotations: [annotation, annotation] }), /重疊/);
  assert.throws(() => validateState({ ...initialState(), text: '漢', annotations: [{ ...annotation, end: 2 }] }), /48/);
  assert.throws(() => validateState({ ...initialState(), text: '漢', annotations: [{ ...annotation, reading: 'abc' }] }), /有效/);
});
