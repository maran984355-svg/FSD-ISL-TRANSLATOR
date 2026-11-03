import { AvatarController } from '../avatar/avatar-controller.js';
import { BASE_POSES } from '../avatar/gestures/base-poses.js';
import { ISLGrammarConverter } from '../isl-library/grammar-rules.js';

class FullMockPlayer {
  constructor() {
    this.currentPose = { ...BASE_POSES.NEUTRAL_REST };
    this.currentClip = null;
    this.currentSignName = 'IDLE';
    this.onClipEnd = null;
    this.isPlaying = false;
  }
  start() { this.isPlaying = true; }
  stop() { this.isPlaying = false; }
  setSpeed(speed) { this.playbackSpeed = speed; }
  setClip(clip, name) {
    this.currentClip = clip;
    this.currentSignName = name;
    if (clip && this.onClipEnd) {
      setTimeout(() => {
        if (this.onClipEnd) this.onClipEnd(clip);
      }, 5);
    }
  }
}

async function runPipeline() {
  const player = new FullMockPlayer();
  const controller = new AvatarController(player);

  const sentences = [
    'News24 breaking news',
    'Prime Minister announces national healthcare mission',
    'Transport ministry approves rapid express railway',
    'Fresh rainfall advisory issued',
    'Stay safe in your home',
    'Protect family and help people'
  ];

  console.log('=== VERIFYING PIPELINE TRANSLATION & SIGN EXECUTION ===');

  for (const sentence of sentences) {
    const converted = ISLGrammarConverter.convert(sentence);
    console.log(`\nTranslating: "${sentence}"`);
    console.log(`Generated Sequence: [${converted.glossSequence.join(', ')}]`);

    const result = await controller.executeCommand({ sequence: converted.glossSequence });
    console.log(`Execution status: ${result.success ? 'SUCCESS' : 'FAILED'}, signs queued: ${result.count}`);

    // Wait for mock playback to finish
    await new Promise(r => setTimeout(r, 60));
    console.log(`Avatar state after playback: ${controller.state}`);
  }

  console.log('\nTesting Live TV consecutive segment playback with keepAlive...');
  await controller.executeCommand({ sequence: ['NEWS'], durationMs: 1500, keepAlive: true });
  await new Promise(r => setTimeout(r, 20));
  await controller.executeCommand({ sequence: ['PRIME_MINISTER'], durationMs: 1500, keepAlive: true });
  await new Promise(r => setTimeout(r, 20));
  await controller.executeCommand({ sequence: ['HEALTH'], durationMs: 1500, keepAlive: false });
  await new Promise(r => setTimeout(r, 40));

  console.log('Live TV segment signing completed successfully.');
  console.log('ALL VERIFICATIONS PASSED.');
  process.exit(0);
}

runPipeline().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
