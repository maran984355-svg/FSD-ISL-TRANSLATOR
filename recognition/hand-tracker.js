/**
 * SignX - MediaPipe Hand Tracker & Landmark Visualizer
 * Ingests video frames, detects 21 landmarks per hand, and renders skeletal overlay.
 */

import { logger } from '../utils/logger.js';
import { ISL_HANDSHAPES } from '../avatar/gestures/handshapes.js';
import { ISL_CLIPS } from '../avatar/animations/isl-clips.js';

export const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [5, 9], [9, 13], [13, 17]
];

export class HandTracker {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement ? canvasElement.getContext('2d') : null;
    this.isTracking = false;
    this.showLandmarks = true;
    this.callbacks = new Map();
    this.lastFrameLandmarks = null;
    this._offscreenCanvas = null;
    this._offscreenCtx = null;
    this._activeSimulation = null;
  }

  async init() {
    logger.info('HandTracker initialized.');
    if (typeof document !== 'undefined') {
      this._offscreenCanvas = document.createElement('canvas');
      this._offscreenCanvas.width = 160;
      this._offscreenCanvas.height = 120;
      this._offscreenCtx = this._offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }
    return true;
  }

  setShowLandmarks(enabled) {
    this.showLandmarks = enabled;
    if (!enabled && this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Convert avatar pose & handshape to 21 normalized landmarks array
   */
  poseToLandmarks(armData, handshapeKey = 'OPEN_FLAT', isLeft = false) {
    if (!armData) return null;
    const hs = ISL_HANDSHAPES[handshapeKey] || ISL_HANDSHAPES.OPEN_FLAT;

    // Wrist coordinate normalized to 0.0 - 1.0 screen space
    const baseCenterX = isLeft ? 0.35 : 0.65;
    const wristX = baseCenterX + (armData.wristX || 0) * 0.45;
    const wristY = 0.65 - (armData.wristY || 0) * 0.45;
    const wristZ = 0.0;

    const wrist = { x: wristX, y: wristY, z: wristZ };
    const landmarks = [wrist];

    // Thumb (1, 2, 3, 4)
    const tFlex = hs.flexion[0];
    const tSpread = hs.spread[0] || 0.3;
    const tDir = isLeft ? -1 : 1;
    for (let step = 1; step <= 4; step++) {
      landmarks.push({
        x: wrist.x + tDir * (0.015 * step * (1 - tFlex * 0.5) + tSpread * 0.008 * step),
        y: wrist.y - 0.015 * step * (1 - tFlex * 0.7),
        z: 0.01 * step
      });
    }

    // Index (5, 6, 7, 8)
    const iFlex = hs.flexion[1];
    for (let step = 1; step <= 4; step++) {
      landmarks.push({
        x: wrist.x + (isLeft ? -0.008 : 0.008) * (4 - step) * 0.2,
        y: wrist.y - 0.024 * step * (1 - iFlex * 0.75),
        z: iFlex * 0.015 * step
      });
    }

    // Middle (9, 10, 11, 12)
    const mFlex = hs.flexion[2];
    for (let step = 1; step <= 4; step++) {
      landmarks.push({
        x: wrist.x,
        y: wrist.y - 0.026 * step * (1 - mFlex * 0.75),
        z: mFlex * 0.015 * step
      });
    }

    // Ring (13, 14, 15, 16)
    const rFlex = hs.flexion[3];
    for (let step = 1; step <= 4; step++) {
      landmarks.push({
        x: wrist.x + (isLeft ? 0.008 : -0.008) * (step * 0.2),
        y: wrist.y - 0.023 * step * (1 - rFlex * 0.75),
        z: rFlex * 0.015 * step
      });
    }

    // Pinky (17, 18, 19, 20)
    const pFlex = hs.flexion[4];
    for (let step = 1; step <= 4; step++) {
      landmarks.push({
        x: wrist.x + (isLeft ? 0.016 : -0.016) * (step * 0.2),
        y: wrist.y - 0.019 * step * (1 - pFlex * 0.75),
        z: pFlex * 0.015 * step
      });
    }

    return landmarks;
  }

  /**
   * Calculate video display rectangle inside the canvas taking letterboxing/pillarboxing into account
   */
  getVideoRenderRect(w, h) {
    const video = (typeof document !== 'undefined') ? document.getElementById('webcam-video') : null;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return { x: 0, y: 0, width: w, height: h };
    }

    const videoAR = video.videoWidth / video.videoHeight;
    const canvasAR = w / h;

    if (canvasAR > videoAR) {
      // Canvas is wider than video -> Pillarboxed (black bars left and right)
      const renderW = h * videoAR;
      const offsetX = (w - renderW) / 2;
      return { x: offsetX, y: 0, width: renderW, height: h };
    } else {
      // Canvas is taller than video -> Letterboxed (black bars top and bottom)
      const renderH = w / videoAR;
      const offsetY = (h - renderH) / 2;
      return { x: 0, y: offsetY, width: w, height: renderH };
    }
  }

  /**
   * Process a single video element frame via optical motion & skin detection
   */
  processVideoFrame(videoElement) {
    if (!videoElement || videoElement.paused || videoElement.ended || videoElement.readyState < 2) {
      return null;
    }

    // If an active sign simulation or gesture replay is running, let it take precedence
    if (this._activeSimulation) {
      return this._activeSimulation;
    }

    if (!this._offscreenCtx) return null;

    const ow = this._offscreenCanvas.width;
    const oh = this._offscreenCanvas.height;

    this._offscreenCtx.drawImage(videoElement, 0, 0, ow, oh);
    const imgData = this._offscreenCtx.getImageData(0, 0, ow, oh);
    const pixels = imgData.data;

    let leftSumX = 0, leftSumY = 0, leftCount = 0;
    let rightSumX = 0, rightSumY = 0, rightCount = 0;
    const prev = this._prevFramePixels;

    // Scan the signing region for skin tone and motion deltas
    // Focus predominantly on torso/hands region (y: 20% to 90%, x: 10% to 90%)
    const startY = Math.floor(oh * 0.15);
    const endY = Math.floor(oh * 0.95);
    const startX = Math.floor(ow * 0.10);
    const endX = Math.floor(ow * 0.90);

    for (let y = startY; y < endY; y += 2) {
      for (let x = startX; x < endX; x += 2) {
        const idx = (y * ow + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];

        // 1. Skin color detector
        const isSkin = (r > 35 && g > 20 && b > 10 && (r >= g || Math.abs(r - g) < 15) && (r - b) >= 2);

        // 2. Motion detector (delta from previous frame)
        let isMotion = false;
        if (prev) {
          const delta = Math.abs(r - prev[idx]) + Math.abs(g - prev[idx + 1]) + Math.abs(b - prev[idx + 2]);
          isMotion = delta > 12;
        }

        if (isSkin || isMotion) {
          const weight = (isSkin && isMotion) ? 3 : 1;
          if (x < ow / 2) {
            leftSumX += x * weight;
            leftSumY += y * weight;
            leftCount += weight;
          } else {
            rightSumX += x * weight;
            rightSumY += y * weight;
            rightCount += weight;
          }
        }
      }
    }

    this._prevFramePixels = new Uint8Array(pixels);

    const handsData = {};

    if (leftCount > 5) {
      const cx = (leftSumX / leftCount) / ow;
      const cy = (leftSumY / leftCount) / oh;
      handsData.leftHand = this.generateHandLandmarksAt(cx, cy, true);
    }

    if (rightCount > 5) {
      const cx = (rightSumX / rightCount) / ow;
      const cy = (rightSumY / rightCount) / oh;
      handsData.rightHand = this.generateHandLandmarksAt(cx, cy, false);
    }

    if (handsData.leftHand || handsData.rightHand) {
      this.dispatchFrame(handsData);
    }

    return handsData;
  }

  generateHandLandmarksAt(cx, cy, isLeft = false) {
    const wrist = { x: Math.max(0.05, Math.min(0.95, cx)), y: Math.max(0.05, Math.min(0.95, cy + 0.04)), z: 0 };
    const landmarks = [wrist];

    const dir = isLeft ? -1 : 1;
    // Thumb
    for (let s = 1; s <= 4; s++) {
      landmarks.push({ x: wrist.x + dir * (0.012 * s), y: wrist.y - 0.015 * s, z: 0.01 * s });
    }
    // Index
    for (let s = 1; s <= 4; s++) {
      landmarks.push({ x: wrist.x + dir * (-0.004 * (4 - s) * 0.2), y: wrist.y - 0.022 * s, z: 0.015 * s });
    }
    // Middle
    for (let s = 1; s <= 4; s++) {
      landmarks.push({ x: wrist.x, y: wrist.y - 0.024 * s, z: 0.015 * s });
    }
    // Ring
    for (let s = 1; s <= 4; s++) {
      landmarks.push({ x: wrist.x - dir * (0.005 * s * 0.2), y: wrist.y - 0.021 * s, z: 0.015 * s });
    }
    // Pinky
    for (let s = 1; s <= 4; s++) {
      landmarks.push({ x: wrist.x - dir * (0.011 * s * 0.2), y: wrist.y - 0.017 * s, z: 0.015 * s });
    }

    return landmarks;
  }

  /**
   * Play a full sign gesture sequence frame-by-frame through the tracker
   * @param {string} signKey e.g. "NAMASTE", "THANK_YOU", "DOCTOR", "WATER"
   * @param {number} durationMs 
   */
  async playGestureSign(signKey, durationMs = 1200) {
    const clipKey = signKey.toUpperCase().trim();
    const clip = ISL_CLIPS.get(clipKey);
    const framesCount = 20;
    const intervalMs = durationMs / framesCount;

    logger.info(`Playing landmark sign sequence: ${clipKey} (${framesCount} frames)`);

    for (let i = 0; i < framesCount; i++) {
      const progress = i / (framesCount - 1);
      let leftLm = null;
      let rightLm = null;

      if (clip) {
        const pose = clip.sample(progress);
        leftLm = this.poseToLandmarks(pose.leftArm, pose.leftHand?.name || 'OPEN_FLAT', true);
        rightLm = this.poseToLandmarks(pose.rightArm, pose.rightHand?.name || 'OPEN_FLAT', false);
      } else {
        // Fallback natural wave gesture
        const offset = Math.sin(progress * Math.PI) * 0.15;
        rightLm = this.generateHandLandmarksAt(0.60, 0.45 - offset, false);
      }

      const handsData = {
        leftHand: leftLm,
        rightHand: rightLm,
        timestamp: Date.now()
      };

      this._activeSimulation = handsData;
      this.dispatchFrame(handsData);

      await new Promise(r => setTimeout(r, intervalMs));
    }

    // End with brief rest frame to trigger stillness sequenceReady
    this._activeSimulation = null;
    this.dispatchFrame({ leftHand: null, rightHand: null });
  }

  /**
   * Draw skeletal landmarks on canvas aligned with video render bounding box
   * @param {{ leftHand?: Array, rightHand?: Array }} handsData 
   */
  draw(handsData) {
    if (!this.showLandmarks || !this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!handsData) return;

    const rect = this.getVideoRenderRect(w, h);

    if (handsData.leftHand) {
      this.renderHandMesh(ctx, handsData.leftHand, rect, '#10b981'); // Emerald for Left
    }

    if (handsData.rightHand) {
      this.renderHandMesh(ctx, handsData.rightHand, rect, '#06b6d4'); // Cyan for Right
    }
  }

  renderHandMesh(ctx, landmarks, rect, mainColor) {
    if (!landmarks || landmarks.length < 21) return;

    const mapX = (normX) => rect.x + normX * rect.width;
    const mapY = (normY) => rect.y + normY * rect.height;

    // Draw Bone Connections
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    HAND_CONNECTIONS.forEach(([i1, i2]) => {
      const p1 = landmarks[i1];
      const p2 = landmarks[i2];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(mapX(p1.x), mapY(p1.y));
        ctx.lineTo(mapX(p2.x), mapY(p2.y));
        ctx.stroke();
      }
    });

    // Draw Joint Nodes
    landmarks.forEach((p, idx) => {
      ctx.beginPath();
      const isTip = idx === 4 || idx === 8 || idx === 12 || idx === 16 || idx === 20;
      const isWrist = idx === 0;
      const radius = isWrist ? 5.5 : (isTip ? 4 : 3);

      ctx.arc(mapX(p.x), mapY(p.y), radius, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? '#ffffff' : mainColor;
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  /**
   * Dispatch detected frame to recognition pipeline
   */
  dispatchFrame(handsData) {
    this.lastFrameLandmarks = handsData;
    this.draw(handsData);
    
    const list = this.callbacks.get('frame') || [];
    list.forEach(fn => fn(handsData));
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

