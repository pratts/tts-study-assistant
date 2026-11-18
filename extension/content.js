// Content script - runs on every page (the selection button and summary modal).
//
// It can be loaded into a page more than once: the background adds it to
// open tabs on install, update and when website access is granted, and
// Firefox has usually added it already. After the extension is reloaded or
// updated, Chrome also leaves the old copy in the page, "orphaned": its
// chrome.runtime calls fail. So each copy registers itself; a new copy
// skips the page when a live copy runs, and removes an orphaned one.
(() => {
    const INSTANCE_KEY = '__ttsStudyAssistant';
    // This copy's own extension APIs: in a page shared with a newer copy,
    // the global `chrome` may already be the newer copy's.
    const runtime = chrome.runtime;
    const storage = chrome.storage;

    /** False once the extension was reloaded, updated or removed. */
    function isAlive() {
        try {
            return Boolean(runtime?.id);
        } catch {
            return false;
        }
    }

    const previous = globalThis[INSTANCE_KEY];
    if (previous?.isAlive()) return; // already running in this page
    previous?.teardown(); // orphaned copy: remove its button and listeners

    console.log('TTS Study Assistant - Content script loaded');

    // State management
    let isEnabled = true;
    let selectedText = '';
    let actionButton = null;

    globalThis[INSTANCE_KEY] = { isAlive, teardown };

    // Initialize
    (async function init() {
        // Get initial settings
        try {
            const response = await runtime.sendMessage({ action: 'getSettings' });
            if (response && response.enabled !== undefined) {
                isEnabled = response.enabled;
            }
        } catch (e) {
            console.log('Settings not loaded:', e);
        }

        // Setup event listeners
        setupEventListeners();

        // Create action button for PDFs and iframes
        createActionButton();
    })();

    /** Removes this copy's button and page listeners. */
    function teardown() {
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('selectionchange', handleSelectionChange);
        try {
            storage.onChanged.removeListener(handleStorageChange);
        } catch {
            // The extension context is gone; nothing left to remove.
        }
        actionButton?.remove();
        actionButton = null;
        if (globalThis[INSTANCE_KEY]?.teardown === teardown) delete globalThis[INSTANCE_KEY];
    }

    /** Orphaned copies remove themselves on the next page event. */
    function stillAlive() {
        if (isAlive()) return true;
        teardown();
        return false;
    }

    function button(className, label) {
        const el = document.createElement('button');
        el.className = `tts-btn ${className}`;
        el.textContent = label;
        return el;
    }

    // Create minimal action button
    function createActionButton() {
        actionButton = document.createElement('div');
        actionButton.id = 'tts-action-button';
        actionButton.className = 'tts-action-button hidden';

        const savePlayBtn = button('tts-save-play', 'Save & Play');
        const summarizeBtn = button('tts-summarize', 'Summarize');
        actionButton.append(savePlayBtn, summarizeBtn);
        document.body.appendChild(actionButton);

        // Save & Play button listener
        savePlayBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            if (selectedText) {
                try {
                    // Save note first
                    await runtime.sendMessage({
                        action: 'saveNote',
                        noteData: {
                            content: selectedText,
                            source_url: getTruePageUrl(),
                            source_title: document.title || 'PDF Document'
                        }
                    });

                    // Then play the text
                    await runtime.sendMessage({
                        action: 'speak',
                        text: selectedText,
                        options: {}
                    });

                    hideActionButton();
                    window.getSelection().removeAllRanges();
                } catch (error) {
                    console.error('Error:', error);
                }
            }
        });

        // Summarize button listener
        summarizeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            if (selectedText) {
                try {
                    // Show loading state
                    summarizeBtn.textContent = 'Loading...';
                    summarizeBtn.disabled = true;

                    // Send to background to handle (reuse your context menu logic)
                    const response = await runtime.sendMessage({
                        action: 'triggerSummarize',
                        text: selectedText,
                        url: getTruePageUrl(),
                        title: document.title || 'PDF Document'
                    });

                    if (!response || !response.success) {
                        showSummaryModal(response?.error || 'Could not summarize the selection.', 'unavailable');
                    } else if (response.summary === 'unavailable') {
                        showSummaryModal('Summary unavailable - text may be too short or incomplete for summarization.', 'unavailable');
                    } else {
                        showSummaryModal(response.summary);
                    }

                    hideActionButton();
                    window.getSelection().removeAllRanges();
                } catch (error) {
                    console.error('Error summarizing:', error);
                } finally {
                    // Ready for the next selection.
                    summarizeBtn.textContent = 'Summarize';
                    summarizeBtn.disabled = false;
                }
            }
        });
    }

    // Show action button near selection
    function showActionButton(x, y) {
        if (!actionButton || !isEnabled) return;

        // Ensure button stays within viewport
        const buttonWidth = 100;
        const buttonHeight = 35;

        let left = x + 10;
        let top = y - buttonHeight - 5;

        // Adjust if too close to edges
        if (left + buttonWidth > window.innerWidth) {
            left = window.innerWidth - buttonWidth - 10;
        }

        if (top < 10) {
            top = y + 20;
        }

        actionButton.style.left = `${left}px`;
        actionButton.style.top = `${top}px`;
        actionButton.classList.remove('hidden');
    }

    // Hide action button
    function hideActionButton() {
        if (actionButton) {
            actionButton.classList.add('hidden');
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('selectionchange', handleSelectionChange);
        storage.onChanged.addListener(handleStorageChange);
    }

    function handleMouseDown(e) {
        // Don't hide if clicking on the button itself
        if (!actionButton?.contains(e.target)) {
            hideActionButton();
        }
    }

    function handleSelectionChange() {
        const text = window.getSelection().toString().trim();
        if (text.length === 0) {
            hideActionButton();
            selectedText = '';
        }
    }

    // Storage change listener for settings
    function handleStorageChange(changes, namespace) {
        if (namespace === 'sync' && changes.settings) {
            const newSettings = changes.settings.newValue;
            isEnabled = newSettings.enabled !== false;
            if (!isEnabled) {
                hideActionButton();
            }
        }
    }

    // Handle mouse up event
    function handleMouseUp(event) {
        if (!stillAlive()) return;
        // Skip if clicking on our button
        if (actionButton?.contains(event.target)) {
            return;
        }

        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text.length > 0 && isEnabled) {
                selectedText = text;

                // Always show button for any selection (not just PDFs)
                // This ensures it works everywhere
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                showActionButton(
                    rect.left + rect.width / 2,
                    rect.top + window.scrollY
                );
            }
        }, 10);
    }

    function getTruePageUrl() {
        try {
            // If we're in an iframe, try to get parent URL
            if (window.self !== window.top) {
                // Try to access parent URL (may fail due to cross-origin)
                try {
                    return window.top.location.href;
                } catch (e) {
                    // Cross-origin iframe - use referrer as fallback
                    if (document.referrer) {
                        return document.referrer;
                    }
                }
            }
            // Not in iframe or can't access parent - use current URL
            return window.location.href;
        } catch (e) {
            return window.location.href;
        }
    }

    function showSummaryModal(summary, type = "success") {
        // Remove any existing modal
        const existingModal = document.querySelector('.tts-summary-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'tts-summary-modal';

        const isUnavailable = type === "unavailable";
        const title = isUnavailable ? "Summary Unavailable" : "Summary";
        const contentClass = isUnavailable ? "tts-summary-content unavailable" : "tts-summary-content";

        // Built with textContent: the summary is AI output derived from page text
        // and must never be parsed as HTML inside the page.
        const content = document.createElement('div');
        content.className = contentClass;
        const heading = document.createElement('h3');
        heading.textContent = title;
        const body = document.createElement('p');
        body.textContent = summary;
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tts-btn close-modal';
        closeBtn.textContent = 'Close';
        actions.appendChild(closeBtn);
        content.append(heading, body, actions);
        modal.appendChild(content);
        document.body.appendChild(modal);

        // Add event listeners
        closeBtn.addEventListener('click', () => {
            modal.remove();
        });

        // Close on click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
})();
