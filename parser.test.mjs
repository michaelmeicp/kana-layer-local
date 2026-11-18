import test from 'node:test';
import assert from 'node:assert/strict';
import { romanize, isReading, readingRuns } from './parser.mjs';

test('representative kana, words and punctuation', () => {
  for (const [source, expected] of Object.entries({
    'きゃ':'kya','がっこう':'gakkō','スーパー':'sūpā','ひらがな':'hiragana',
    'しんよう':"shin'yō",'まっちゃ':'matcha','ざっし':'zasshi','みっつ':'mittsu',
    'がっこう、スーパー。\nひらがな！':'gakkō、sūpā。\nhiragana！',
    'は・へ・を':'ha・he・o','んあ・んや・んま':"n'a・n'ya・nma",
    'うえ と こ、う':'ue to ko、u'
  })) assert.equal(romanize(source), expected, source);
});
test('mixed and decomposed kana, modern foreign sounds, and safe passthrough',()=>{
  for (const [source,expected] of [
    ['ｽｰﾊﾟｰ','sūpā'],['か\u3099っこ\u3046','gakkō'],['グッズ','guzzu'],
    ['ティッシュ、ディープ、ファイル、ヴォイス','tisshu、dīpu、fairu、voisu'],
    ['ジュース・ツァー・シェア','jūsu・tsā・shea'],
    ['漢字と🙂ＡＢＣ ①\n漢字','漢字to🙂ＡＢＣ ①\n漢字'],
    ['っ・ー・ヾ・か\u309a','っ・ー・ヾ・か\u309a'],
    ['きゃ　ゃ','kya　ゃ']
  ]) assert.equal(romanize(source),expected,source);
});
test('valid user-supplied readings must be recognized kana with no delimiters',()=>{
  for (const source of ['ひらがな','カタカナ','ｶﾞｯｺｳ','か\u3099','スーパー','まっちゃ']) assert.equal(isReading(source),true,source);
  for (const source of [null,'',' ',' 学校','漢字','ABC','かな。','かな\n','っ','ー','ぁ','か\u309a','🙂']) assert.equal(isReading(source),false,String(source));
});
test('runs preserve original source and UTF-16 annotation coordinates',()=>{
  const source = '🙂学校、か\u3099っこう\nｽｰﾊﾟｰ';
  const runs = readingRuns(source);
  assert.equal(runs.map(x=>x.source).join(''), source);
  assert.deepEqual(runs, [
    {source:'🙂学校、',reading:null,start:0,end:5},
    {source:'か\u3099っこう',reading:'gakkō',start:5,end:10},
    {source:'\n',reading:null,start:10,end:11},
    {source:'ｽｰﾊﾟｰ',reading:'sūpā',start:11,end:16}
  ]);
});
