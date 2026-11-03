import { ISLGrammarConverter } from '../isl-library/grammar-rules.js';
import { islVocabulary } from '../avatar/vocabulary/isl-vocabulary.js';
import { ISL_CLIPS } from '../avatar/animations/isl-clips.js';

const testSentences = [
  'News24 breaking news',
  'Prime Minister of India',
  'Prime Minister announces national healthcare mission',
  'Transport ministry approves rapid express railway',
  'Fresh rainfall advisory issued',
  'Stay safe in your home',
  'Protect family and help people',
  'Good morning everyone',
  'I understand the news',
  'Where is the hospital',
  'We need food and water',
  'Doctors help sick people in city',
  'India celebrate victory in sports',
  'High speed railway connects major cities'
];

console.log('=== SENTENCE TRANSLATION & SIGN RESOLUTION ===');
let totalResolved = 0;
let totalTokens = 0;

for (const sent of testSentences) {
  const converted = ISLGrammarConverter.convert(sent);
  const resolved = converted.glossSequence.map(token => {
    totalTokens++;
    const res = islVocabulary.resolve(token);
    if (res.found && !res.isFingerspelled) totalResolved++;
    return `${token}${res.found ? (res.isFingerspelled ? ' [FS]' : ' (clip: ' + res.clipId + ')') : ' [NOT FOUND]'}`;
  });
  console.log(`Input: "${sent}"`);
  console.log(`  ISL Glosses: ${converted.glossSequence.join(' ')}`);
  console.log(`  Clips: ${resolved.join(' | ')}\n`);
}

console.log(`Total Tokens: ${totalTokens}, Direct Verified Clips: ${totalResolved} (${((totalResolved/totalTokens)*100).toFixed(1)}%)`);
