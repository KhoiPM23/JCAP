import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogHref, contentKind, exampleText, pageNumbers, positivePage, sourceHref, topicHref } from './learningNavigation.ts';

test('topic links retain catalog page, level and search separately from content search', () => {
  const catalog = new URLSearchParams({ kind: 'grammars', page: '2', level: 'N5', keyword: 'Xin phép' });
  const topic = new URL(topicHref(5, catalog, 'grammars', true), 'https://local.test');
  assert.equal(topic.pathname, '/learning/topics/5'); assert.equal(topic.searchParams.get('tab'), 'grammars');
  topic.searchParams.set('keyword', 'ください'); topic.searchParams.set('page', '3');
  const back = new URL(catalogHref(topic.searchParams), 'https://local.test');
  assert.equal(back.searchParams.get('page'), '2'); assert.equal(back.searchParams.get('keyword'), 'Xin phép'); assert.equal(back.searchParams.get('level'), 'N5');
  assert.equal(back.searchParams.get('kind'), 'grammars');
  const anotherTopic = new URL(topicHref(7, topic.searchParams), 'https://local.test');
  assert.equal(anotherTopic.searchParams.get('tab'), 'grammars'); assert.equal(anotherTopic.searchParams.get('keyword'), null); assert.equal(anotherTopic.searchParams.get('page'), null);
  assert.equal(catalogHref(anotherTopic.searchParams), catalogHref(topic.searchParams));
});
test('invalid URL state cannot create an external return URL or invalid API page', () => {
  for (const value of [null, '', '-1', '0', '2.5', 'Infinity', '1000001', 'https://evil.test']) assert.equal(positivePage(value), 1);
  assert.equal(positivePage('2'), 2); assert.equal(contentKind('invalid'), 'vocabularies');
  assert.equal(catalogHref(new URLSearchParams({ catalogPage: '-1', catalogLevel: 'N6', returnUrl: 'https://evil.test' })), '/learning/topics');
});
test('pagination stays bounded at the start, middle and end of a large catalog', () => {
  assert.deepEqual(pageNumbers(1, 1), [1]); assert.deepEqual(pageNumbers(1, 20), [1, 2, null, 20]);
  assert.deepEqual(pageNumbers(10, 20), [1, null, 9, 10, 11, null, 20]); assert.deepEqual(pageNumbers(20, 20), [1, null, 19, 20]);
});
test('source URLs allow http/https and reject executable or relative URLs', () => {
  assert.equal(sourceHref('https://example.org/license'), 'https://example.org/license');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '/relative', '', undefined]) assert.equal(sourceHref(value), undefined);
});
test('furigana cannot replace the original Japanese sentence with different content', () => {
  assert.equal(exampleText('猫がいます。', '{猫|ねこ}がいます。'), '{猫|ねこ}がいます。');
  assert.equal(exampleText('猫がいます。', 'ねこ'), '猫がいます。'); assert.equal(exampleText('猫がいます。', '{犬|いぬ}がいます。'), '猫がいます。');
});
