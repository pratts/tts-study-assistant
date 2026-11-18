import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTime, NOTIFICATION_MAX, RATES, siteDomainFor, snapRate, summaryNotification, truncate, truncateForNotification } from '../js/utils.js';

test('snapRate maps any stored speed to one of the four steps', () => {
    assert.deepEqual(RATES, [0.5, 1, 1.5, 2]);
    assert.equal(snapRate(1), 1);
    assert.equal(snapRate(0.7), 0.5);
    assert.equal(snapRate(1.3), 1.5);
    assert.equal(snapRate(3), 2); // old max
    assert.equal(snapRate(0.1), 0.5);
    assert.equal(snapRate(undefined), 1);
    assert.equal(snapRate('abc'), 1);
});

test('siteDomainFor matches the backend-stored registrable domain', () => {
    const stats = [
        { domain: 'bbc.co.uk', count: 3 },
        { domain: 'example.com', count: 2 },
        { domain: 'docs.example.com', count: 1 },
        { domain: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', count: 4 },
        { domain: '', count: 9 },
    ];
    assert.equal(siteDomainFor('news.bbc.co.uk', stats).domain, 'bbc.co.uk'); // the old code looked up "co.uk"
    assert.equal(siteDomainFor('www.example.com', stats).domain, 'example.com');
    assert.equal(siteDomainFor('docs.example.com', stats).domain, 'docs.example.com'); // longest wins
    assert.equal(siteDomainFor('mhjfbmdgcfjbbpaeojofohoefgiehjai', stats).count, 4); // PDF viewer
    assert.equal(siteDomainFor('notexample.com', stats), null); // label boundary
    assert.equal(siteDomainFor('', stats), null);
});

test('formatTime', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(65_000), '1:05');
    assert.equal(formatTime(3_725_000), '1:02:05');
    assert.equal(formatTime(-5), '0:00');
});

test('truncate by code points', () => {
    assert.equal(truncate('hello', 10), 'hello');
    assert.equal(truncate('😀😀😀', 2), '😀😀…');
});

test('truncateForNotification leaves short text alone, collapsing whitespace', () => {
    assert.equal(truncateForNotification('Short summary.'), 'Short summary.');
    assert.equal(truncateForNotification('  two\n\nlines  '), 'two lines');
    assert.equal(truncateForNotification('x'.repeat(NOTIFICATION_MAX)), 'x'.repeat(NOTIFICATION_MAX));
    assert.equal(truncateForNotification(undefined), '');
});

test('truncateForNotification cuts at a word boundary within the limit', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(10);
    const short = truncateForNotification(text, 50);
    assert.ok([...short].length <= 50, short);
    assert.ok(short.endsWith('…'));
    assert.ok(text.startsWith(short.slice(0, -1)), 'a prefix of the text');
    assert.match(short, /\w…$/, 'no trailing space or punctuation before the ellipsis');
    assert.equal(short, 'The quick brown fox jumps over the lazy dog. The…');
});

test('truncateForNotification hard-cuts one long word', () => {
    assert.equal(truncateForNotification('a'.repeat(30), 10), 'aaaaaaaaa…');
});

test('truncateForNotification never splits emoji or accented letters', () => {
    const family = '👨‍👩‍👧'; // one grapheme, five code points
    const short = truncateForNotification(family.repeat(20), 5);
    assert.equal(short, family.repeat(4) + '…');
    assert.equal(truncateForNotification('e\u0301'.repeat(20), 4), 'e\u0301'.repeat(3) + '…');
});

test('summaryNotification keeps short summaries and points long ones to the popup', () => {
    assert.equal(summaryNotification('A short summary.'), 'A short summary.');
    assert.equal(summaryNotification(''), 'Summary generated successfully.');
    const long = summaryNotification('word '.repeat(200));
    assert.ok([...long].length <= NOTIFICATION_MAX, `${[...long].length} characters`);
    assert.match(long, /… Open the extension for the full summary\.$/);
});
