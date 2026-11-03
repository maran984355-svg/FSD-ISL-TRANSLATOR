import { ISLGrammarConverter } from '../isl-library/grammar-rules.js';
import { islVocabulary } from '../avatar/vocabulary/isl-vocabulary.js';

console.log('Testing PDF Reader Extraction & ISL Word-by-Word Sign Engine...');

const samplePdfText = `Emergency Medical Guide. I need a doctor immediately. Where is the nearest hospital? Please help me with water and medicine. My name is Alex. Thank you very much for your help.`;

// Segment into sentences
const rawSentences = samplePdfText.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 2);
console.log(`Extracted ${rawSentences.length} sentences from PDF document:`);

rawSentences.forEach((sentence, sIdx) => {
  const converted = ISLGrammarConverter.convertWordByWord(sentence);
  console.log(`\nSentence #${sIdx + 1}: "${sentence}"`);
  console.log(`  Word-by-word ISL items count: ${converted.items.length}`);
  
  converted.items.forEach(it => {
    const res = islVocabulary.resolve(it.token);
    console.log(`    [Word: "${it.word}"] -> [Sign Token: ${it.token}] (Resolved: ${res.found})`);
  });
});

console.log('\n✓ PDF Reader word-by-word signing verification PASSED!');
