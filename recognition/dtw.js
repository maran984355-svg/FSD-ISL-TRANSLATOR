/**
 * SignX - Dynamic Time Warping (DTW) Engine
 * Implements constrained DTW with Sakoe-Chiba windowing and path normalization.
 */

export class DynamicTimeWarping {
  /**
   * Compute normalized DTW distance between two feature sequences
   * @param {Array<number[]>} seqA - Sequence A (frames of feature vectors)
   * @param {Array<number[]>} seqB - Sequence B (frames of feature vectors)
   * @param {number} windowRatio - Sakoe-Chiba band width ratio (default 0.25)
   * @returns {{ distance: number, pathLength: number, matrix?: number[][] }}
   */
  static computeDistance(seqA, seqB, windowRatio = 0.3) {
    if (!seqA || !seqB || seqA.length === 0 || seqB.length === 0) {
      return { distance: Infinity, pathLength: 0 };
    }

    const n = seqA.length;
    const m = seqB.length;
    const w = Math.max(Math.abs(n - m), Math.floor(Math.max(n, m) * windowRatio));

    // Allocate cost matrix initialized to Infinity
    const dtw = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
    dtw[0][0] = 0;

    for (let i = 1; i <= n; i++) {
      const jStart = Math.max(1, i - w);
      const jEnd = Math.min(m, i + w);

      for (let j = jStart; j <= jEnd; j++) {
        const cost = this.frameDistance(seqA[i - 1], seqB[j - 1]);
        dtw[i][j] = cost + Math.min(
          dtw[i - 1][j],     // Insertion
          dtw[i][j - 1],     // Deletion
          dtw[i - 1][j - 1]  // Match
        );
      }
    }

    const totalDistance = dtw[n][m];
    if (totalDistance === Infinity) {
      return { distance: Infinity, pathLength: n + m };
    }

    // Path length normalized distance
    const normalizedDistance = totalDistance / (n + m);
    return {
      distance: normalizedDistance,
      rawDistance: totalDistance,
      pathLength: n + m
    };
  }

  /**
   * Euclidean distance between two 1D feature vectors
   */
  static frameDistance(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 100.0;
    
    let sum = 0;
    const len = vec1.length;
    for (let k = 0; k < len; k++) {
      const d = vec1[k] - vec2[k];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }
}
