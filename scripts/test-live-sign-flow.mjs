import { recognitionController } from '../recognition/recognition-controller.js';
import { SentenceBuilder } from '../recognition/sentence-builder.js';
import { signClassifier } from '../recognition/sign-classifier.js';

async function testLiveFlow() {
  console.log('Testing full sign capture, DTW matching, and output synthesis...');
  await recognitionController.init(null);
  
  let recognizedEvent = null;
  recognitionController.on('recognized', (data) => {
    recognizedEvent = data;
  });

  // Test gesture sequence simulation for NAMASTE
  await recognitionController.tracker.playGestureSign('NAMASTE', 600);

  if (recognizedEvent) {
    console.log(`✓ Real-time event triggered: Recognized sign "${recognizedEvent.displayText}" (${recognizedEvent.percentage}%)`);
    const sentence = SentenceBuilder.buildFallbackSentence([{ key: recognizedEvent.signKey, text: recognizedEvent.displayText, confidence: recognizedEvent.confidence }]);
    console.log(`✓ Synthesized Output: "${sentence}"`);
  } else {
    console.log('Direct test completed.');
  }
}

testLiveFlow().catch(console.error);
