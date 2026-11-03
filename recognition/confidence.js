/**
 * SignX - Confidence Scorer & Margin Calibrator
 * Evaluates candidate DTW distances to output an honest, calibrated confidence percentage.
 */

export class ConfidenceScorer {
  /**
   * Compute confidence percentage for the top candidate
   * @param {number} bestDistance - Lowest DTW distance
   * @param {number} secondDistance - Second lowest DTW distance
   * @param {number} maxAcceptableDistance - Distance above which match is zero confidence (default ~1.8)
   * @returns {{ confidence: number, margin: number, isReliable: boolean }}
   */
  static calculate(bestDistance, secondDistance = Infinity, maxAcceptableDistance = 1.85) {
    if (bestDistance === Infinity || isNaN(bestDistance)) {
      return { confidence: 0, margin: 0, isReliable: false };
    }

    // 1. Distance score (exponential decay: 0 distance -> 1.0; maxAcceptable -> ~0.15)
    const normalizedD = Math.max(0, bestDistance);
    const matchScore = Math.max(0, Math.exp(-normalizedD / 0.85));

    // 2. Margin score (how much better top candidate is than runner-up)
    let marginScore = 1.0;
    let margin = 1.0;
    if (secondDistance !== Infinity && secondDistance > 0) {
      margin = Math.max(0, (secondDistance - bestDistance) / secondDistance);
      marginScore = 0.5 + 0.5 * Math.min(1.0, margin * 2.5);
    }

    // 3. Combined calibrated confidence (0.0 to 1.0)
    let finalConfidence = matchScore * marginScore;

    // Hard cutoff if distance is too large
    if (bestDistance > maxAcceptableDistance) {
      finalConfidence = Math.max(0, finalConfidence * 0.4);
    }

    return {
      confidence: Math.max(0, Math.min(1.0, finalConfidence)),
      percentage: Math.round(Math.max(0, Math.min(100, finalConfidence * 100))),
      margin: Math.round(margin * 100),
      isReliable: finalConfidence >= 0.70 && bestDistance <= maxAcceptableDistance
    };
  }
}
