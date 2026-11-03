/**
 * SignX - Hand Feature Extractor
 * Converts normalized 3D landmarks into a compact mathematical feature vector.
 */

import { LandmarkNormalizer } from './normalizer.js';

export class FeatureExtractor {
  /**
   * Extract high-dimensional feature vector for a single hand
   * @param {Array<{x: number, y: number, z: number}>} normHand 
   * @returns {number[]} 1D feature array
   */
  static extractHandFeatures(normHand) {
    if (!normHand || normHand.length < 21) {
      return new Array(45).fill(0); // Zero vector if hand absent
    }

    const features = [];

    // 1. Normalized (x, y, z) relative coordinates (63 values)
    normHand.forEach(pt => {
      features.push(pt.x, pt.y, pt.z);
    });

    // 2. Fingertip-to-Wrist distances (Tips: 4, 8, 12, 16, 20)
    const tipIndices = [4, 8, 12, 16, 20];
    tipIndices.forEach(idx => {
      const tip = normHand[idx];
      const dist = Math.sqrt(tip.x * tip.x + tip.y * tip.y + tip.z * tip.z);
      features.push(dist);
    });

    // 3. Inter-Fingertip distances (Pairwise finger spreads: 4-8, 8-12, 12-16, 16-20, 4-20)
    const pairs = [[4, 8], [8, 12], [12, 16], [16, 20], [4, 20]];
    pairs.forEach(([i1, i2]) => {
      const p1 = normHand[i1];
      const p2 = normHand[i2];
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dz = p1.z - p2.z;
      features.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
    });

    // 4. Palm orientation normal (Cross product: Wrist->IndexMCP x Wrist->PinkyMCP)
    const v1 = normHand[5];  // Index MCP
    const v2 = normHand[17]; // Pinky MCP
    const nx = v1.y * v2.z - v1.z * v2.y;
    const ny = v1.z * v2.x - v1.x * v2.z;
    const nz = v1.x * v2.y - v1.y * v2.x;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
    features.push(nx / nLen, ny / nLen, nz / nLen);

    return features;
  }

  /**
   * Extract combined features for both hands from raw frame
   * @param {{ leftHand?: Array, rightHand?: Array }} rawFrame 
   * @returns {{ vector: number[], hasLeft: boolean, hasRight: boolean }}
   */
  static extractFrameFeatures(rawFrame) {
    const norm = LandmarkNormalizer.normalizeFrame(rawFrame);
    const leftFeatures = this.extractHandFeatures(norm.leftHand);
    const rightFeatures = this.extractHandFeatures(norm.rightHand);

    return {
      vector: [...leftFeatures, ...rightFeatures],
      hasLeft: Boolean(norm.leftHand),
      hasRight: Boolean(norm.rightHand)
    };
  }

  /**
   * Compute Euclidean motion energy between two consecutive feature frames
   */
  static computeMotionEnergy(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let sumSq = 0;
    for (let i = 0; i < vecA.length; i++) {
      const diff = vecA[i] - vecB[i];
      sumSq += diff * diff;
    }
    return Math.sqrt(sumSq);
  }
}
