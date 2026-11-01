/**
 * Which language a page's text is in, read from the text itself, for a page
 * that does not say or says wrongly. It answers only when it is sure: a guess
 * would translate English as if it were Dutch, so a close call is no answer.
 */

/** Each Latin-script language's commonest short words, which make up a large share of any running text. */
const COMMON_WORDS: Record<string, string> = {
  en: 'the and of to in is that for it with as was on are be this by from at or have not but they which you',
  pt: 'de que não em um uma para com os as do da dos das se por mais mas como ao foi ele ela são está também já',
  es: 'de que el la los las en un una por con para es se del al lo como más pero sus fue ya está también muy y no su le les ha han hay esto este esta cuando todos son',
  fr: 'le la les des et est un une du en que qui dans pour pas sur au avec ce sont plus par mais il elle aux été',
  de: 'der die das und ist nicht ein eine zu den mit von sich des auf für im dem auch es sie wird werden bei nach',
  it: 'il di che la le gli è un una per non con del della dei delle sono anche come più ma nel alla si lo questo',
  nl: 'de het een van en is dat niet op te zijn voor met die er ook aan als bij maar om dan wordt nog naar wel',
  ca: 'el la els les de i que un una per amb no és del al com més però ha aquest també molt dels seva són hi',
  ro: 'și în de la cu un o este că nu pe pentru care din mai sunt se fost ca dar sau ale lui al acest prin',
  pl: 'i w nie na się z że do jest to jak o po co ale tak od za przez są być jego tylko już może dla tym',
  cs: 'a je se na v že to s z do o jsou jako ale by pro tak po jeho však které jen když už jak také nebo',
  sk: 'a je sa na v že to s z do o sú ako ale by pre tak po jeho však ktoré len keď už aj alebo bol',
  hu: 'a az és hogy nem is egy ez de van meg már csak még volt mint vagy el ki be azt ezt lesz pedig sem',
  fi: 'ja on ei se että oli kuin mutta myös hän tai ovat jos niin kun sen ole joka vain nyt mitä olla kanssa',
  sv: 'och att det som en på är av för med till den inte har de om ett men var så kan från också eller vid',
  da: 'og at det som en på er af for med til den ikke har de om et men var så kan fra også eller ved jeg blev nogle meget hvad efter mig sig',
  nb: 'og at det som en på er av for med til den ikke har de om et men var så kan fra også eller ved jeg ble noen mye hva etter meg seg',
  tr: 've bir bu da de için ile çok ne daha gibi olarak olan ama en kadar sonra var değil ya her şey ki',
  id: 'yang dan di ini itu dengan untuk tidak dari dalam akan pada juga ke ada karena oleh bisa atau sudah',
  vi: 'và của là có không những được trong cho người các một với này đã đến khi như từ thì để nhiều',
  hr: 'i je u da se na za su od ne a s što kao iz će bi ili ali to sve samo nije koji kako bio još',
};

const WORDS_BY_LANGUAGE = Object.entries(COMMON_WORDS).map(
  ([language, words]) => [language, new Set(words.split(' '))] as const,
);
// A word several languages share counts for each of them in part, so the words only one uses decide between neighbours.
const LANGUAGES_SHARING = WORDS_BY_LANGUAGE.reduce((counts, [, common]) => {
  common.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  return counts;
}, new Map<string, number>());

/** Scripts only one language on the list writes in, or the first a script points to before its letters say more. */
const SCRIPTS: readonly { pattern: RegExp; language: (text: string) => string }[] = [
  { pattern: /\p{Script=Greek}/u, language: () => 'el' },
  { pattern: /\p{Script=Hebrew}/u, language: () => 'he' },
  { pattern: /\p{Script=Thai}/u, language: () => 'th' },
  { pattern: /\p{Script=Hangul}/u, language: () => 'ko' },
  { pattern: /\p{Script=Bengali}/u, language: () => 'bn' },
  { pattern: /\p{Script=Gujarati}/u, language: () => 'gu' },
  { pattern: /\p{Script=Tamil}/u, language: () => 'ta' },
  { pattern: /\p{Script=Telugu}/u, language: () => 'te' },
  { pattern: /\p{Script=Kannada}/u, language: () => 'kn' },
  { pattern: /\p{Script=Malayalam}/u, language: () => 'ml' },
  { pattern: /\p{Script=Devanagari}/u, language: (text) => (/आहे|आणि/.test(text) ? 'mr' : 'hi') },
  {
    pattern: /\p{Script=Arabic}/u,
    language: (text) => {
      if (/[ٹڈڑںے]/.test(text)) {
        return 'ur';
      }
      return /[پچژگ]/.test(text) ? 'fa' : 'ar';
    },
  },
  {
    pattern: /\p{Script=Cyrillic}/u,
    language: (text) => {
      if (/[ђћџјљњ]/.test(text)) {
        return 'sr';
      }
      if (/ў/.test(text)) {
        return 'be';
      }
      if (/[їєґ]/.test(text)) {
        return 'uk';
      }
      return /[ыэ]/.test(text) || !/ъ/.test(text) ? 'ru' : 'bg';
    },
  },
  {
    pattern: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
    language: (text) => {
      if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) {
        return 'ja';
      }
      const simplified = (text.match(/[这们说国时会对发来过还没]/g) ?? []).length;
      const traditional = (text.match(/[這們說國時會對發來過還沒]/g) ?? []).length;
      return traditional > simplified ? 'zh-Hant' : 'zh-Hans';
    },
  },
];

// Past this the sample says nothing more, and counting it would only cost time.
const MOST_CHARACTERS = 20_000;
// Fewer words than this is a menu or a caption, not enough to tell one language from its neighbour.
const FEWEST_WORDS = 30;
// The best match has to stand clear of the next, or the two are too alike in this text to choose between.
const CLEAR_MARGIN = 1.5;
// Common words make up well over a tenth of any prose; below that the text is not in a language on the list.
const SMALLEST_SHARE = 0.08;
// A script has to be most of the letters, so a page with one quoted name in Greek is not Greek.
const MOST_OF_THE_LETTERS = 0.5;

/** The language of `texts`, as a code the translation list uses, or null when the text does not make it plain. */
export function detectLanguage(texts: readonly string[]): string | null {
  const sample = texts.join(' ').slice(0, MOST_CHARACTERS);
  const letters = sample.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) {
    return null;
  }
  const script = SCRIPTS.find(({ pattern }) => {
    const matching = letters.filter((letter) => pattern.test(letter)).length;
    return matching / letters.length >= MOST_OF_THE_LETTERS;
  });
  if (script) {
    return script.language(sample);
  }
  const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < FEWEST_WORDS) {
    return null;
  }
  const scores = WORDS_BY_LANGUAGE.map(([language, common]) => {
    const found = words.filter((word) => common.has(word));
    return {
      language,
      share: found.length / words.length,
      weight: found.reduce((total, word) => total + 1 / (LANGUAGES_SHARING.get(word) ?? 1), 0),
    };
  }).sort((left, right) => right.weight - left.weight);
  const [best, runnerUp] = scores;
  if (!best || best.share < SMALLEST_SHARE) {
    return null;
  }
  return best.weight >= CLEAR_MARGIN * (runnerUp?.weight ?? 0) ? best.language : null;
}
