/**
 * SignX - Landmark Normalizer
 * Invariant to:
 * 1. Position in camera frame (Translation Invariance)
 * 2. Distance from camera (Scale Invariance)
 * 3. Hand size differences
 */

export class LandmarkNormalizer {
  /**
   * Normalize a single hand's 21 3D landmarks
   * @param {Array<{x: number, y: number, z?: number}>} rawLandmarks 
   * @returns {Array<{x: number, y: number, z: number}> | null}
   */
  static normalizeHand(rawLandmarks) {
    if (!rawLandmarks || rawLandmarks.length < 21) {
      return null;
    }

    // 1. Translation Invariance: Shift origin to Wrist (Landmark 0)
    const wrist = rawLandmarks[0];
    const centered = rawLandmarks.map(pt => ({
      x: pt.x - wrist.x,
      y: pt.y - wrist.y,
      z: (pt.z || 0) - (wrist.z || 0)
    }));

    // 2. Scale Invariance: Compute Palm Vector (Wrist 0 -> Middle MCP 9)
    const middleMcp = centered[9];
    const palmLength = Math.sqrt(
      middleMcp.x * middleMcp.x +
      middleMcp.y * middleMcp.y +
      middleMcp.z * middleMcp.z
    ) || 1.0;

    // Normalize all coordinates by palmLength
    const normalized = centered.map(pt => ({
      x: pt.x / palmLength,
      y: pt.y / palmLength,
      z: pt.z / palmLength
    }));

    return normalized;
  }

  /**
   * Normalize both left and right hands
   * @param {{ leftHand?: Array, rightHand?: Array }} frame 
   * @returns {{ leftHand: Array|null, rightHand: Array|null, hasHands: boolean }}
   */
  static normalizeFrame(frame) {
    if (!frame) return { leftHand: null, rightHand: null, hasHands: false };

    const left = frame.leftHand ? this.normalizeHand(frame.leftHand) : null;
    const right = frame.rightHand ? this.normalizeHand(frame.rightHand) : null;

    return {
      leftHand: left,
      rightHand: right,
      hasHands: Boolean(left || right)
    };
  }
}
