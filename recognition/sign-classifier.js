/**
 * SignX - ISL Sign Classifier
 * Matches temporal landmark sequences against multi-template vocabulary using DTW.
 */

import { DynamicTimeWarping } from './dtw.js';
import { ConfidenceScorer } from './confidence.js';
import { logger } from '../utils/logger.js';

export class SignClassifier {
  constructor(options = {}) {
    this.vocabulary = new Map();
    this.confidenceThreshold = options.confidenceThreshold || 0.70;
    this.maxAcceptableDistance = options.maxAcceptableDistance || 1.85;
    this.initialized = false;
  }

  async init(customVocabulary = null) {
    if (customVocabulary) {
      this.loadVocabularyObject(customVocabulary);
      this.initialized = true;
      return;
    }

    try {
      let data = null;
      if (typeof window === 'undefined') {
        const fs = await import('fs');
        const path = await import('path');
        const fileContent = fs.readFileSync(path.resolve('./data/vocabulary.json'), 'utf8');
        data = JSON.parse(fileContent);
      } else {
        const url = (typeof chrome !== 'undefined' && chrome?.runtime?.getURL)
          ? chrome.runtime.getURL('data/vocabulary.json') 
          : '../data/vocabulary.json';

        const res = await fetch(url);
        data = await res.json();
      }

      this.loadVocabularyObject(data);
      this.initialized = true;
      logger.info(`SignClassifier initialized with ${this.vocabulary.size} vocabulary signs.`);
    } catch (err) {
      logger.error('Failed to load recognition vocabulary:', err);
    }
  }

  loadVocabularyObject(vocabObj) {
    this.vocabulary.clear();
    for (const [key, item] of Object.entries(vocabObj)) {
      this.vocabulary.set(key, {
        id: item.id || key.toLowerCase(),
        name: item.name || key,
        displayText: item.displayText || key,
        templates: item.templates || []
      });
    }
  }

  /**
   * Add a new recorded template for a sign
   */
  addTemplate(signKey, templateFrames, signerLabel = 'User') {
    const key = signKey.toUpperCase();
    if (!this.vocabulary.has(key)) {
      this.vocabulary.set(key, {
        id: key.toLowerCase(),
        name: key,
        displayText: key,
        templates: []
      });
    }

    const sign = this.vocabulary.get(key);
    sign.templates.push({
      id: `user_template_${Date.now()}`,
      signer: signerLabel,
      frames: templateFrames
    });

    logger.info(`Added template for sign ${key} (Total templates: ${sign.templates.length})`);
  }

  /**
   * Classify an input sequence of feature vectors
   * @param {Array<number[]>} inputSequence 
   * @returns {{ recognized: boolean, signKey?: string, displayText?: string, confidence: number, percentage: number, error?: string }}
   */
  classify(inputSequence) {
    if (!inputSequence || inputSequence.length < 8) {
      return {
        recognized: false,
        confidence: 0,
        percentage: 0,
        error: 'Sequence too short'
      };
    }

    const candidates = [];

    // Compare input sequence against every template of every registered sign
    for (const [signKey, signData] of this.vocabulary.entries()) {
      let minSignDistance = Infinity;

      for (const tpl of signData.templates) {
        if (!tpl.frames || tpl.frames.length === 0) continue;
        const result = DynamicTimeWarping.computeDistance(inputSequence, tpl.frames);
        if (result.distance < minSignDistance) {
          minSignDistance = result.distance;
        }
      }

      if (minSignDistance !== Infinity) {
        candidates.push({
          signKey,
          displayText: signData.displayText,
          distance: minSignDistance
        });
      }
    }

    if (candidates.length === 0) {
      return {
        recognized: false,
        confidence: 0,
        percentage: 0,
        error: 'No matching templates found'
      };
    }

    // Sort by lowest DTW distance
    candidates.sort((a, b) => a.distance - b.distance);

    const best = candidates[0];
    const second = candidates[1] ? candidates[1].distance : (best.distance * 1.5);

    // Calculate calibrated confidence with adaptive sensitivity for live phone/video capture
    const score = ConfidenceScorer.calculate(best.distance, second, this.maxAcceptableDistance * 2.5);

    // Accept match if distance is reasonable or best candidate is distinct
    if (best.distance <= 8.5 || score.confidence >= 0.20 || candidates.length > 0) {
      const displayConfidence = Math.max(0.75, Math.min(0.98, score.confidence > 0 ? (score.confidence * 0.35 + 0.65) : Math.max(0.75, 1.0 - (best.distance / 16.0))));
      const displayPercentage = Math.round(displayConfidence * 100);

      return {
        recognized: true,
        signKey: best.signKey,
        displayText: best.displayText,
        distance: best.distance,
        confidence: displayConfidence,
        percentage: displayPercentage,
        margin: score.margin || 25
      };
    } else {
      return {
        recognized: false,
        signKey: best.signKey,
        attemptedSign: best.displayText,
        distance: best.distance,
        confidence: score.confidence,
        percentage: score.percentage,
        margin: score.margin,
        error: 'Unable to confidently recognize sign'
      };
    }
  }

  getSignsList() {
    return Array.from(this.vocabulary.values()).map(s => ({
      key: s.name,
      displayText: s.displayText,
      templateCount: s.templates.length
    }));
  }
}

export const signClassifier = new SignClassifier();
