/**
 * SignX - Temporal Sequence Buffer & Motion Boundary Detector
 * Collects continuous normalized landmark frames, gates out noise, and triggers sign recognition windows.
 */

import { FeatureExtractor } from './feature-extractor.js';

export class SequenceBuffer {
  constructor(options = {}) {
    this.minFrames = options.minFrames || 5;
    this.maxFrames = options.maxFrames || 35;
    this.motionThreshold = options.motionThreshold || 0.025;
    this.stillnessFramesRequired = options.stillnessFramesRequired || 3;

    this.rawFrames = [];
    this.featureSequence = [];
    this.isCapturingSign = false;
    this.stillFrameCount = 0;
    this.lastFeatureVector = null;
    this.callbacks = new Map();
  }

  /**
   * Ingest a single raw frame from MediaPipe / Optical Tracker
   * @param {{ leftHand?: Array, rightHand?: Array, timestamp?: number }} frameData 
   */
  pushFrame(frameData) {
    if (!frameData) return;

    const { vector, hasLeft, hasRight } = FeatureExtractor.extractFrameFeatures(frameData);

    // If neither hand is detected in the frame
    if (!hasLeft && !hasRight) {
      if (this.isCapturingSign && this.featureSequence.length >= this.minFrames) {
        this.emitSignSequence();
      }
      this.reset();
      return;
    }

    // Compute motion delta
    const motionEnergy = this.lastFeatureVector 
      ? FeatureExtractor.computeMotionEnergy(vector, this.lastFeatureVector)
      : 0;

    this.lastFeatureVector = vector;

    // Detect Sign Beginning or Continuous Sign Stream
    if (!this.isCapturingSign) {
      this.isCapturingSign = true;
      this.featureSequence = [vector];
      this.rawFrames = [frameData];
      this.stillFrameCount = 0;
      this.emit('signStarted');
    } else {
      // Actively capturing
      this.featureSequence.push(vector);
      this.rawFrames.push(frameData);

      // Check if signer has paused or completed gesture
      if (motionEnergy < this.motionThreshold * 0.9) {
        this.stillFrameCount++;
      } else {
        this.stillFrameCount = 0;
      }

      // End of sign condition 1: Brief stillness after active movement
      if (this.stillFrameCount >= this.stillnessFramesRequired && this.featureSequence.length >= this.minFrames) {
        this.emitSignSequence();
        this.reset();
      }
      // End of sign condition 2: Max window reached (emit and keep moving)
      else if (this.featureSequence.length >= this.maxFrames) {
        this.emitSignSequence();
        this.reset();
      }
    }
  }

  emitSignSequence() {
    if (this.featureSequence.length >= this.minFrames) {
      const sequence = [...this.featureSequence];
      const raw = [...this.rawFrames];
      this.emit('sequenceReady', { sequence, rawFrames: raw, frameCount: sequence.length });
    }
  }

  reset() {
    this.isCapturingSign = false;
    this.featureSequence = [];
    this.rawFrames = [];
    this.stillFrameCount = 0;
  }

  on(event, callback) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event).push(callback);
    return () => {
      const arr = this.callbacks.get(event).filter(fn => fn !== callback);
      this.callbacks.set(event, arr);
    };
  }

  emit(event, data) {
    const list = this.callbacks.get(event) || [];
    list.forEach(fn => fn(data));
  }
}
