import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOGIN_TITLE, promptLogin } from '../js/login-prompt.js';

function recorder() {
    const notes = [];
    return { notes, notify: (title, message) => notes.push({ title, message }) };
}

test('opens the popup when the browser allows it (Chrome 127+)', async () => {
    const { notes, notify } = recorder();
    let opened = 0;
    assert.equal(await promptLogin({ action: { openPopup: async () => void opened++ }, notify }), 'popup');
    assert.equal(opened, 1);
    assert.deepEqual(notes, [], 'no notification on top of the popup');
});

test('falls back to a notification when openPopup rejects (Firefox outside a user action)', async () => {
    const { notes, notify } = recorder();
    const action = { openPopup: async () => { throw new Error('openPopup may only be called from a user input handler'); } };
    assert.equal(await promptLogin({ action, notify }), 'notification');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].title, LOGIN_TITLE);
    assert.match(notes[0].message, /toolbar/);
});

test('falls back to a notification when openPopup is missing (Chrome before 127)', async () => {
    for (const action of [{}, undefined]) {
        const { notes, notify } = recorder();
        assert.equal(await promptLogin({ action, notify }), 'notification');
        assert.equal(notes.length, 1);
    }
});
