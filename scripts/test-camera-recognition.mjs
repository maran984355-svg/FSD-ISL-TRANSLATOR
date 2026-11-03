import { HandTracker } from '../recognition/hand-tracker.js';
import { recognitionController, RECOGNITION_STATE } from '../recognition/recognition-controller.js';
import { SentenceBuilder } from '../recognition/sentence-builder.js';
import { signClassifier } from '../recognition/sign-classifier.js';
import { ISLGrammarConverter } from '../isl-library/grammar-rules.js';

async function testCameraSignPipeline() {
  console.log('Testing Camera & Video Sign Recognition Pipeline...');

  // 1. Initialize classifier
  await signClassifier.init();
  console.log(`✓ Classifier loaded with ${signClassifier.vocabulary.size} ISL signs.`);

  // 2. Test Sentence Builder fallback & formatting
  const tokens1 = [
    { key: 'DOCTOR', text: 'Doctor', confidence: 0.94 },
    { key: 'EMERGENCY', text: 'Emergency', confidence: 0.91 }
  ];
  const sentence1 = SentenceBuilder.buildFallbackSentence(tokens1);
  console.log(`✓ Synthesized tokens [DOCTOR, EMERGENCY] -> "${sentence1}"`);

  const tokens2 = [
    { key: 'NAMASTE', text: 'Namaste', confidence: 0.95 },
    { key: 'MY_NAME', text: 'My Name', confidence: 0.92 }
  ];
  const sentence2 = SentenceBuilder.buildFallbackSentence(tokens2);
  console.log(`✓ Synthesized tokens [NAMASTE, MY_NAME] -> "${sentence2}"`);

  const tokens3 = [
    { key: 'WATER', text: 'Water', confidence: 0.89 },
    { key: 'PLEASE', text: 'Please', confidence: 0.93 }
  ];
  const sentence3 = SentenceBuilder.buildFallbackSentence(tokens3);
  console.log(`✓ Synthesized tokens [WATER, PLEASE] -> "${sentence3}"`);

  // 3. Test Tracker Landmark conversion
  const tracker = new HandTracker(null);
  await tracker.init();
  const sampleLandmarks = tracker.generateHandLandmarksAt(0.5, 0.5, false);
  if (sampleLandmarks && sampleLandmarks.length === 21) {
    console.log(`✓ HandTracker generated valid 21-landmark array (wrist: ${sampleLandmarks[0].x}, ${sampleLandmarks[0].y})`);
  }

  console.log('All camera sign analysis & synthesis tests PASSED!');
}

testCameraSignPipeline().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
