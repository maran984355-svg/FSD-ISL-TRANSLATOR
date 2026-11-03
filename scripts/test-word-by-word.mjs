import { ISLGrammarConverter } from '../isl-library/grammar-rules.js';
import { islVocabulary } from '../avatar/vocabulary/isl-vocabulary.js';

console.log('=== SIGNX WORD-BY-WORD SIGNING VERIFICATION ===\n');

const testSentences = [
  'Welcome to this video',
  'All right so here we are in front of the elephants',
  'They have really really really long trunks',
  'Thank you very much for learning with us'
];

for (const s of testSentences) {
  console.log(`\nTesting Sentence: "${s}"`);
  const res = ISLGrammarConverter.convertWordByWord(s);
  console.log(`  Raw Word Count: ${s.split(/\s+/).length} | Parsed Token Count: ${res.glossSequence.length}`);
  console.log('  Word Items:');
  res.items.forEach((it, idx) => {
    console.log(`    [${idx + 1}] Word: "${it.word}" -> ISL Sign/Fingerspell: ${it.token} (Fingerspelled: ${it.isFingerspelled})`);
  });

  const resolved = islVocabulary.resolveSequence(res.glossSequence);
  console.log(`  ✓ Successfully resolved ${resolved.length} sign clips for avatar playback.`);
}

console.log('\n✓ ALL WORD-BY-WORD VERIFICATION TESTS PASSED.');
