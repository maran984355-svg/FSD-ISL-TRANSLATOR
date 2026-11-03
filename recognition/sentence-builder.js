/**
 * SignX - Sentence Builder & Deterministic Fallback Synthesizer
 * Accumulates recognized sign tokens, filters temporal duplicates, detects pause intervals,
 * and provides a 100% deterministic offline ISL-to-English grammar synthesizer.
 */

export class SentenceBuilder {
  constructor(options = {}) {
    this.tokens = [];
    this.lastTokenTimestamp = 0;
    this.duplicateCooldownMs = options.duplicateCooldownMs || 1500;
    this.pauseThresholdMs = options.pauseThresholdMs || 2500;
    this.pauseTimer = null;
    this.listeners = new Map();
    this.autoCommitOnPause = options.autoCommitOnPause !== undefined ? options.autoCommitOnPause : true;
  }

  /**
   * Add a recognized sign token to the sentence buffer
   * @param {string} signKey - e.g. "NAMASTE", "TRAIN_STATION"
   * @param {string} displayText - e.g. "Namaste", "Train Station"
   * @param {number} confidence - 0.0 to 1.0
   * @returns {boolean} Whether token was accepted (or filtered as duplicate)
   */
  addToken(signKey, displayText, confidence = 1.0) {
    const now = Date.now();
    const cleanKey = (signKey || '').toUpperCase().trim();
    const cleanText = displayText || cleanKey.replace(/_/g, ' ');

    if (!cleanKey) return false;

    // Check duplicate cooldown for identical consecutive sign
    const last = this.tokens[this.tokens.length - 1];
    if (last && last.key === cleanKey && (now - this.lastTokenTimestamp) < this.duplicateCooldownMs) {
      // Update confidence of existing token if higher
      if (confidence > last.confidence) {
        last.confidence = confidence;
      }
      return false;
    }

    const tokenObj = {
      key: cleanKey,
      text: cleanText,
      confidence,
      timestamp: now
    };

    this.tokens.push(tokenObj);
    this.lastTokenTimestamp = now;

    this.emit('tokenAdded', {
      token: tokenObj,
      tokens: this.getTokens(),
      rawSequence: this.getTokenKeys()
    });

    // Reset pause timer
    this.resetPauseTimer();

    return true;
  }

  /**
   * Remove last added token
   */
  removeLastToken() {
    if (this.tokens.length === 0) return null;
    const removed = this.tokens.pop();
    this.emit('tokenRemoved', {
      removed,
      tokens: this.getTokens(),
      rawSequence: this.getTokenKeys()
    });
    return removed;
  }

  /**
   * Clear all accumulated tokens
   */
  clear() {
    this.tokens = [];
    clearTimeout(this.pauseTimer);
    this.emit('tokensCleared', { tokens: [] });
  }

  /**
   * Get all accumulated token objects
   */
  getTokens() {
    return [...this.tokens];
  }

  /**
   * Get array of uppercase token keys
   */
  getTokenKeys() {
    return this.tokens.map(t => t.key);
  }

  /**
   * Get formatted display string of tokens
   */
  getRawString() {
    return this.tokens.map(t => t.text).join(' ');
  }

  /**
   * Reset the pause detection timer
   */
  resetPauseTimer() {
    clearTimeout(this.pauseTimer);
    if (!this.autoCommitOnPause) return;

    this.pauseTimer = setTimeout(() => {
      if (this.tokens.length > 0) {
        this.emit('sentenceReady', {
          tokens: this.getTokens(),
          keys: this.getTokenKeys(),
          rawText: this.getRawString()
        });
      }
    }, this.pauseThresholdMs);
  }

  /**
   * 100% Deterministic Rule-Based ISL to English Fallback Synthesizer
   * Used when Ollama Cloud or backend is offline. NEVER hallucinates or invents facts.
   * @param {string[]|object[]} tokensInput 
   * @returns {string} Natural, grammatical English sentence
   */
  static buildFallbackSentence(tokensInput) {
    if (!tokensInput || tokensInput.length === 0) return '';

    const keys = Array.isArray(tokensInput)
      ? tokensInput.map(t => (typeof t === 'string' ? t.toUpperCase() : (t.key || t.text || '').toUpperCase()))
      : [];

    if (keys.length === 0) return '';

    // Direct Exact Phrase Dictionary
    const exactPhrases = {
      'NAMASTE': 'Hello, Namaste!',
      'GOODBYE': 'Goodbye!',
      'GOOD_MORNING': 'Good morning!',
      'THANK_YOU': 'Thank you.',
      'WELCOME': 'You are welcome.',
      'PLEASE': 'Please.',
      'YES': 'Yes.',
      'NO': 'No.',
      'HELP': 'Help is needed.',
      'MY_NAME': 'My name is...'
    };

    const keyJoin = keys.join(' ');

    if (exactPhrases[keyJoin]) {
      return exactPhrases[keyJoin];
    }

    // Common 2-3 sign idioms in ISL
    const idiomaticPatterns = [
      { match: ['HELLO', 'HOW', 'ARE', 'YOU'], text: 'Hello, how are you?' },
      { match: ['NAMASTE', 'HOW', 'ARE', 'YOU'], text: 'Namaste, how are you?' },
      { match: ['HOW', 'ARE', 'YOU'], text: 'How are you?' },
      { match: ['HOW', 'YOU'], text: 'How are you?' },
      { match: ['TRAIN_STATION', 'WHERE'], text: 'Where is the train station?' },
      { match: ['DOCTOR', 'WHERE'], text: 'Where is the doctor?' },
      { match: ['HOSPITAL', 'WHERE'], text: 'Where is the hospital?' },
      { match: ['SCHOOL', 'WHERE'], text: 'Where is the school?' },
      { match: ['WATER', 'WHERE'], text: 'Where can I find water?' },
      { match: ['FOOD', 'WHERE'], text: 'Where is food available?' },
      { match: ['DOCTOR', 'EMERGENCY'], text: 'I need a doctor for an emergency.' },
      { match: ['HELP', 'EMERGENCY'], text: 'Emergency, please help!' },
      { match: ['HELP', 'PLEASE'], text: 'Please help me.' },
      { match: ['WATER', 'PLEASE'], text: 'Please give water.' },
      { match: ['FOOD', 'PLEASE'], text: 'Please give food.' },
      { match: ['THANK_YOU', 'HELP'], text: 'Thank you for your help.' },
      { match: ['NAME', 'WHAT'], text: 'What is your name?' },
      { match: ['MY_NAME', 'WHAT'], text: 'What is your name?' },
      { match: ['ME', 'WATER', 'DRINK'], text: 'I want to drink water.' },
      { match: ['ME', 'FOOD', 'EAT'], text: 'I want to eat food.' },
      { match: ['ME', 'HELP', 'WANT'], text: 'I need help.' },
      { match: ['ME', 'SCHOOL', 'GO'], text: 'I am going to school.' },
      { match: ['ME', 'HOSPITAL', 'GO'], text: 'I am going to the hospital.' }
    ];

    for (const pattern of idiomaticPatterns) {
      if (pattern.match.length === keys.length && pattern.match.every((k, i) => k === keys[i])) {
        return pattern.text;
      }
    }

    // Rule-based heuristic transformation (ISL SOV/Question-final to English SVO)
    const questionWords = {
      'WHERE': 'Where is',
      'WHAT': 'What is',
      'WHO': 'Who is',
      'WHY': 'Why',
      'HOW': 'How',
      'WHEN': 'When is'
    };

    const lastToken = keys[keys.length - 1];
    const isQuestionFinal = Boolean(questionWords[lastToken]);

    if (isQuestionFinal && keys.length > 1) {
      const qPrefix = questionWords[lastToken];
      const subjectTokens = keys.slice(0, -1).map(k => SentenceBuilder.formatWord(k)).join(' ');
      return `${qPrefix} the ${subjectTokens}?`;
    }

    // If all tokens are single letters / LETTER_X, join as a spelled word or letter
    const isAllLetters = keys.every(k => k.length === 1 || k.startsWith('LETTER_'));
    if (isAllLetters) {
      const letters = keys.map(k => k.startsWith('LETTER_') ? k.slice(7) : k).join('');
      if (letters.length === 1) {
        return `Letter ${letters.toUpperCase()}.`;
      }
      return `${letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase()}.`;
    }

    // Format words naturally
    const words = keys.map(k => SentenceBuilder.formatWord(k));
    let sentence = words.join(' ');
    
    // Capitalize first letter and add period
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    if (!/[.!?]$/.test(sentence)) {
      sentence += '.';
    }

    return sentence;
  }

  /**
   * Helper to format raw token keys into human-readable words
   */
  static formatWord(key) {
    if (key.startsWith('LETTER_')) {
      return key.slice(7).toUpperCase();
    }

    if (key.length === 1 && /[A-Z]/.test(key)) {
      return `letter ${key}`;
    }

    const special = {
      'NAMASTE': 'namaste',
      'THANK_YOU': 'thank you',
      'GOOD_MORNING': 'good morning',
      'TRAIN_STATION': 'train station',
      'MY_NAME': 'my name',
      'ME': 'I'
    };

    if (special[key]) return special[key];
    return key.toLowerCase().replace(/_/g, ' ');
  }

  /* ================= EVENT SYSTEM ================= */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => {
      const arr = this.listeners.get(event).filter(fn => fn !== callback);
      this.listeners.set(event, arr);
    };
  }

  emit(event, data) {
    const list = this.listeners.get(event) || [];
    list.forEach(fn => fn(data));
  }
}

export const sentenceBuilder = new SentenceBuilder();
