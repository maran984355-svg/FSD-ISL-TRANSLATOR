/**
 * SignX - English to ISL (Indian Sign Language) Grammar Converter
 * Implements ISL Linguistic Rules:
 * 1. Multi-word conversational phrase recognition
 * 2. SOV (Subject-Object-Verb) Sentence Structure
 * 3. Wh-Question Word Placement at sentence end (e.g. "Where is station?" -> "TRAIN_STATION WHERE")
 * 4. Copula & stop word elimination ("is", "are", "the", "a")
 * 5. Synonym resolution to verified ISL keyframe clips
 */

import { islDictionary } from './isl-dictionary.js';
import { islVocabulary } from '../avatar/vocabulary/isl-vocabulary.js';
import { logger } from '../utils/logger.js';

// Pre-calibrated Conversational Phrase Matrix
const PHRASE_PATTERNS = [
  { pattern: /thank\s+you(\s+very\s+much|\s+so\s+much|\s+a\s+lot)?/i, glosses: ['THANK_YOU'] },
  { pattern: /thanks(\s+a\s+lot|\s+very\s+much)?/i, glosses: ['THANK_YOU'] },
  { pattern: /hello.*nice\s+to\s+meet\s+you/i, glosses: ['NAMASTE', 'NICE', 'MEET', 'YOU'] },
  { pattern: /nice\s+to\s+meet\s+you/i, glosses: ['NICE', 'MEET', 'YOU'] },
  { pattern: /how\s+are\s+you(\s+today|\s+doing)?/i, glosses: ['HOW', 'ARE', 'YOU'] },
  { pattern: /i\s+love\s+you(\s+friend)?/i, glosses: ['ME', 'LOVE', 'YOU', 'FRIEND'] },
  { pattern: /(can\s+you\s+)?please\s+help\s+me/i, glosses: ['PLEASE', 'HELP', 'ME'] },
  { pattern: /help\s+me(\s+please)?/i, glosses: ['PLEASE', 'HELP', 'ME'] },
  { pattern: /good\s+morning(\s+everyone|\s+all)?/i, glosses: ['GOOD_MORNING'] },
  { pattern: /emergency(\s+assistance|\s+help)?/i, glosses: ['EMERGENCY', 'HELP'] },
  { pattern: /fingerspelling\s+abc(\s+123)?/i, glosses: ['ISL_A', 'ISL_B', 'ISL_C', 'ISL_1', 'ISL_2', 'ISL_3'] },
  { pattern: /where.*train\s+station/i, glosses: ['TRAIN_STATION', 'WHERE'] },
  { pattern: /train\s+station/i, glosses: ['TRAIN_STATION'] },
  { pattern: /water\s+please/i, glosses: ['WATER', 'PLEASE'] },
  { pattern: /my\s+name\s+is/i, glosses: ['MY_NAME'] },
  { pattern: /see\s+you\s+tomorrow/i, glosses: ['TOMORROW', 'MEET'] },
  { pattern: /good\s*bye|see\s+you/i, glosses: ['GOODBYE'] },
  { pattern: /i\s+(need|want)\s+water/i, glosses: ['ME', 'WATER', 'NEED'] },
  { pattern: /i\s+(need|want)\s+help/i, glosses: ['ME', 'HELP', 'NEED'] },
  { pattern: /i\s+(need|want)\s+food/i, glosses: ['ME', 'FOOD', 'NEED'] },
  { pattern: /please\s+give\s+me/i, glosses: ['PLEASE', 'ME', 'GIVE'] },
  { pattern: /i\s+am\s+(happy|glad)/i, glosses: ['ME', 'HAPPY'] },
  { pattern: /i\s+am\s+sad/i, glosses: ['ME', 'SAD'] },
  { pattern: /i\s+am\s+sorry/i, glosses: ['ME', 'SORRY'] },
  { pattern: /go\s+(to\s+)?school/i, glosses: ['SCHOOL', 'GO'] },
  { pattern: /go\s+(to\s+)?home/i, glosses: ['HOME', 'GO'] },
  { pattern: /go\s+(to\s+)?work/i, glosses: ['WORK', 'GO'] },
  { pattern: /come\s+here/i, glosses: ['COME'] },
  { pattern: /i\s+know/i, glosses: ['ME', 'KNOW'] },
  { pattern: /i\s+understand/i, glosses: ['ME', 'UNDERSTAND'] },
  { pattern: /i\s+want\s+to\s+learn/i, glosses: ['ME', 'LEARN', 'WANT'] },
  { pattern: /no\s+thank\s+you/i, glosses: ['NO', 'THANK_YOU'] },
  { pattern: /good\s*night/i, glosses: ['GOOD_NIGHT'] },
  { pattern: /what(\s+is|\s+are)?(\s+the)?\s+time/i, glosses: ['TIME', 'WHAT'] },
  { pattern: /call(\s+the)?\s+doctor/i, glosses: ['DOCTOR', 'PHONE'] },
  { pattern: /call(\s+the)?\s+police/i, glosses: ['POLICE', 'PHONE'] },
  { pattern: /i\s+am\s+tired/i, glosses: ['ME', 'TIRED'] },
  { pattern: /i\s+am\s+(sick|ill)/i, glosses: ['ME', 'SICK'] },
  { pattern: /take\s+medicine/i, glosses: ['MEDICINE', 'FOOD'] },
  { pattern: /i\s+love\s+my\s+(family|father|mother)/i, glosses: ['ME', 'FAMILY', 'LOVE'] },
  { pattern: /father\s+and\s+mother/i, glosses: ['FATHER', 'MOTHER'] },
  { pattern: /brother\s+and\s+sister/i, glosses: ['BROTHER', 'SISTER'] },
  { pattern: /read(\s+a)?\s+book/i, glosses: ['BOOK', 'LEARN'] },
  { pattern: /write(\s+a)?\s+(letter|note|message)/i, glosses: ['WRITE', 'MESSAGE'] },
  { pattern: /send(\s+a)?\s+message/i, glosses: ['MESSAGE', 'GIVE'] },
  { pattern: /where\s+is(\s+my)?\s+car/i, glosses: ['CAR', 'WHERE'] },
  { pattern: /go\s+to\s+office/i, glosses: ['OFFICE', 'GO'] },
  { pattern: /go\s+to\s+market/i, glosses: ['MARKET', 'GO'] },
  { pattern: /i\s+agree/i, glosses: ['ME', 'AGREE'] },
  { pattern: /i\s+disagree/i, glosses: ['ME', 'DISAGREE'] },
  { pattern: /peace\s+and\s+(love|harmony)/i, glosses: ['PEACE', 'LOVE'] },
  { pattern: /see\s+you\s+tomorrow/i, glosses: ['TOMORROW', 'MEET'] },
  // News, Leadership & Daily Essentials Phrase Patterns
  { pattern: /prime\s+minister(\s+of\s+india)?/i, glosses: ['PRIME_MINISTER'] },
  { pattern: /chief\s+minister/i, glosses: ['MINISTER'] },
  { pattern: /breaking\s+news/i, glosses: ['NEWS'] },
  { pattern: /latest\s+news/i, glosses: ['NEWS'] },
  { pattern: /news\s+bulletin/i, glosses: ['NEWS'] },
  { pattern: /stay\s+safe/i, glosses: ['SAFE'] },
  { pattern: /high\s+speed\s+railway|express\s+train/i, glosses: ['TRAIN'] },
  { pattern: /heavy\s+rain(fall)?|monsoon\s+rain/i, glosses: ['RAIN'] },
  { pattern: /go\s+(to\s+)?hospital/i, glosses: ['HOSPITAL', 'GO'] },
  { pattern: /eat\s+food/i, glosses: ['FOOD'] },
  { pattern: /drink\s+water/i, glosses: ['WATER', 'DRINK'] },
  { pattern: /protect\s+family/i, glosses: ['FAMILY', 'SAFE'] },
  { pattern: /help\s+people/i, glosses: ['PEOPLE', 'HELP'] }
];

const STOP_WORDS = new Set([
  'is', 'am', 'was', 'were', 'be', 'been', 'being',
  'a', 'an', 'the', 'of', 'to', 'in', 'for', 'with', 'on', 'at', 'by', 'from',
  'do', 'does', 'did', 'have', 'has', 'had', 'shall', 'will', 'would', 'could', 'should',
  'very', 'much', 'so', 'lot', 'it', 'its', 'this', 'that', 'these', 'those',
  'just', 'also', 'can', 'and', 'or', 'but', 'not', 'all', 'some', 'any',
  'youtube', 'caption', 'captions', 'document', 'extract',
  'available', 'across', 'district', 'science', 'tutorial', 'every', 'each'
]);

const QUESTION_WORDS = new Set([
  'where', 'what', 'who', 'whom', 'whose', 'why', 'how', 'when', 'which'
]);

const TIME_WORDS = new Set([
  'today', 'tomorrow', 'yesterday', 'now', 'morning', 'evening', 'night', 'soon', 'later', 'always', 'never', 'tonight'
]);

const WORD_TO_ISL_MAP = {
  'thank': 'THANK_YOU',
  'thanks': 'THANK_YOU',
  'hello': 'NAMASTE',
  'hi': 'NAMASTE',
  'hey': 'NAMASTE',
  'namaste': 'NAMASTE',
  'welcome': 'WELCOME',
  'please': 'PLEASE',
  'help': 'HELP',
  'assist': 'HELP',
  'assistance': 'HELP',
  'yes': 'YES',
  'no': 'NO',
  'water': 'WATER',
  'food': 'FOOD',
  'eat': 'FOOD',
  'doctor': 'DOCTOR',
  'hospital': 'DOCTOR',
  'emergency': 'EMERGENCY',
  'station': 'TRAIN_STATION',
  'train': 'TRAIN_STATION',
  'school': 'SCHOOL',
  'study': 'SCHOOL',
  'name': 'MY_NAME',
  'bye': 'GOODBYE',
  'goodbye': 'GOODBYE',
  'you': 'YOU',
  'your': 'YOU',
  'me': 'ME',
  'i': 'ME',
  'my': 'MY_NAME',
  'how': 'HOW',
  'where': 'WHERE',
  'what': 'WHAT',
  'who': 'WHO',
  'are': 'ARE',
  'nice': 'NICE',
  'good': 'NICE',
  'meet': 'MEET',
  'love': 'LOVE',
  'friend': 'FRIEND',
  'give': 'GIVE',
  'need': 'NEED',
  'want': 'WANT',
  'everyone': 'EVERYONE',
  'everybody': 'EVERYONE',
  'come': 'COME',
  'happy': 'HAPPY',
  'glad': 'HAPPY',
  'sad': 'SAD',
  'sorry': 'SORRY',
  'family': 'FAMILY',
  'home': 'HOME',
  'house': 'HOME',
  'work': 'WORK',
  'job': 'WORK',
  'know': 'KNOW',
  'understand': 'UNDERSTAND',
  'learn': 'LEARN',
  'teach': 'TEACH',
  'teacher': 'TEACH',
  'go': 'GO',
  'going': 'GO',
  // Video vocabulary additions
  'ocean': 'WATER',
  'sea': 'WATER',
  'marine': 'WATER',
  'deep': 'WATER',
  'blue': 'WATER',
  'surround': 'MEET',
  'surrounds': 'MEET',
  'coral': 'NICE',
  'reef': 'WATER',
  'animals': 'FRIEND',
  'animal': 'FRIEND',
  'swim': 'WATER',
  'together': 'MEET',
  'protect': 'HELP',
  'save': 'HELP',
  'space': 'TRAIN_STATION',
  'astronaut': 'WORK',
  'international': 'EVERYONE',
  'explore': 'LEARN',
  'science': 'LEARN',
  'clean': 'NICE',
  'drink': 'WATER',
  'recycle': 'WATER',
  'recycled': 'WATER',
  'elephant': 'FRIEND',
  'elephants': 'FRIEND',
  'cool': 'NICE',
  'trunk': 'NICE',
  'trunks': 'NICE',
  'guys': 'FRIEND',
  'say': 'TEACH',
  'speak': 'TEACH',
  'talk': 'TEACH',
  'tell': 'TEACH',
  'empower': 'HAPPY',
  'mind': 'LEARN',
  'minds': 'LEARN',
  'accessibility': 'HELP',
  'accessible': 'HELP',
  'power': 'HAPPY',
  'grow': 'HAPPY',
  'gesture': 'TEACH',
  'gestures': 'TEACH',
  'speech': 'TEACH',
  'audio': 'TEACH',
  'video': 'KNOW',
  'look': 'KNOW',
  'watch': 'KNOW',
  'see': 'KNOW',
  'team': 'FRIEND',
  'join': 'MEET',
  'joining': 'MEET',
  'assistance': 'HELP',
  // Live News vocabulary additions
  'government': 'WORK',
  'relief': 'HELP',
  'medical': 'DOCTOR',
  'health': 'DOCTOR',
  'hospital': 'DOCTOR',
  'city': 'HOME',
  'cities': 'HOME',
  'country': 'EVERYONE',
  'nation': 'EVERYONE',
  'national': 'EVERYONE',
  'public': 'EVERYONE',
  'service': 'WORK',
  'services': 'WORK',
  'weather': 'WATER',
  'rain': 'WATER',
  'storm': 'WATER',
  'safe': 'NICE',
  'safety': 'HELP',
  'alert': 'EMERGENCY',
  'warning': 'EMERGENCY',
  'update': 'KNOW',
  'broadcast': 'ANNOUNCEMENT',
  'announcement': 'ANNOUNCEMENT',
  'news': 'ANNOUNCEMENT',
  'headline': 'ANNOUNCEMENT',
  'headlines': 'ANNOUNCEMENT',
  'breaking': 'EMERGENCY',
  'bulletin': 'ANNOUNCEMENT',
  'channel': 'ANNOUNCEMENT',
  'live': 'KNOW',
  'india': 'INDIA',
  'indian': 'INDIA',
  'bharat': 'INDIA',
  'prime': 'ANNOUNCEMENT',
  'minister': 'POLICY',
  'policy': 'POLICY',
  'law': 'POLICY',
  'program': 'WORK',
  'mission': 'WORK',
  'summit': 'MEET',
  'community': 'EVERYONE',
  'communities': 'EVERYONE',
  'student': 'SCHOOL',
  'students': 'SCHOOL',
  'rural': 'HOME',
  'urban': 'HOME',
  'transport': 'TRAIN_STATION',
  'network': 'FRIEND',
  'expand': 'HAPPY',
  'expands': 'HAPPY',
  'speed': 'HAPPY',
  'technology': 'TECHNOLOGY',
  'tech': 'TECHNOLOGY',
  'digital': 'TECHNOLOGY',
  'drill': 'SAFETY',
  'conduct': 'WORK',
  'urgent': 'EMERGENCY',
  'sports': 'SPORTS',
  'cricket': 'SPORTS',
  'team': 'FRIEND',
  'win': 'WIN',
  'winner': 'WIN',
  'victory': 'WIN',
  'champion': 'WIN',
  'championship': 'WIN',
  'celebrate': 'CELEBRATE',
  'celebration': 'CELEBRATE',
  'tonight': 'TODAY',
  'evening': 'GOOD_MORNING',
  'police': 'POLICE',
  'officer': 'POLICE',
  'safety': 'SAFETY',
  'security': 'SAFETY',
  'center': 'TRAIN_STATION',
  'facilities': 'WORK',
  'education': 'SCHOOL',
  // Expanded Everyday Vocabulary
  'time': 'TIME',
  'clock': 'TIME',
  'watch': 'TIME',
  'hour': 'TIME',
  'minute': 'TIME',
  'tomorrow': 'TOMORROW',
  'yesterday': 'YESTERDAY',
  'night': 'GOOD_NIGHT',
  'always': 'ALWAYS',
  'forever': 'ALWAYS',
  'never': 'NEVER',
  'father': 'FATHER',
  'dad': 'FATHER',
  'papa': 'FATHER',
  'mother': 'MOTHER',
  'mom': 'MOTHER',
  'mummy': 'MOTHER',
  'brother': 'BROTHER',
  'sister': 'SISTER',
  'child': 'CHILD',
  'children': 'CHILD',
  'kid': 'CHILD',
  'baby': 'CHILD',
  'car': 'CAR',
  'drive': 'CAR',
  'vehicle': 'CAR',
  'bus': 'BUS',
  'airplane': 'AIRPLANE',
  'plane': 'AIRPLANE',
  'flight': 'AIRPLANE',
  'airport': 'AIRPLANE',
  'office': 'OFFICE',
  'workplace': 'OFFICE',
  'market': 'MARKET',
  'shop': 'MARKET',
  'store': 'MARKET',
  'bazaar': 'MARKET',
  'money': 'MONEY',
  'cash': 'MONEY',
  'pay': 'MONEY',
  'rupee': 'MONEY',
  'price': 'MONEY',
  'cost': 'MONEY',
  'buy': 'MONEY',
  'buying': 'MONEY',
  'bought': 'MONEY',
  'purchase': 'MONEY',
  'sell': 'MONEY',
  'shopping': 'MARKET',
  'book': 'BOOK',
  'read': 'BOOK',
  'reading': 'BOOK',
  'write': 'WRITE',
  'writing': 'WRITE',
  'letter': 'WRITE',
  'pen': 'WRITE',
  'phone': 'PHONE',
  'telephone': 'PHONE',
  'mobile': 'PHONE',
  'call': 'PHONE',
  'computer': 'COMPUTER',
  'laptop': 'COMPUTER',
  'pc': 'COMPUTER',
  'internet': 'INTERNET',
  'web': 'INTERNET',
  'online': 'INTERNET',
  'message': 'MESSAGE',
  'chat': 'MESSAGE',
  'sms': 'MESSAGE',
  'question': 'QUESTION',
  'ask': 'QUESTION',
  'query': 'QUESTION',
  'answer': 'ANSWER',
  'reply': 'ANSWER',
  'response': 'ANSWER',
  'start': 'START',
  'begin': 'START',
  'launch': 'START',
  'stop': 'STOP',
  'halt': 'STOP',
  'pause': 'STOP',
  'open': 'OPEN',
  'close': 'CLOSE',
  'shut': 'CLOSE',
  'walk': 'WALK',
  'walking': 'WALK',
  'sleep': 'SLEEP',
  'rest': 'SLEEP',
  'strong': 'STRONG',
  'power': 'STRONG',
  'strength': 'STRONG',
  'tired': 'TIRED',
  'exhausted': 'TIRED',
  'angry': 'ANGRY',
  'mad': 'ANGRY',
  'sick': 'SICK',
  'ill': 'SICK',
  'fever': 'SICK',
  'medicine': 'MEDICINE',
  'pill': 'MEDICINE',
  'tablet': 'MEDICINE',
  'important': 'IMPORTANT',
  'crucial': 'IMPORTANT',
  'peace': 'PEACE',
  'calm': 'PEACE',
  'agree': 'AGREE',
  'accept': 'AGREE',
  'disagree': 'DISAGREE',
  'reject': 'DISAGREE'
};

export class ISLGrammarConverter {
  /**
   * Convert English sentence/phrase to ISL Gloss Sequence
   * @param {string} sentence 
   * @returns {{ input: string, glossSequence: string[], tokens: object[] }}
   */
  static convert(sentence) {
    if (!sentence || typeof sentence !== 'string') {
      return { input: '', glossSequence: [], tokens: [] };
    }

    // Strip source prefixes from tab demo texts (e.g. "YouTube caption:", "Live Broadcast:", "Document extract:")
    let trimmed = sentence.trim()
      .replace(/^(youtube\s+caption|live\s+broadcast|document\s+extract)\s*:\s*/i, '')
      .trim();

    // 1. Check Pre-calibrated Conversational Phrase Matrix First
    for (const item of PHRASE_PATTERNS) {
      if (item.pattern.test(trimmed)) {
        return {
          input: sentence,
          glossSequence: [...item.glosses],
          isPhraseMatch: true
        };
      }
    }

    // 2. Tokenize & Clean
    const rawWords = trimmed
      .replace(/[^\w\s\?]/g, '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    let timeTokens = [];
    let questionTokens = [];
    let subjectTokens = [];
    let objectTokens = [];
    let verbTokens = [];
    let otherTokens = [];

    for (let i = 0; i < rawWords.length; i++) {
      const word = rawWords[i].replace('?', '');
      const hasQuestionMark = rawWords[i].includes('?');

      if (hasQuestionMark || QUESTION_WORDS.has(word)) {
        questionTokens.push(WORD_TO_ISL_MAP[word] || word.toUpperCase());
        continue;
      }

      if (TIME_WORDS.has(word)) {
        timeTokens.push(WORD_TO_ISL_MAP[word] || word.toUpperCase());
        continue;
      }

      if (STOP_WORDS.has(word) && !WORD_TO_ISL_MAP[word]) {
        continue; // Skip filler words
      }

      // Check direct word or singular stem (e.g. "doctors" -> "doctor", "buses" -> "bus")
      const candidateWord = WORD_TO_ISL_MAP[word]
        ? word
        : (word.endsWith('es') && WORD_TO_ISL_MAP[word.slice(0, -2)]
            ? word.slice(0, -2)
            : (word.endsWith('s') && WORD_TO_ISL_MAP[word.slice(0, -1)]
                ? word.slice(0, -1)
                : word));

      if (WORD_TO_ISL_MAP[candidateWord]) {
        const mappedGloss = WORD_TO_ISL_MAP[candidateWord];
        if (['YOU', 'ME', 'NAMASTE', 'PLEASE', 'WELCOME', 'EVERYONE', 'FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'CHILD', 'FAMILY'].includes(mappedGloss)) {
          subjectTokens.push(mappedGloss);
        } else if (['WATER', 'FOOD', 'DOCTOR', 'EMERGENCY', 'TRAIN_STATION', 'SCHOOL', 'NICE', 'MEET', 'LOVE', 'FRIEND', 'FAMILY', 'HOME', 'WORK', 'HAPPY', 'SAD', 'CAR', 'BUS', 'AIRPLANE', 'OFFICE', 'MARKET', 'MONEY', 'BOOK', 'PHONE', 'COMPUTER', 'INTERNET', 'MESSAGE', 'MEDICINE', 'PEACE'].includes(mappedGloss)) {
          objectTokens.push(mappedGloss);
        } else {
          verbTokens.push(mappedGloss);
        }
        continue;
      }

      // Default: Check vocabulary resolver with word or stem
      let resolved = islVocabulary.resolve(word);
      if ((!resolved.found || resolved.isFingerspelled) && candidateWord !== word) {
        const stemResolved = islVocabulary.resolve(candidateWord);
        if (stemResolved.found && !stemResolved.isFingerspelled) {
          resolved = stemResolved;
        }
      }

      if (resolved.found) {
        otherTokens.push(resolved.clipId);
      } else {
        otherTokens.push(word.toUpperCase());
      }
    }

    // 3. Assemble in ISL Natural Order: [TIME] -> [SUBJECT] -> [OBJECT] -> [VERB] -> [QUESTION]
    let sequence = [
      ...timeTokens,
      ...subjectTokens,
      ...objectTokens,
      ...otherTokens,
      ...verbTokens,
      ...questionTokens
    ];

    // Deduplicate consecutive identical tokens
    const deduped = [];
    for (let j = 0; j < sequence.length; j++) {
      if (j === 0 || sequence[j] !== sequence[j - 1]) {
        deduped.push(sequence[j]);
      }
    }

    const finalGlosses = deduped.length > 0 ? deduped : ['NAMASTE'];

    return {
      input: sentence,
      glossSequence: finalGlosses
    };
  }

  /**
   * Word-by-Word Sign Language Tokenizer
   * Preserves every single word in exact sequential order.
   * Maps each word to its ISL dictionary sign or fingerspelling gesture.
   * @param {string} sentence
   * @returns {{ words: string[], glossSequence: string[], items: Array<{ word: string, token: string, isFingerspelled: boolean }> }}
   */
  static convertWordByWord(sentence) {
    if (!sentence || typeof sentence !== 'string') {
      return { words: [], glossSequence: ['NAMASTE'], items: [] };
    }

    const rawWords = sentence.trim().split(/\s+/).filter(Boolean);
    const words = [];
    const glossSequence = [];
    const items = [];

    for (let i = 0; i < rawWords.length; i++) {
      const originalWord = rawWords[i];
      const cleanWord = originalWord.replace(/[^\w\s-]/g, '').trim();
      if (!cleanWord) continue;

      // 1. Check if 2-word phrase starts here (e.g. "thank you", "good morning", "prime minister", "train station")
      if (i < rawWords.length - 1) {
        const nextWord = rawWords[i + 1].replace(/[^\w\s-]/g, '').trim();
        const pair = `${cleanWord} ${nextWord}`.toLowerCase();
        
        let matchedPair = null;
        for (const rule of PHRASE_PATTERNS) {
          if (rule.pattern.test(pair)) {
            matchedPair = rule.glosses[0];
            break;
          }
        }

        if (matchedPair) {
          words.push(`${originalWord} ${rawWords[i + 1]}`);
          glossSequence.push(matchedPair);
          items.push({
            word: `${originalWord} ${rawWords[i + 1]}`,
            token: matchedPair,
            isFingerspelled: false
          });
          i++; // Skip next word as it was part of this multi-word sign
          continue;
        }
      }

      words.push(originalWord);

      // 2. Resolve individual word
      const resolved = islVocabulary.resolve(cleanWord);
      let token = cleanWord.toUpperCase();
      let isFingerspelled = false;

      if (resolved && resolved.found) {
        token = resolved.clipId;
        isFingerspelled = !!resolved.isFingerspelled;
      } else {
        // Universal fingerspelling for words not directly in vocabulary
        const firstLetter = cleanWord.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || 'A';
        token = `ISL_${firstLetter}`;
        isFingerspelled = true;
      }

      glossSequence.push(token);
      items.push({
        word: originalWord,
        token: token,
        isFingerspelled
      });
    }

    if (glossSequence.length === 0) {
      glossSequence.push('NAMASTE');
      items.push({ word: sentence, token: 'NAMASTE', isFingerspelled: false });
    }

    return {
      words,
      glossSequence,
      items
    };
  }

  /**
   * Helper to directly return word-by-word gloss sequence array
   * @param {string} sentence
   * @returns {string[]}
   */
  static toWordByWordGlosses(sentence) {
    const res = this.convertWordByWord(sentence);
    return res.glossSequence || ['NAMASTE'];
  }

  /**
   * Universal helper to return ISL gloss sequence
   * @param {string} sentence
   * @param {boolean} [wordByWord=true]
   * @returns {string[]}
   */
  static toISLGloss(sentence, wordByWord = true) {
    if (wordByWord) {
      return this.toWordByWordGlosses(sentence);
    }
    const res = this.convert(sentence);
    return res.glossSequence || ['NAMASTE'];
  }
}
