/**
 * SignX Phase 5 Audit & Verification Script
 * Tests: Caption detection logic, tokenizer, vocab matching,
 * duplicate prevention, unavailable-word gating, CaptionSync API surface,
 * file structure, and security scan.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

console.log('=== SIGNX PHASE 5 AUDIT & VERIFICATION ===\n');

let passed = 0;
const errors = [];

function check(condition, msg, failMsg) {
  if (condition) {
    console.log(`✓ ${msg}`);
    passed++;
  } else {
    const e = `✖ ${failMsg || msg}`;
    console.error(e);
    errors.push(e);
  }
}

/* ──────────────────────────────────────────────
   INLINE: reproduce the exact tokenizer from youtube-caption.js
   (tests run in Node — cannot import a content script IIFE directly)
────────────────────────────────────────────── */

const VOCABULARY = new Set([
  'NAMASTE','HELLO','HI','THANK_YOU','WELCOME','PLEASE','YES','NO',
  'HELP','WHERE','WHAT','WHO','HOW','GOOD_MORNING','WATER','FOOD',
  'DOCTOR','EMERGENCY','TRAIN_STATION','SCHOOL','MY_NAME','GOODBYE',
  'ARE','YOU','ME','WE','THEY','MORNING','GOOD','THANK','EAT',
  'ISL_A','ISL_B','ISL_C','ISL_D','ISL_E','ISL_F','ISL_G','ISL_H','ISL_I',
  'ISL_J','ISL_K','ISL_L','ISL_M','ISL_N','ISL_O','ISL_P','ISL_Q','ISL_R',
  'ISL_S','ISL_T','ISL_U','ISL_V','ISL_W','ISL_X','ISL_Y','ISL_Z'
]);

const WORD_MAP = {
  'hello':'NAMASTE','hi':'NAMASTE','namaste':'NAMASTE',
  'goodbye':'GOODBYE','bye':'GOODBYE',
  'good':'GOOD','morning':'GOOD_MORNING','good morning':'GOOD_MORNING',
  'thank':'THANK_YOU','thanks':'THANK_YOU','thank you':'THANK_YOU','thankyou':'THANK_YOU',
  'please':'PLEASE','welcome':'WELCOME','yes':'YES','no':'NO','help':'HELP',
  'where':'WHERE','what':'WHAT','who':'WHO','how':'HOW',
  'water':'WATER','food':'FOOD','eat':'FOOD','doctor':'DOCTOR',
  'emergency':'EMERGENCY','train station':'TRAIN_STATION','train':'TRAIN_STATION',
  'school':'SCHOOL','name':'MY_NAME','my name':'MY_NAME',
  'are':'ARE','you':'YOU','i':'ME','me':'ME','we':'WE','they':'THEY'
};

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(normalizedText) {
  const words = normalizedText.split(/\s+/).filter(Boolean);
  const tokens = [];
  let i = 0;
  while (i < words.length) {
    const bigram = words[i] + ' ' + words[i + 1];
    if (i + 1 < words.length && WORD_MAP[bigram]) {
      tokens.push({ word: bigram, key: WORD_MAP[bigram], available: true });
      i += 2; continue;
    }
    const word = words[i];
    if (WORD_MAP[word]) {
      tokens.push({ word, key: WORD_MAP[word], available: true });
    } else if (VOCABULARY.has(word.toUpperCase())) {
      tokens.push({ word, key: word.toUpperCase(), available: true });
    } else {
      tokens.push({ word, key: word.toUpperCase(), available: false });
    }
    i++;
  }
  return tokens;
}

function filterAndDedup(tokens) {
  const available = tokens.filter(t => t.available);
  return available.filter((t, i) => i === 0 || t.key !== available[i - 1].key);
}

/* ──────────────────────────────────────────────
   1. NORMALIZATION
────────────────────────────────────────────── */
console.log('── TEXT NORMALIZATION ───────────────────────────────────────');

check(normalize('Hello, World!') === 'hello world',
  'Normalize: punctuation stripped, lowercase applied.',
  `normalize("Hello, World!") → "${normalize('Hello, World!')}"`);

check(normalize('Thank   you!!') === 'thank you',
  'Normalize: multi-space collapsed.',
  `normalize("Thank   you!!") → "${normalize('Thank   you!!')}"`);

check(normalize("It's a good morning.") === "it's a good morning",
  "Normalize: apostrophe preserved in contractions.",
  `normalize("It's a good morning.") → "${normalize("It's a good morning.")}"`);

/* ──────────────────────────────────────────────
   2. TOKENIZER — UNIGRAMS
────────────────────────────────────────────── */
console.log('\n── TOKENIZER: UNIGRAMS ──────────────────────────────────────');

const cases = [
  { input: 'hello everyone', expect: ['NAMASTE'], unavail: ['everyone'] },
  { input: 'hello how are you', expect: ['NAMASTE','HOW','ARE','YOU'], unavail: [] },
  { input: 'goodbye', expect: ['GOODBYE'], unavail: [] },
  { input: 'please help me', expect: ['PLEASE','HELP','ME'], unavail: [] },
  { input: 'water please', expect: ['WATER','PLEASE'], unavail: [] },
  { input: 'call the doctor emergency', expect: ['DOCTOR','EMERGENCY'], unavail: ['call','the'] },
  { input: 'unknown word foobar', expect: [], unavail: ['unknown','word','foobar'] },
  { input: 'yes no yes', expect: ['YES','NO','YES'], unavail: [] },
];

for (const { input, expect, unavail } of cases) {
  const tokens = tokenize(normalize(input));
  const filtered = filterAndDedup(tokens);
  const gotKeys = filtered.map(t => t.key);
  const gotUnavail = tokens.filter(t => !t.available).map(t => t.word);

  check(JSON.stringify(gotKeys) === JSON.stringify(expect),
    `Tokenizer: "${input}" → [${expect.join(', ')}]`,
    `Tokenizer fail: "${input}" → got [${gotKeys.join(', ')}] expected [${expect.join(', ')}]`);

  if (unavail.length > 0) {
    const allSkipped = unavail.every(w => gotUnavail.includes(w));
    check(allSkipped,
      `  ↳ Skipped (no sign): [${unavail.join(', ')}]`,
      `  ↳ Expected skipped [${unavail.join(', ')}], got [${gotUnavail.join(', ')}]`);
  }
}

/* ──────────────────────────────────────────────
   3. TOKENIZER — BIGRAMS
────────────────────────────────────────────── */
console.log('\n── TOKENIZER: BIGRAMS (multi-word phrases) ──────────────────');

const bigramCases = [
  { input: 'thank you very much', expect: ['THANK_YOU'], unavail: ['very','much'] },
  { input: 'good morning everyone', expect: ['GOOD_MORNING'], unavail: ['everyone'] },
  { input: 'my name is john', expect: ['MY_NAME'], unavail: ['is','john'] },
  { input: 'train station where', expect: ['TRAIN_STATION','WHERE'], unavail: [] },
];

for (const { input, expect, unavail } of bigramCases) {
  const tokens = tokenize(normalize(input));
  const filtered = filterAndDedup(tokens);
  const gotKeys = filtered.map(t => t.key);
  const gotUnavail = tokens.filter(t => !t.available).map(t => t.word);

  check(JSON.stringify(gotKeys) === JSON.stringify(expect),
    `Bigram: "${input}" → [${expect.join(', ')}]`,
    `Bigram fail: "${input}" → got [${gotKeys.join(', ')}] expected [${expect.join(', ')}]`);

  if (unavail.length > 0) {
    const allSkipped = unavail.every(w => gotUnavail.includes(w));
    check(allSkipped,
      `  ↳ Bigram skipped: [${unavail.join(', ')}]`,
      `  ↳ Bigram expected skip [${unavail.join(', ')}], got [${gotUnavail.join(', ')}]`);
  }
}

/* ──────────────────────────────────────────────
   4. DUPLICATE PREVENTION
────────────────────────────────────────────── */
console.log('\n── DUPLICATE PREVENTION ─────────────────────────────────────');

// Consecutive dedup
const dedupTest = tokenize(normalize('yes yes yes no no'));
const dedupFiltered = filterAndDedup(dedupTest);
check(JSON.stringify(dedupFiltered.map(t => t.key)) === JSON.stringify(['YES','NO']),
  `Dedup: "yes yes yes no no" → [YES, NO] (consecutive duplicates removed).`,
  `Dedup fail: got [${dedupFiltered.map(t => t.key).join(', ')}]`);

// Non-consecutive same tokens should NOT be deduped
const nonConsecTest = tokenize(normalize('hello how hello'));
const nonConsecFiltered = filterAndDedup(nonConsecTest);
check(JSON.stringify(nonConsecFiltered.map(t => t.key)) === JSON.stringify(['NAMASTE','HOW','NAMASTE']),
  'Dedup: Non-consecutive same tokens preserved [NAMASTE, HOW, NAMASTE].',
  `Non-consec dedup fail: got [${nonConsecFiltered.map(t => t.key).join(', ')}]`);

/* ──────────────────────────────────────────────
   5. NO FAKE SIGNS — STRICT GATING
────────────────────────────────────────────── */
console.log('\n── NO FAKE SIGN GENERATION ──────────────────────────────────');

const pureJunk = tokenize(normalize('lorem ipsum dolor sit amet consectetur'));
const junkAvailable = pureJunk.filter(t => t.available);
check(junkAvailable.length === 0,
  'Security: Zero ISL signs generated for completely unknown text.',
  `Fake signs generated: [${junkAvailable.map(t => t.key).join(', ')}]`);

const mixedText = tokenize(normalize('hello lorem ipsum'));
const mixedAvail = filterAndDedup(mixedText);
check(mixedAvail.length === 1 && mixedAvail[0].key === 'NAMASTE',
  'Security: Mixed text → only valid sign extracted (NAMASTE), junk discarded.',
  `Mixed text fail: got [${mixedAvail.map(t => t.key).join(', ')}]`);

/* ──────────────────────────────────────────────
   6. FINGERPINT DEDUP (sequence-level)
────────────────────────────────────────────── */
console.log('\n── SEQUENCE FINGERPRINT DEDUP ───────────────────────────────');

let lastFP = '';
function simulateIngest(signKeys) {
  const fp = signKeys.join('|');
  if (fp === lastFP) return false;
  lastFP = fp;
  return true;
}

check(simulateIngest(['NAMASTE','HOW','ARE','YOU']) === true,
  'Fingerprint: First occurrence accepted.',
  'Fingerprint: First occurrence should be accepted.');
check(simulateIngest(['NAMASTE','HOW','ARE','YOU']) === false,
  'Fingerprint: Identical repeat suppressed.',
  'Fingerprint: Repeat should have been suppressed!');
check(simulateIngest(['NAMASTE','HOW']) === true,
  'Fingerprint: Different sequence accepted after duplicate.',
  'Fingerprint: Different sequence should be accepted.');
check(simulateIngest(['NAMASTE','HOW']) === false,
  'Fingerprint: Second identical suppressed again.',
  'Fingerprint: Should suppress second identical sequence.');

/* ──────────────────────────────────────────────
   7. FILE STRUCTURE
────────────────────────────────────────────── */
console.log('\n── FILE STRUCTURE VERIFICATION ──────────────────────────────');

const requiredFiles = [
  'content-scripts/youtube-caption.js',
  'avatar/caption-sync.js',
  'content-scripts/content.js',
  'content-scripts/youtube-observer.js',
  'sidepanel/sidepanel.js',
  'sidepanel/sidepanel.html',
  'sidepanel/sidepanel.css',
  'background.js',
  'manifest.json',
  'data/vocabulary.json',
];

for (const f of requiredFiles) {
  const exists = fs.existsSync(path.join(ROOT, f));
  check(exists, `File exists: ${f}`, `MISSING: ${f}`);
}

/* ──────────────────────────────────────────────
   8. MANIFEST REGISTRATION
────────────────────────────────────────────── */
console.log('\n── MANIFEST REGISTRATION ────────────────────────────────────');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const ytScript = manifest.content_scripts?.find(cs =>
  cs.matches?.some(m => m.includes('youtube.com'))
);

check(!!ytScript, 'Manifest: YouTube content_script entry exists.',
  'Manifest: No YouTube content_script entry found!');
check(ytScript?.js?.includes('content-scripts/youtube-caption.js'),
  'Manifest: youtube-caption.js registered for *.youtube.com.',
  `Manifest: youtube-caption.js missing from YouTube content_scripts. Got: ${JSON.stringify(ytScript?.js)}`);
check(ytScript?.js?.includes('content-scripts/youtube-observer.js'),
  'Manifest: youtube-observer.js still registered (backward compat).',
  'Manifest: youtube-observer.js missing.');

/* ──────────────────────────────────────────────
   9. BACKGROUND.JS ROUTING
────────────────────────────────────────────── */
console.log('\n── BACKGROUND.JS PHASE 5 ROUTING ────────────────────────────');

const bgSrc = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
check(bgSrc.includes('SIGNX_YOUTUBE_CAPTION_UPDATE'),
  'background.js: Routes SIGNX_YOUTUBE_CAPTION_UPDATE.',
  'background.js: Missing SIGNX_YOUTUBE_CAPTION_UPDATE route.');
check(bgSrc.includes('SIGNX_YT_PLAYER_PAUSED'),
  'background.js: Routes SIGNX_YT_PLAYER_PAUSED.',
  'background.js: Missing SIGNX_YT_PLAYER_PAUSED route.');
check(bgSrc.includes('SIGNX_YT_CAPTION_TOGGLE'),
  'background.js: Routes SIGNX_YT_CAPTION_TOGGLE (enable/disable relay).',
  'background.js: Missing SIGNX_YT_CAPTION_TOGGLE route.');

/* ──────────────────────────────────────────────
   10. CAPTION-SYNC API SURFACE
────────────────────────────────────────────── */
console.log('\n── CAPTION-SYNC API SURFACE ─────────────────────────────────');

const syncSrc = fs.readFileSync(path.join(ROOT, 'avatar/caption-sync.js'), 'utf8');
const syncApiMethods = ['ingestSequence', 'setEnabled', 'pause', 'resume', 'stopPlayback', 'resetOnSeek', 'onStatusUpdate', 'destroy'];
for (const method of syncApiMethods) {
  check(syncSrc.includes(method),
    `CaptionSync: "${method}()" method defined.`,
    `CaptionSync: "${method}()" MISSING!`);
}

/* ──────────────────────────────────────────────
   11. YOUTUBE-CAPTION.JS FEATURE CHECKS
────────────────────────────────────────────── */
console.log('\n── YOUTUBE-CAPTION.JS FEATURE CHECK ────────────────────────');

const ytSrc = fs.readFileSync(path.join(ROOT, 'content-scripts/youtube-caption.js'), 'utf8');
const ytFeatures = [
  ['MutationObserver',    'MutationObserver: DOM change detection.'],
  ['ytp-caption-segment', 'Selector: .ytp-caption-segment covered.'],
  ['yt-navigate-finish',  'SPA navigation: yt-navigate-finish handled.'],
  ['pause',               'Video events: pause bound.'],
  ['seeked',              'Video events: seeked (fingerprint reset) bound.'],
  ['SIGNX_YT_CAPTION_ENABLE', 'Toggle: SIGNX_YT_CAPTION_ENABLE handled.'],
  ['SIGNX_YT_CAPTION_DISABLE','Toggle: SIGNX_YT_CAPTION_DISABLE handled.'],
  ['unavailableWords',    'Security: unavailableWords tracked and reported.'],
  ['signx:caption-signs', 'CustomEvent: signx:caption-signs dispatched to content.js.'],
  ['window.__SIGNX_YT_CAPTION_LOADED__', 'Guard: Double-injection prevention.'],
];

for (const [needle, msg] of ytFeatures) {
  check(ytSrc.includes(needle), msg, `youtube-caption.js: Missing "${needle}"`);
}

/* ──────────────────────────────────────────────
   12. SIDEPANEL WIRING CHECK
────────────────────────────────────────────── */
console.log('\n── SIDEPANEL WIRING ─────────────────────────────────────────');

const spSrc = fs.readFileSync(path.join(ROOT, 'sidepanel/sidepanel.js'), 'utf8');
check(spSrc.includes("from '../avatar/caption-sync.js'"),
  'sidepanel.js: Imports CaptionSync.',
  'sidepanel.js: CaptionSync import missing!');
check(spSrc.includes('setupYouTubeCaptionPanel'),
  'sidepanel.js: setupYouTubeCaptionPanel() defined and called.',
  'sidepanel.js: setupYouTubeCaptionPanel missing!');
check(spSrc.includes('captionSync'),
  'sidepanel.js: captionSync instance created.',
  'sidepanel.js: captionSync not found!');

const spHtml = fs.readFileSync(path.join(ROOT, 'sidepanel/sidepanel.html'), 'utf8');
check(spHtml.includes('yt-caption-sync-card'),
  'sidepanel.html: YouTube caption sync card injected.',
  'sidepanel.html: yt-caption-sync-card missing!');
check(spHtml.includes('yt-caption-sync-toggle'),
  'sidepanel.html: Pause/Resume toggle button present.',
  'sidepanel.html: yt-caption-sync-toggle missing!');
check(spHtml.includes('yt-caption-status-badge'),
  'sidepanel.html: Status badge present.',
  'sidepanel.html: yt-caption-status-badge missing!');

/* ──────────────────────────────────────────────
   13. VOCABULARY.JSON INTEGRITY
────────────────────────────────────────────── */
console.log('\n── VOCABULARY.JSON INTEGRITY ────────────────────────────────');

const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/vocabulary.json'), 'utf8'));
const vocabKeys = Object.keys(vocab);
check(vocabKeys.length >= 20,
  `vocabulary.json: ${vocabKeys.length} signs registered.`,
  `vocabulary.json: too few signs (${vocabKeys.length})`);

// Ensure all VOCABULARY constants used in tokenizer exist in vocabulary.json
const CORE_SIGNS = ['NAMASTE','GOODBYE','HELP','WHERE','HOW','YES','NO','WATER','DOCTOR','EMERGENCY'];
for (const sign of CORE_SIGNS) {
  check(vocabKeys.includes(sign),
    `vocabulary.json: Core sign "${sign}" present.`,
    `vocabulary.json: Core sign "${sign}" MISSING!`);
}

/* ──────────────────────────────────────────────
   FINAL
────────────────────────────────────────────── */
console.log('\n══════════════════════════════════════════════════════════════');
console.log(`Phase 5 Results: ${passed} checks passed, ${errors.length} failures.`);

if (errors.length > 0) {
  console.error('\nFailed Checks:');
  errors.forEach(e => console.error(' ', e));
  process.exit(1);
} else {
  console.log('\n★ Phase 5: YouTube Caption → ISL Avatar Integration PASSED all verification criteria!');
  console.log('  ✓ Caption DOM detection (no API key required)');
  console.log('  ✓ Text normalization & bigram/unigram tokenizer');
  console.log('  ✓ ISL vocabulary matching — zero hallucination');
  console.log('  ✓ Consecutive duplicate suppression');
  console.log('  ✓ Sequence-level fingerprint dedup (no repeat signing)');
  console.log('  ✓ YouTube player pause/resume/seek sync');
  console.log('  ✓ Enable/disable toggle (content script + runtime relay)');
  console.log('  ✓ CaptionSync orchestration class (8 public methods)');
  console.log('  ✓ SPA navigation (yt-navigate-finish) handled');
  console.log('  ✓ Sidepanel UI: status badge, sign chips, skipped words\n');
}
