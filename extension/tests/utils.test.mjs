import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTime, RATES, siteDomainFor, snapRate, truncate } from '../js/utils.js';

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
