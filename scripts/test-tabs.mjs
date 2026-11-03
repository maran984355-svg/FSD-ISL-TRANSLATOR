import { ISLGrammarConverter } from '../isl-library/grammar-rules.js';
import { islVocabulary } from '../avatar/vocabulary/isl-vocabulary.js';

const texts = {
  'YouTube Reader': 'YouTube caption: Hello everyone, welcome to the science tutorial!',
  'Live TV': 'Live Broadcast: Emergency assistance is available across the district.',
  'PDF Reader': 'Document extract: Water please. Thank you very much for your help.',
  'Quick: Hello nice to meet you': 'Hello, nice to meet you!',
  'Quick: How are you today?': 'How are you today?',
  'Quick: Thank you very much': 'Thank you very much!',
  'Quick: I love you friend': 'I love you friend',
  'Quick: Please help me': 'Can you please help me?',
  'Quick: Good morning': 'Good morning!',
  'Quick: Emergency': 'Emergency assistance',
  'Quick: Fingerspelling': 'Fingerspelling ABC 123',
  'Custom: Where is train station': 'Where is the train station?',
  'Custom: I need water': 'I need water',
  'Custom: My name is': 'My name is Raj',
  'Custom: Hello friend how are you': 'Hello friend, how are you?',
  'Custom: Goodbye': 'Goodbye everyone',
  'Custom: I need help': 'I need help',
  'Custom: Yes I am a student': 'Yes I am a student',
  'Custom: No thank you': 'No thank you',
  'Custom: Please water': 'Please give me water'
};

let totalGlosses = 0;
let resolvedGlosses = 0;
const failures = [];

for (const [label, text] of Object.entries(texts)) {
  const r = ISLGrammarConverter.convert(text);
  const results = r.glossSequence.map(g => {
    const res = islVocabulary.resolve(g);
    totalGlosses++;
    if (res.found) {
      resolvedGlosses++;
      return '[OK] ' + g;
    } else {
      failures.push({ tab: label, gloss: g, text });
      return '[FAIL] ' + g;
    }
  });
  console.log(`\n[${label}]`);
  console.log(`  Input: "${text}"`);
  console.log(`  Glosses: ${r.glossSequence.join(' -> ')}`);
  console.log(`  ${results.join('  ')}`);
}

console.log('\n========== SUMMARY ==========');
console.log(`Total glosses: ${totalGlosses}`);
console.log(`Resolved: ${resolvedGlosses}`);
console.log(`Failed: ${totalGlosses - resolvedGlosses}`);
if (failures.length > 0) {
  console.log('\nFailing signs:');
  failures.forEach(f => console.log(`  "${f.gloss}" in [${f.tab}]`));
}
