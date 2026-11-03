import fs from 'fs';
import { islVocabulary } from '../avatar/vocabulary/isl-vocabulary.js';
import { ISL_CLIPS } from '../avatar/animations/isl-clips.js';

const html = fs.readFileSync('index.html', 'utf8');

console.log('1. Button Checks:');
console.log(' - Has news24 button:', html.includes('data-channel="news24"'));
console.log(' - Has ndtv button:', html.includes('data-channel="ndtv"'));
console.log(' - Has bbc button:', html.includes('data-channel="bbc"'));
console.log(' - Has youtubeId km-iUPTYFvk:', html.includes('km-iUPTYFvk'));
console.log(' - Has isYouTube handler:', html.includes('channel.isYouTube'));
console.log(' - Has iframe player:', html.includes('id="livetv-iframe-player"'));
console.log(' - Default channel is news24:', html.includes("currentLiveTvChannelKey = 'news24'"));

console.log('\n2. Sign Resolution Checks for News24:');
const news24Signs = [
  'EMERGENCY', 'WORK', 'DOCTOR', 'EVERYONE',
  'TRAIN_STATION', 'FRIEND', 'HAPPY',
  'POLICY', 'TECHNOLOGY', 'SCHOOL', 'TODAY',
  'WATER', 'HELP', 'HOME', 'POLICE',
  'SPORTS', 'WIN', 'CELEBRATE', 'NAMASTE'
];

let allValid = true;
for (const s of news24Signs) {
  const res = islVocabulary.resolve(s);
  const inClips = ISL_CLIPS.has(s);
  if (!res.found || res.isFingerspelled || !inClips) {
    console.log(`❌ Sign failed: ${s}`, res);
    allValid = false;
  }
}
console.log(' - All 19 News24 Signs Valid & Non-Fingerspelled:', allValid);

if (!allValid) {
  process.exit(1);
} else {
  console.log('\n✨ All News24 verifications passed successfully!');
}
