/**
 * SignX - Gesture Recognition Pipeline & DTW Stub Interface
 * Coordinates landmark buffers, temporal windowing, and gesture matching.
 * 
 * NOTE FOR PHASE 2 INTEGRATION:
 * This pipeline exposes `processLandmarkFrame()`, `loadISLTemplates()`, and `computeDTWDistance()`.
 * In Phase 1, it maintains state, buffers landmark history, and triggers recognition events when models are active.
 */

import { logger } from '../utils/logger.js';

export const RECOGNITION_STATUS = {
  IDLE: 'IDLE',
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  TRACKING: 'TRACKING',
  RECOGNIZING: 'RECOGNIZING',
  PAUSED: 'PAUSED',
  ERROR: 'ERROR'
};

export class GestureRecognitionPipeline {
  constructor() {
    this.status = RECOGNITION_STATUS.IDLE;
    this.bufferSize = 45; // ~1.5s window at 30fps
    this.landmarkBuffer = [];
    this.templates = new Map();
    this.confidenceThreshold = 0.70;
    this.listeners = new Map();
    this.isProcessing = false;
  }

  /**
   * Set pipeline status and notify listeners
   */
  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      logger.info(`Gesture pipeline status: ${newStatus}`);
      this.emit('statusChange', { status: newStatus });
    }
  }

  /**
   * Ingest landmark frame from MediaPipe
   * @param {object} frameData - { timestamp, leftHand, rightHand, pose }
   */
  processLandmarkFrame(frameData) {
    if (this.status !== RECOGNITION_STATUS.TRACKING && this.status !== RECOGNITION_STATUS.RECOGNIZING) {
      return;
    }

    this.landmarkBuffer.push({
      timestamp: frameData.timestamp || Date.now(),
      landmarks: frameData
    });

    if (this.landmarkBuffer.length > this.bufferSize) {
      this.landmarkBuffer.shift();
    }

    // Phase 2 DTW Integration Point
    // When enough frames are collected, calculate sequence distance against registered ISL templates
  }

  /**
   * Dynamic Time Warping distance computation stub
   * @param {Array} sequenceA 
   * @param {Array} sequenceB 
   * @returns {number} distance
   */
  computeDTWDistance(sequenceA, sequenceB) {
    // Dynamic programming matrix stub for Phase 2
    if (!sequenceA.length || !sequenceB.length) return Infinity;
    return 0.0;
  }

  /**
   * Clear frame buffer
   */
  resetBuffer() {
    this.landmarkBuffer = [];
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
    const arr = this.listeners.get(event) || [];
    arr.forEach(fn => fn(data));
  }
}

export const gesturePipeline = new GestureRecognitionPipeline();
