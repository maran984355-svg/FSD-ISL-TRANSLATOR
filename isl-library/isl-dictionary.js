/**
 * SignX - ISL Dictionary Service
 * Provides word-to-gloss matching, synonym resolution, and fingerspelling fallbacks.
 */

import { logger } from '../utils/logger.js';
import { islVocabulary } from '../avatar/vocabulary/isl-vocabulary.js';

class ISLDictionary {
  constructor() {
    this.glosses = [];
    this.glossMap = new Map();
    this.englishToGlossMap = new Map();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      const url = chrome.runtime?.getURL 
        ? chrome.runtime.getURL('isl-library/isl-glossary.json') 
        : '../isl-library/isl-glossary.json';

      const res = await fetch(url);
      const data = await res.json();
      
      this.glosses = data.glosses || [];
      this.glosses.forEach(item => {
        this.glossMap.set(item.gloss, item);
        
        // Map all english keywords
        if (item.english && Array.isArray(item.english)) {
          item.english.forEach(word => {
            this.englishToGlossMap.set(word.toLowerCase().trim(), item.gloss);
          });
        }
      });

      this.initialized = true;
      logger.info(`ISL Dictionary loaded with ${this.glosses.length} root signs.`);
    } catch (err) {
      logger.error('Failed to load ISL Glossary:', err);
    }
  }

  /**
   * Resolve single word or token to ISL Gloss
   * @param {string} word 
   * @returns {{ gloss: string, isFingerspelled: boolean, item?: object }}
   */
  lookup(word) {
    if (!word) return null;
    const clean = word.toLowerCase().trim();

    // 1. Direct match with english synonym
    if (this.englishToGlossMap.has(clean)) {
      const gloss = this.englishToGlossMap.get(clean);
      return {
        gloss,
        isFingerspelled: false,
        item: this.glossMap.get(gloss)
      };
    }

    // 2. Direct gloss match
    const upper = word.toUpperCase().trim();
    if (this.glossMap.has(upper)) {
      return {
        gloss: upper,
        isFingerspelled: false,
        item: this.glossMap.get(upper)
      };
    }

    // 3. Direct match with expanded ISL vocabulary map
    if (islVocabulary && islVocabulary.vocabMap && islVocabulary.vocabMap.has(clean)) {
      const vocabGloss = islVocabulary.vocabMap.get(clean);
      return {
        gloss: vocabGloss,
        isFingerspelled: vocabGloss.startsWith('ISL_') && vocabGloss.length === 5,
        item: this.glossMap.get(vocabGloss)
      };
    }

    // 3. Fallback: Fingerspelling token
    return {
      gloss: upper,
      isFingerspelled: true,
      letters: upper.split('')
    };
  }

  getAllGlosses() {
    return this.glosses;
  }
}

export const islDictionary = new ISLDictionary();
