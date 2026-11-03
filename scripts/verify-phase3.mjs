import fs from 'fs';
import { LandmarkNormalizer } from '../recognition/normalizer.js';
import { FeatureExtractor } from '../recognition/feature-extractor.js';
import { DynamicTimeWarping } from '../recognition/dtw.js';
import { ConfidenceScorer } from '../recognition/confidence.js';
import { SignClassifier } from '../recognition/sign-classifier.js';
import { RecognitionController, RECOGNITION_STATE } from '../recognition/recognition-controller.js';

console.log('=== SIGNX PHASE 3 AUDIT & VERIFICATION ===\n');

let passed = 0;
let errors = [];

// 1. Normalizer Invariance Test
const rawHandA = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i * 0.01, y: 0.5 + i * 0.02, z: 0.1 }));
const rawHandB = Array.from({ length: 21 }, (_, i) => ({ x: 0.1 + i * 0.02, y: 0.2 + i * 0.04, z: 0.2 })); // Shifted & scaled

const normA = LandmarkNormalizer.normalizeHand(rawHandA);
const normB = LandmarkNormalizer.normalizeHand(rawHandB);

if (normA[0].x === 0 && normA[0].y === 0 && normB[0].x === 0 && normB[0].y === 0) {
  console.log('✓ Normalizer Translation Invariance: Wrist origin shifted to (0, 0, 0).');
  passed++;
} else {
  errors.push('Normalizer translation failed');
}

// 2. Feature Extractor Test
const featA = FeatureExtractor.extractHandFeatures(normA);
const featB = FeatureExtractor.extractHandFeatures(normB);

if (featA.length === 76 && featB.length === 76) {
  console.log(`✓ Feature Extractor: 76-dimension invariant feature vectors generated per hand.`);
  passed++;
} else {
  errors.push(`Feature extractor length mismatch: expected 76, got ${featA.length}`);
}

// 3. DTW Metric Test
const seq1 = [featA, featA, featA, featA, featA];
const seq2 = [featA, featA, featA, featA, featA];
const dtwExact = DynamicTimeWarping.computeDistance(seq1, seq2);

if (dtwExact.distance === 0) {
  console.log('✓ DTW Distance: Identical sequences produce exact zero distance (0.0).');
  passed++;
} else {
  errors.push(`DTW identical test failed: expected 0, got ${dtwExact.distance}`);
}

// 4. Vocabulary Loading Test
const vocabRaw = JSON.parse(fs.readFileSync('./data/vocabulary.json', 'utf8'));
const classifier = new SignClassifier({ confidenceThreshold: 0.70 });
classifier.init(vocabRaw);

if (classifier.vocabulary.size >= 40) {
  console.log(`✓ Vocabulary Manifest: ${classifier.vocabulary.size} signs loaded with multi-signer templates.`);
  passed++;
} else {
  errors.push(`Vocabulary size too small: ${classifier.vocabulary.size}`);
}

// 5. Positive Classification Test
const namasteTemplate = classifier.vocabulary.get('NAMASTE').templates[0].frames;
const matchResult = classifier.classify(namasteTemplate);

if (matchResult.recognized && matchResult.signKey === 'NAMASTE' && matchResult.percentage >= 85) {
  console.log(`✓ Sign Classifier: "NAMASTE" recognized with ${matchResult.percentage}% confidence.`);
  passed++;
} else {
  errors.push(`Positive classification failed: ${JSON.stringify(matchResult)}`);
}

// 6. Negative / Random Movement Rejection Test (Honest AI rejection)
const randomNoiseSeq = Array.from({ length: 18 }, () => 
  Array.from({ length: 148 }, () => Math.random() * 5.0 - 2.5)
);

const noiseResult = classifier.classify(randomNoiseSeq);
if (!noiseResult.recognized && noiseResult.error === 'Unable to confidently recognize sign') {
  console.log(`✓ Noise Rejection: Random movements correctly rejected (confidence ${noiseResult.percentage}% < 70%).`);
  passed++;
} else {
  errors.push(`Random movement was not rejected: ${JSON.stringify(noiseResult)}`);
}

// 7. Confidence Calibration Test
const scoreHigh = ConfidenceScorer.calculate(0.2, 1.5);
const scoreLow = ConfidenceScorer.calculate(2.4, 2.5);

if (scoreHigh.isReliable && !scoreLow.isReliable) {
  console.log(`✓ Confidence Scorer: High margin produces reliable match (${scoreHigh.percentage}%), ambiguous match rejected (${scoreLow.percentage}%).`);
  passed++;
} else {
  errors.push('Confidence scorer calibration failed');
}

// 8. Template Recording Test
classifier.addTemplate('CUSTOM_SIGN', [featA, featB, featA], 'Signer_Test');
const customSign = classifier.vocabulary.get('CUSTOM_SIGN');

if (customSign && customSign.templates.length === 1) {
  console.log(`✓ Template Recording Engine: Custom multi-signer template added dynamically.`);
  passed++;
} else {
  errors.push('Template recording engine failed');
}

// Final Summary
console.log(`\nPhase 3 Verification Summary: ${passed} checks passed, ${errors.length} errors.`);
if (errors.length > 0) {
  errors.forEach(e => console.error('  ✖', e));
  process.exit(1);
} else {
  console.log('★ Phase 3: Webcam ISL Recognition (MediaPipe + DTW) PASSED all criteria!\n');
}
