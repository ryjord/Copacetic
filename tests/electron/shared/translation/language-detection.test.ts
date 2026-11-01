import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../../../../electron/shared/translation/language-detection';

// Ordinary news-like prose, the kind a page in that language is mostly made of.
const PROSE: Record<string, string> = {
  en: 'The council said on Tuesday that the new bridge would not open until the spring, because the work on the river bank had taken longer than it planned. Residents who use the old crossing every day were told to expect delays, and the mayor said that she was sorry for the trouble it has caused for them.',
  pt: 'O governo disse nesta terça-feira que a nova ponte não vai abrir antes da primavera, porque as obras na margem do rio demoraram mais do que o previsto. Os moradores que usam a travessia antiga todos os dias foram avisados de que haverá atrasos, e a prefeita disse que lamenta os transtornos que isso causou para eles.',
  es: 'El ayuntamiento dijo el martes que el nuevo puente no se abrirá hasta la primavera, porque las obras en la orilla del río han tardado más de lo previsto. A los vecinos que usan el paso antiguo todos los días se les dijo que habrá retrasos, y la alcaldesa dijo que lamenta las molestias que esto les ha causado.',
  fr: "Le conseil a déclaré mardi que le nouveau pont ne sera pas ouvert avant le printemps, car les travaux sur la berge ont pris plus de temps que prévu. Les habitants qui utilisent l'ancien passage tous les jours ont été prévenus qu'il y aura des retards, et la maire a dit qu'elle était désolée pour la gêne que cela leur a causée.",
  de: 'Der Stadtrat sagte am Dienstag, dass die neue Brücke nicht vor dem Frühling geöffnet wird, weil die Arbeiten am Flussufer länger gedauert haben als geplant. Die Anwohner, die den alten Übergang jeden Tag nutzen, wurden auf Verzögerungen hingewiesen, und die Bürgermeisterin sagte, es tue ihr leid für die Unannehmlichkeiten, die das für sie mit sich bringt.',
  it: 'Il consiglio ha detto martedì che il nuovo ponte non sarà aperto prima della primavera, perché i lavori sulla riva del fiume sono durati più del previsto. Ai residenti che usano il vecchio passaggio ogni giorno è stato detto di aspettarsi ritardi, e la sindaca ha detto che si scusa per il disagio che questo ha causato a loro.',
  nl: 'De gemeenteraad zei dinsdag dat de nieuwe brug niet voor het voorjaar open gaat, omdat het werk aan de oever langer heeft geduurd dan gepland. Bewoners die de oude oversteek elke dag gebruiken, kregen te horen dat er vertraging zal zijn, en de burgemeester zei dat het haar spijt voor de overlast die het voor hen heeft veroorzaakt.',
  da: 'Byrådet sagde tirsdag, at den nye bro ikke åbner før til foråret, fordi arbejdet ved åbredden har taget længere tid end planlagt. Beboerne, som bruger den gamle overgang hver dag, blev bedt om at forvente forsinkelser, og borgmesteren sagde, at hun var ked af de gener, det har givet dem, og at der efter nogle uger kommer mere at vide om hvad der sker.',
  nb: 'Bystyret sa tirsdag at den nye brua ikke åpner før til våren, fordi arbeidet ved elvebredden har tatt lengre tid enn planlagt. Beboerne som bruker den gamle overgangen hver dag, ble bedt om å forvente forsinkelser, og ordføreren sa at hun var lei seg for bryet det har gitt dem, og at det etter noen uker kommer mer om hva som skjer.',
  cs: 'Městská rada v úterý uvedla, že nový most se neotevře dříve než na jaře, protože práce na břehu řeky trvaly déle, než se plánovalo. Obyvatelé, kteří starý přechod používají každý den, byli upozorněni, že dojde ke zpožděním, a starostka řekla, že je jí líto potíží, které jim to způsobilo, a že další informace jsou také k dispozici.',
  sk: 'Mestská rada v utorok uviedla, že nový most sa neotvorí skôr ako na jar, pretože práce na brehu rieky trvali dlhšie, ako sa plánovalo. Obyvatelia, ktorí starý prechod používajú každý deň, boli upozornení, že dôjde k meškaniam, a starostka povedala, že je jej ľúto ťažkostí, ktoré im to spôsobilo, a že ďalšie informácie sú aj k dispozícii.',
  ru: 'Городской совет заявил во вторник, что новый мост не откроется до весны, потому что работы на берегу реки заняли больше времени, чем планировалось.',
  uk: 'Міська рада заявила у вівторок, що новий міст не відкриється до весни, бо роботи на березі річки тривали довше, ніж планувалося, і це її єдине пояснення.',
  el: 'Το δημοτικό συμβούλιο ανακοίνωσε την Τρίτη ότι η νέα γέφυρα δεν θα ανοίξει πριν από την άνοιξη.',
  ar: 'قال المجلس يوم الثلاثاء إن الجسر الجديد لن يفتح قبل الربيع لأن العمل على ضفة النهر استغرق وقتا أطول.',
  fa: 'شورای شهر روز سه‌شنبه گفت که پل جدید پیش از بهار باز نمی‌شود، چون کار در کنار رودخانه بیشتر طول کشید.',
  'zh-Hans': '市议会周二表示，新桥要到春天才会开放，因为河岸的工程比计划的时间更长。他们说这对居民来说是个问题。',
  'zh-Hant': '市議會週二表示，新橋要到春天才會開放，因為河岸的工程比計劃的時間更長。他們說這對居民來說是個問題。',
  ja: '市議会は火曜日、川岸の工事が予定より長引いたため、新しい橋は春まで開通しないと発表しました。',
};

describe('telling a page’s language from its text', () => {
  it.each(Object.entries(PROSE))('reads %s prose as that language', (language, text) => {
    expect(detectLanguage([text])).toBe(language);
  });

  it('reads the language across many short pieces, as a page is collected', () => {
    expect(detectLanguage(PROSE.pt?.split(', ') ?? [])).toBe('pt');
  });

  // A guess here would translate English as if it were another language.
  it.each([
    ['too little text to tell', ['Home', 'News', 'Sport', 'Contact']],
    ['no letters at all', ['12:30', '€ 4,99', '—']],
    [
      'names and numbers, in no language',
      ['Lisboa 2026 Porto 18:00 Benfica Sporting FC Braga 3 1 Vitória SC Guimarães'],
    ],
  ])('gives no answer for %s', (_name, texts) => {
    expect(detectLanguage(texts)).toBeNull();
  });

  it('is not moved by a name in another script within a page in English', () => {
    expect(detectLanguage([`${PROSE.en} The architect, Νίκος, agreed.`])).toBe('en');
  });
});
