/**
 * SignX - YouTube Caption Content Script (Phase 5)
 * Detects live YouTube caption text changes, normalizes and tokenizes them,
 * matches against the ISL vocabulary, and dispatches sign sequences to the avatar overlay.
 *
 * Strategy: Read caption text directly from the DOM — no YouTube API key required.
 * Selectors supported: .ytp-caption-segment, .ytp-caption-window-container,
 *                      ytd-transcript-segment-renderer (auto-generated subtitles)
 */

(function () {
  if (window.__SIGNX_YT_CAPTION_LOADED__) return;
  window.__SIGNX_YT_CAPTION_LOADED__ = true;

  /* ──────────────────────────────────────────────
     VOCABULARY SET  (loaded from embedded lookup)
  ────────────────────────────────────────────── */

  // Core vocabulary supported by the ISL avatar (mirrors data/vocabulary.json keys)
  const VOCABULARY = new Set([
    'NAMASTE', 'HELLO', 'HI', 'THANK_YOU', 'WELCOME', 'PLEASE', 'YES', 'NO',
    'HELP', 'WHERE', 'WHAT', 'WHO', 'HOW', 'GOOD_MORNING', 'WATER', 'FOOD',
    'DOCTOR', 'EMERGENCY', 'TRAIN_STATION', 'SCHOOL', 'MY_NAME', 'GOODBYE',
    'ARE', 'YOU', 'ME', 'WE', 'THEY', 'MORNING', 'GOOD', 'THANK', 'EAT',
    // ISL fingerspelling (single letters A–Z)
    'ISL_A','ISL_B','ISL_C','ISL_D','ISL_E','ISL_F','ISL_G','ISL_H','ISL_I',
    'ISL_J','ISL_K','ISL_L','ISL_M','ISL_N','ISL_O','ISL_P','ISL_Q','ISL_R',
    'ISL_S','ISL_T','ISL_U','ISL_V','ISL_W','ISL_X','ISL_Y','ISL_Z'
  ]);

  // Word → vocabulary key normalizer
  const WORD_MAP = {
    'hello': 'NAMASTE',
    'hi': 'NAMASTE',
    'namaste': 'NAMASTE',
    'goodbye': 'GOODBYE',
    'bye': 'GOODBYE',
    'good': 'GOOD',
    'morning': 'GOOD_MORNING',
    'good morning': 'GOOD_MORNING',
    'thank': 'THANK_YOU',
    'thanks': 'THANK_YOU',
    'thank you': 'THANK_YOU',
    'thankyou': 'THANK_YOU',
    'please': 'PLEASE',
    'welcome': 'WELCOME',
    'yes': 'YES',
    'no': 'NO',
    'help': 'HELP',
    'where': 'WHERE',
    'what': 'WHAT',
    'who': 'WHO',
    'how': 'HOW',
    'water': 'WATER',
    'food': 'FOOD',
    'eat': 'FOOD',
    'doctor': 'DOCTOR',
    'emergency': 'EMERGENCY',
    'train station': 'TRAIN_STATION',
    'train': 'TRAIN_STATION',
    'school': 'SCHOOL',
    'name': 'MY_NAME',
    'my name': 'MY_NAME',
    'are': 'ARE',
    'you': 'YOU',
    'i': 'ME',
    'me': 'ME',
    'we': 'WE',
    'they': 'THEY'
  };

  /* ──────────────────────────────────────────────
     STATE
  ────────────────────────────────────────────── */
  let lastCaptionText = '';
  let lastSignedText  = '';
  let captionObserver = null;
  let dispatchTimer   = null;
  let enabled         = true;
  let isPaused        = false;
  let ytVideoEl       = null;

  /* ──────────────────────────────────────────────
     TEXT NORMALIZATION & TOKENIZATION
  ────────────────────────────────────────────── */

  /**
   * Normalize raw caption string: lowercase, strip punctuation, collapse whitespace
   */
  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Tokenize normalized text into ISL vocabulary tokens.
   * Tries bigrams first, then unigrams. Unknown words are tagged { key, available: false }.
   */
  function tokenize(normalizedText) {
    const words = normalizedText.split(/\s+/).filter(Boolean);
    const tokens = [];
    let i = 0;

    while (i < words.length) {
      // Try 2-word phrase first
      const bigram = words[i] + ' ' + words[i + 1];
      if (i + 1 < words.length && WORD_MAP[bigram]) {
        tokens.push({ word: bigram, key: WORD_MAP[bigram], available: true });
        i += 2;
        continue;
      }
      // Unigram
      const word = words[i];
      if (WORD_MAP[word]) {
        tokens.push({ word, key: WORD_MAP[word], available: true });
      } else if (VOCABULARY.has(word.toUpperCase())) {
        tokens.push({ word, key: word.toUpperCase(), available: true });
      } else {
        // Word-by-word translation: fingerspell word initial letter or sign
        const firstChar = word.charAt(0).toUpperCase();
        const letterKey = `ISL_${firstChar}`;
        tokens.push({ word, key: letterKey, available: true, isFingerspelled: true });
      }
      i++;
    }

    return tokens;
  }

  /**
   * Filter tokens to only those with available ISL signs,
   * de-duplicate consecutive identical tokens.
   */
  function filterAndDedup(tokens) {
    const available = tokens.filter(t => t.available);
    return available.filter((t, i) => i === 0 || t.key !== available[i - 1].key);
  }

  /* ──────────────────────────────────────────────
     CAPTION CHANGE DETECTION
  ────────────────────────────────────────────── */

  /**
   * Read current caption text from YouTube DOM.
   * Tries multiple selector strategies in order.
   */
  function readCaptionText() {
    const selectors = [
      '.ytp-caption-segment',
      '.captions-text span',
      '.ytp-caption-window-container .caption-visual-line span',
      '[class*="caption-segment"]'
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        const text = Array.from(els).map(el => el.textContent || '').join(' ').trim();
        if (text.length > 1) return text;
      }
    }
    return '';
  }

  /**
   * Process a caption change:
   * 1. Normalize & tokenize text
   * 2. Validate vocabulary match
   * 3. Deduplicate against last signed sequence
   * 4. Dispatch if something new to sign
   */
  function processCaptionChange(rawText) {
    if (!enabled || isPaused) return;
    if (!rawText || rawText.length < 2) return;
    if (rawText === lastCaptionText) return; // No change at all

    lastCaptionText = rawText;

    const normalized = normalize(rawText);
    const tokens = tokenize(normalized);
    const signTokens = filterAndDedup(tokens);

    if (signTokens.length === 0) return;

    // Build key fingerprint to detect if we already signed this exact sequence
    const fingerprint = signTokens.map(t => t.key).join('|');
    if (fingerprint === lastSignedText) return; // Same sequence already dispatched

    lastSignedText = fingerprint;

    const signKeys = signTokens.map(t => t.key);
    const unavailableWords = tokens.filter(t => !t.available).map(t => t.word);

    console.log('[SignX YT] Caption:', rawText);
    console.log('[SignX YT] Tokens to sign:', signKeys);
    if (unavailableWords.length > 0) {
      console.log('[SignX YT] Skipped (no ISL sign):', unavailableWords);
    }

    // Dispatch to avatar via chrome.runtime message
    chrome.runtime.sendMessage({
      type: 'SIGNX_YOUTUBE_CAPTION_UPDATE',
      payload: {
        caption: rawText,
        signSequence: signKeys,
        unavailableWords,
        timestamp: Date.now()
      }
    }).catch(() => {});

    // Also dispatch to content.js overlay if active on the same page
    window.dispatchEvent(new CustomEvent('signx:caption-signs', {
      detail: { signSequence: signKeys, unavailableWords, rawText }
    }));
  }

  /* ──────────────────────────────────────────────
     MUTATION OBSERVER
  ────────────────────────────────────────────── */

  function initCaptionObserver() {
    if (captionObserver) captionObserver.disconnect();

    // Watch the broadest possible container for caption mutations
    const root = document.querySelector('.ytp-caption-window-container')
               || document.querySelector('#player-container')
               || document.body;

    captionObserver = new MutationObserver(() => {
      // Debounce: wait 120ms after last mutation to batch rapid caption updates
      clearTimeout(dispatchTimer);
      dispatchTimer = setTimeout(() => {
        const text = readCaptionText();
        if (text) processCaptionChange(text);
      }, 120);
    });

    captionObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });

    console.log('[SignX YT] Caption observer initialized.');
  }

  /* ──────────────────────────────────────────────
     YOUTUBE PLAYER PAUSE / RESUME SYNC
  ────────────────────────────────────────────── */

  function bindVideoEvents() {
    ytVideoEl = document.querySelector('video.html5-main-video, video[src*="youtube"]');
    if (!ytVideoEl) {
      // Retry after player loads
      setTimeout(bindVideoEvents, 1500);
      return;
    }

    ytVideoEl.addEventListener('pause', () => {
      isPaused = true;
      chrome.runtime.sendMessage({ type: 'SIGNX_YT_PLAYER_PAUSED' }).catch(() => {});
      window.dispatchEvent(new CustomEvent('signx:player-paused'));
      console.log('[SignX YT] Player paused — avatar paused.');
    });

    ytVideoEl.addEventListener('play', () => {
      isPaused = false;
      chrome.runtime.sendMessage({ type: 'SIGNX_YT_PLAYER_RESUMED' }).catch(() => {});
      window.dispatchEvent(new CustomEvent('signx:player-resumed'));
      console.log('[SignX YT] Player resumed — avatar resumed.');
    });

    ytVideoEl.addEventListener('seeked', () => {
      // After seek: reset last signed fingerprint so signs can replay
      lastSignedText = '';
      lastCaptionText = '';
      console.log('[SignX YT] Seek detected — resetting caption fingerprint.');
    });
  }

  /* ──────────────────────────────────────────────
     ENABLE / DISABLE TOGGLE
  ────────────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SIGNX_YT_CAPTION_ENABLE') {
      enabled = true;
      lastSignedText = '';
      lastCaptionText = '';
      sendResponse({ enabled: true });
    } else if (message.type === 'SIGNX_YT_CAPTION_DISABLE') {
      enabled = false;
      chrome.runtime.sendMessage({ type: 'SIGNX_YT_AVATAR_STOP' }).catch(() => {});
      window.dispatchEvent(new CustomEvent('signx:caption-disabled'));
      sendResponse({ enabled: false });
    } else if (message.type === 'SIGNX_YT_CAPTION_STATUS') {
      sendResponse({ enabled, isPaused, lastCaption: lastCaptionText });
    }
    return true;
  });

  /* ──────────────────────────────────────────────
     BOOT & NAVIGATION HOOKS
  ────────────────────────────────────────────── */

  function boot() {
    // Wait for YouTube player to be present (SPA navigation may delay this)
    const playerReady = document.querySelector('.ytp-caption-window-container, #movie_player');
    if (!playerReady) {
      setTimeout(boot, 800);
      return;
    }
    initCaptionObserver();
    bindVideoEvents();
  }

  // Handle YouTube SPA navigation (yt-navigate-finish fires on every page change)
  window.addEventListener('yt-navigate-finish', () => {
    lastCaptionText = '';
    lastSignedText = '';
    isPaused = false;
    ytVideoEl = null;
    setTimeout(boot, 600);
  });

  boot();
})();
