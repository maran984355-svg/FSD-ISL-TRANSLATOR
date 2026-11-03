/**
 * SignX - MediaPipe Bridge & Landmark Visualizer Scaffold
 * Prepares the pipeline for MediaPipe Holistic/Hands landmark extraction and canvas overlay.
 */

import { logger } from '../utils/logger.js';

export class MediaPipeBridge {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement ? canvasElement.getContext('2d') : null;
    this.isTracking = false;
    this.showLandmarks = true;
    this.callbacks = new Map();
  }

  /**
   * Initialize MediaPipe pipeline
   */
  async init() {
    logger.info('MediaPipeBridge initialized and ready for model injection in Phase 2.');
    return true;
  }

  /**
   * Set landmark visibility
   */
  setShowLandmarks(enabled) {
    this.showLandmarks = enabled;
    if (!enabled && this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Draw hand/body landmark coordinates onto preview canvas
   * @param {Array<{x: number, y: number, z?: number}>} landmarks 
   * @param {Array<[number, number]>} connections 
   */
  drawLandmarks(landmarks, connections = []) {
    if (!this.showLandmarks || !this.ctx || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);

    // Draw skeletal connections
    this.ctx.strokeStyle = '#06b6d4';
    this.ctx.lineWidth = 2.5;

    connections.forEach(([startIdx, endIdx]) => {
      const p1 = landmarks[startIdx];
      const p2 = landmarks[endIdx];
      if (p1 && p2) {
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x * width, p1.y * height);
        this.ctx.lineTo(p2.x * width, p2.y * height);
        this.ctx.stroke();
      }
    });

    // Draw joint points
    landmarks.forEach((p, index) => {
      this.ctx.beginPath();
      this.ctx.arc(p.x * width, p.y * height, index === 0 ? 5 : 3.5, 0, 2 * Math.PI);
      this.ctx.fillStyle = index === 0 ? '#10b981' : '#38bdf8';
      this.ctx.fill();
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    });
  }

  /**
   * Dispatch extracted landmarks to gesture pipeline
   */
  dispatchLandmarks(landmarksData) {
    const list = this.callbacks.get('landmarks') || [];
    list.forEach(fn => fn(landmarksData));
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
}
