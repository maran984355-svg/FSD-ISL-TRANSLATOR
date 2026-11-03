/**
 * SignX - Recognition Controller & Pipeline Orchestrator
 * Connects HandTracker, SequenceBuffer, DTW Classifier, and Template Recorder.
 */

import { HandTracker } from './hand-tracker.js';
import { SequenceBuffer } from './sequence-buffer.js';
import { signClassifier } from './sign-classifier.js';
import { FeatureExtractor } from './feature-extractor.js';
import { sentenceBuilder, SentenceBuilder } from './sentence-builder.js';
import { storageService } from '../services/storage-service.js';
import { logger } from '../utils/logger.js';

export const RECOGNITION_STATE = {
  IDLE: 'IDLE',
  TRACKING: 'TRACKING',
  ANALYZING: 'ANALYZING',
  RECOGNIZED: 'RECOGNIZED',
  UNCERTAIN: 'UNCERTAIN',
  COOLDOWN: 'COOLDOWN',
  RECORDING: 'RECORDING'
};

export class RecognitionController {
  constructor(options = {}) {
    this.tracker = null;
    this.sequenceBuffer = new SequenceBuffer({
      minFrames: options.minFrames || 8,
      maxFrames: options.maxFrames || 35,
      motionThreshold: options.motionThreshold || 0.04,
      stillnessFramesRequired: options.stillnessFramesRequired || 3
    });

    this.state = RECOGNITION_STATE.IDLE;
    this.cooldownMs = options.cooldownMs || 800;
    this.cooldownTimer = null;
    this.lastRecognizedSign = null;
    this.listeners = new Map();

    // Template Recording Mode
    this.isRecording = false;
    this.recordingSignKey = null;
    this.recordedFramesBuffer = [];

    // Bind sequence buffer event
    this.sequenceBuffer.on('sequenceReady', ({ sequence, frameCount }) => {
      this.handleSequenceCaptured(sequence, frameCount);
    });
  }

  async init(canvasElement) {
    logger.info('Initializing RecognitionController...');
    this.tracker = new HandTracker(canvasElement);
    await this.tracker.init();
    await signClassifier.init();

    // Load any user-saved templates from storage
    const customTemplates = await storageService.get('customSignTemplates', {});
    if (customTemplates && Object.keys(customTemplates).length > 0) {
      for (const [signKey, templates] of Object.entries(customTemplates)) {
        templates.forEach(tpl => {
          signClassifier.addTemplate(signKey, tpl.frames, tpl.signer || 'User');
        });
      }
      logger.info(`Loaded ${Object.keys(customTemplates).length} custom template signs.`);
    }

    // Connect tracker to sequence buffer
    this.tracker.on('frame', (frameData) => {
      if (this.isRecording) {
        const { vector } = FeatureExtractor.extractFrameFeatures(frameData);
        this.recordedFramesBuffer.push(vector);
      } else if (this.state !== RECOGNITION_STATE.COOLDOWN) {
        this.sequenceBuffer.pushFrame(frameData);
      }
    });

    this.setState(RECOGNITION_STATE.IDLE);
  }

  /**
   * Process a captured landmark sequence through DTW classifier
   */
  handleSequenceCaptured(sequence, frameCount) {
    if (this.state === RECOGNITION_STATE.COOLDOWN || this.isRecording) return;

    this.setState(RECOGNITION_STATE.ANALYZING);
    logger.info(`Analyzing sequence of ${frameCount} frames...`);

    const result = signClassifier.classify(sequence);

    if (result.recognized) {
      this.setState(RECOGNITION_STATE.RECOGNIZED);
      this.lastRecognizedSign = result.displayText;

      this.emit('recognized', {
        signKey: result.signKey,
        displayText: result.displayText,
        confidence: result.confidence,
        percentage: result.percentage,
        distance: result.distance
      });

      // Enter Cooldown
      this.enterCooldown();
    } else {
      this.setState(RECOGNITION_STATE.UNCERTAIN);
      this.emit('uncertain', {
        error: result.error || 'Unable to confidently recognize sign',
        percentage: result.percentage || 0,
        attemptedSign: result.attemptedSign
      });

      setTimeout(() => {
        if (this.state === RECOGNITION_STATE.UNCERTAIN) {
          this.setState(RECOGNITION_STATE.TRACKING);
        }
      }, 1000);
    }
  }

  enterCooldown() {
    this.setState(RECOGNITION_STATE.COOLDOWN);
    clearTimeout(this.cooldownTimer);
    this.cooldownTimer = setTimeout(() => {
      if (this.state === RECOGNITION_STATE.COOLDOWN) {
        this.setState(RECOGNITION_STATE.TRACKING);
      }
    }, this.cooldownMs);
  }

  /* ================= TEMPLATE RECORDING INTERFACE ================= */
  startTemplateRecording(signKey) {
    this.isRecording = true;
    this.recordingSignKey = signKey.toUpperCase();
    this.recordedFramesBuffer = [];
    this.setState(RECOGNITION_STATE.RECORDING);
    this.emit('recordingStarted', { signKey: this.recordingSignKey });
    logger.info(`Started template recording for "${this.recordingSignKey}"`);
  }

  async stopTemplateRecording(signerLabel = 'User') {
    if (!this.isRecording) return null;

    this.isRecording = false;
    const signKey = this.recordingSignKey;
    const frames = [...this.recordedFramesBuffer];
    this.recordedFramesBuffer = [];
    this.recordingSignKey = null;

    if (frames.length < 8) {
      this.setState(RECOGNITION_STATE.IDLE);
      this.emit('recordingFailed', { reason: 'Recording was too short (under 8 frames)' });
      return { success: false, error: 'Recording too short' };
    }

    // Add to active classifier
    signClassifier.addTemplate(signKey, frames, signerLabel);

    // Persist to storage
    const stored = await storageService.get('customSignTemplates', {});
    if (!stored[signKey]) stored[signKey] = [];
    stored[signKey].push({
      id: `tpl_${Date.now()}`,
      signer: signerLabel,
      frames,
      recordedAt: new Date().toISOString()
    });
    await storageService.set('customSignTemplates', stored);

    this.setState(RECOGNITION_STATE.IDLE);
    this.emit('recordingSaved', { signKey, frameCount: frames.length });
    logger.info(`Template saved for "${signKey}" with ${frames.length} frames.`);
    return { success: true, signKey, frameCount: frames.length };
  }

  setConfidenceThreshold(threshold) {
    signClassifier.confidenceThreshold = Math.max(0.1, Math.min(1.0, threshold));
    logger.info(`Confidence threshold set to ${threshold}`);
  }

  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('stateChange', { state: newState });
    }
  }

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

export const recognitionController = new RecognitionController();
export { sentenceBuilder, SentenceBuilder };
