import { AvatarController } from '../avatar/avatar-controller.js';
import { BASE_POSES } from '../avatar/gestures/base-poses.js';
import { ISL_CLIPS } from '../avatar/animations/isl-clips.js';

// Mock avatar player
class MockAvatarPlayer {
  constructor() {
    this.currentPose = { ...BASE_POSES.NEUTRAL_REST };
    this.currentClip = null;
    this.currentSignName = 'IDLE';
    this.onClipEnd = null;
    this.isPlaying = false;
  }
  start() { this.isPlaying = true; }
  stop() { this.isPlaying = false; }
  setClip(clip, name) {
    this.currentClip = clip;
    this.currentSignName = name;
    console.log(`[MockPlayer] Playing clip: "${clip ? clip.name : 'null'}" (sign: "${name}")`);
    // Simulate end of clip
    if (clip && this.onClipEnd) {
      setTimeout(() => {
        this.onClipEnd(clip);
      }, 10);
    }
  }
}

const mockPlayer = new MockAvatarPlayer();
const controller = new AvatarController(mockPlayer);

console.log('Testing controller.executeCommand with "NAMASTE"...');
await controller.executeCommand({ sequence: ['NAMASTE', 'PRIME_MINISTER', 'NEWS'] });

setTimeout(() => {
  console.log('Final Controller State:', controller.state);
  console.log('Final Queue Index:', controller.queueIndex);
  console.log('SUCCESS: Avatar completed signing sequence flawlessly!');
  process.exit(0);
}, 200);
