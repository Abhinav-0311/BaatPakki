import { type Draft, type Field, type Turn, indianDate } from '../shared/domain.ts';

export type Proposal = { changes: { field: Field; value: string | number | string[] | null; quote: string }[]; question: string | null; questionField?: Field | null };
const digitText = (text: string) => text.replace(/[०-९]/g, c => String(c.charCodeAt(0) - 0x966));
const numbers: Record<string, number> = {
  zero: 0, shunya: 0, 'शून्य': 0, one: 1, ek: 1, 'एक': 1, two: 2, do: 2, 'दो': 2, three: 3, teen: 3, 'तीन': 3,
  four: 4, char: 4, chaar: 4, 'चार': 4, five: 5, panch: 5, paanch: 5, 'पांच': 5, 'पाँच': 5,
  six: 6, che: 6, chhe: 6, chhah: 6, 'छह': 6, 'छः': 6, seven: 7, saat: 7, 'सात': 7, eight: 8, aath: 8, 'आठ': 8,
  nine: 9, nau: 9, 'नौ': 9, ten: 10, das: 10, 'दस': 10, eleven: 11, gyarah: 11, 'ग्यारह': 11,
  twelve: 12, barah: 12, 'बारह': 12, thirteen: 13, terah: 13, 'तेरह': 13, fourteen: 14, chaudah: 14, 'चौदह': 14,
  fifteen: 15, pandrah: 15, 'पंद्रह': 15, sixteen: 16, solah: 16, 'सोलह': 16, seventeen: 17, 'सत्रह': 17,
  eighteen: 18, 'अठारह': 18, nineteen: 19, 'उन्नीस': 19, twenty: 20, bees: 20, 'बीस': 20,
  thirty: 30, tees: 30, 'तीस': 30, forty: 40, 'चालीस': 40, fifty: 50, pachaas: 50, 'पचास': 50,
  sixty: 60, 'साठ': 60, seventy: 70, 'सत्तर': 70, eighty: 80, 'अस्सी': 80, ninety: 90, 'नब्बे': 90,
};
const scales: Record<string, number> = { hundred: 100, sau: 100, 'सौ': 100, thousand: 1000, hazar: 1000, hazaar: 1000, 'हजार': 1000, 'हज़ार': 1000, lakh: 100000, 'लाख': 100000 };
function amount(text: string): number | null {
  const numeric = digitText(text).match(/\d[\d,]*(?:\.\d+)?\s*(lakh|लाख|thousand|hazaar|hazar|हजार|हज़ार|hundred|सौ)?/iu);
  if (numeric) return Number(numeric[0].replace(/[^\d.]/g, '')) * (numeric[1] ? scales[numeric[1].toLowerCase()] || 1 : 1);
  let sum = 0, group = 0, found = false;
  for (const token of text.toLowerCase().split(/[\s-]+/)) {
    if (token in numbers) { group += numbers[token]; found = true; }
    else if (token in scales) {
      const scale = scales[token];
      if (scale === 100) group = (group || 1) * scale;
      else { sum += (group || 1) * scale; group = 0; }
      found = true;
    } else if (found) break;
  }
  return found ? sum + group : null;
}
const hours = '(?:[0-9०-९]{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|ek|do|teen|chaar|char|paanch|panch|chhe|che|saat|aath|nau|das|gyarah|barah|एक|दो|तीन|चार|पाँच|पांच|छह|छः|सात|आठ|नौ|दस|ग्यारह|बारह)';
const period = '(?:subah|morning|shaam|sham|evening|raat|night|dopahar|afternoon|सुबह|शाम|रात|दोपहर)';
const timePattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:(${period})\\s+)?(${hours})(?::([0-9०-९]{2}))?\\s*(baje|बजे|a\\.?m\\.?|p\\.?m\\.?)(?![\\p{L}\\p{N}])`, 'giu');
const weekdays: [RegExp, number][] = [
  [/sunday|ravivaar|ravivar|रविवार/iu, 0], [/monday|somvaar|somvar|सोमवार/iu, 1], [/tuesday|mangalvaar|mangalvar|मंगलवार/iu, 2],
  [/wednesday|budhvaar|budhvar|बुधवार/iu, 3], [/thursday|guruvaar|guruvar|गुरुवार/iu, 4], [/friday|shukravaar|shukravar|शुक्रवार/iu, 5], [/saturday|shanivaar|shanivar|शनिवार/iu, 6],
];

// shortcut: this is a guided AC-intake parser, not open-ended language understanding; expand only with tested phrase families.
export function parseRequest(text: string, draft: Draft, turns: Turn[], now = new Date()): Proposal {
  const result: Proposal = { changes: [], question: null };
  const add = (field: Field, value: Proposal['changes'][number]['value'], quote: string) => {
    result.changes = result.changes.filter(c => c.field !== field); result.changes.push({ field, value, quote });
  };
  const today = indianDate(now);
  const current = new Date(`${today}T12:00:00+05:30`);
  const shifted = (days: number) => { const date = new Date(current); date.setUTCDate(date.getUTCDate() + days); return indianDate(date); };
  const clauses = text.split(/(?<!\d)\.|\.(?!\d)|[!।?\n]+|,(?![0-9०-९])\s*(?=(?:कल|आज|परसों|kal\b|aaj\b|tomorrow\b|today\b|budget\b|बजट|gas\b|गैस|mera\b|मेरा|address\b|पता|number\b|नंबर|फोन|phone\b|servic|सर्विस|sirf\b|सिर्फ))/giu).filter(s => s.trim());

  const name = text.match(/(?:mera\s+naam|मेरा\s+नाम|my\s+name\s+is|नाम)\s+([^,.।!?\n]{2,90})/iu);
  if (name) {
    const value = name[1].split(/\s+(?:hai|है|number|नंबर|नम्बर|phone|मोबाइल|address|पता)\b/u)[0].replace(/\s+(?:है|hai)$/iu, '').trim();
    if (value.length >= 2 && value.length <= 100) add('name', value, name[0]);
  }
  const phone = text.match(/(?<![\d०-९])(?:\+91[ -]?)?[6-9६-९](?:[ -]?[0-9०-९]){9}(?![\d०-९])/u);
  if (phone) add('phone', digitText(phone[0]).replace(/^\+91[ -]?/, '').replace(/[ -]/g, ''), phone[0]);
  const address = text.match(/(?:address|पता)\s*(?:(?:is|hai|है)\s*)?[:=-]?\s*([^.!।?\n]{8,300})/iu);
  if (address) add('address', address[1].trim(), address[0]);

  for (const clause of clauses) {
    if (/cooling\s*(?:kam|कम|low|nahi|नहीं|not)|(?:low|poor|no)\s+cooling|कूलिंग\s*(?:कम|नहीं)|ठंडा\s*नहीं|thanda\s*nahi|पानी\s*(?:टपक|लीक)|water\s*(?:leak|drip)|leaking|rattl|noise|आवाज़|आवाज|शोर|not\s*(?:start|turn)|चालू\s*नहीं|chalu\s*nahi/iu.test(clause)) {
      if (clause.trim().length <= 500) add('problem', clause.trim().replace(/[.!।?]$/, ''), clause.trim());
    }
    const inspection = clause.match(/(?:sirf|only|सिर्फ|केवल)\s*(?:inspection|check|जाँच|जांच)|(?:inspection|निरीक्षण|जाँच|जांच)/iu);
    const service = clause.match(/servicing|service\b|सर्विसिंग|सर्विस|सफाई|cleaning/iu);
    const repair = clause.match(/repair|मरम्मत/iu);
    if (inspection) add('work', 'AC inspection', inspection[0]);
    else if (service && !/(?:servic\w*|सर्विस\S*)\s*(?:nahi|नहीं|मत)|(?:no|not|मत)\s*(?:servic|सर्विस)/iu.test(clause)) add('work', 'AC servicing', service[0]);
    else if (repair && !/(?:repair|मरम्मत)\s*(?:nahi|नहीं|मत)|(?:no|not|मत)\s*(?:repair|मरम्मत)/iu.test(clause)) add('work', 'AC repair requested', repair[0]);

    if (/approval\s*ki\s*zarurat\s*nahi|approval\s*(?:not|isn't)\s*(?:needed|required)|remove\s*(?:the\s*)?(?:restriction|condition)|अनुमति\s*की\s*ज़रूरत\s*नहीं/iu.test(clause)) {
      result.question = 'Please edit the approval instruction directly on the card to remove it, so the change is explicit.';
      result.questionField = 'conditions';
      continue;
    }
    const hasSubject = /gas|गैस|part|पार्ट|filter|फ़िल्टर|फिल्टर|बदल|replace|extra\s*work|अतिरिक्त|काम/iu.test(clause);
    const hasLimit = /pehle|पहले|before|approval|अप्रूवल|permission|अनुमति|nahi|नहीं|\bmat\b|मत|\bdo\s*not\b|don't|without|बिना|only|sirf|सिर्फ/iu.test(clause);
    if ((hasSubject && hasLimit) || /\bdo\s*not\b|don't|without|बिना/iu.test(clause)) {
      const value = clause.trim().replace(/[.!।?]$/, '');
      if (value.length <= 300) {
        const existing = result.changes.find(c => c.field === 'conditions');
        add('conditions', [...(existing?.value as string[] || []), value], text);
      } else result.question = 'Please add this longer instruction directly in Approval & instructions so no condition is lost.';
    }
    const budget = clause.match(/(?:budget|बजट)\s*(?:is\s*|hai\s*|है\s*|[:=-]\s*)?(.{1,80})/iu);
    if (budget) {
      const value = amount(budget[1]);
      if (/no\s*(?:fixed\s*)?budget|budget\s*(?:nahi|नहीं)|बजट\s*नहीं/iu.test(budget[0])) add('budget', null, budget[0]);
      else if (value !== null && Number.isInteger(value) && value > 0 && value <= 1000000 && !/-\s*[\d०-९]|\bor\b|या/iu.test(budget[1])) add('budget', value, budget[0]);
      else { result.question = 'Please enter your maximum budget as a whole rupee amount, or leave the budget blank.'; result.questionField = 'budget'; }
    }
  }

  const corrected = (mentions: { index: number; end: number }[]) => mentions.length < 2 || mentions.slice(1).every((mention, i) => /(?:sorry|actually|instead|नहीं|nahi|बल्कि|balki|माफ)[,:\s]*(?:(?:at|on|ko)\s*)?$/iu.test(text.slice(mentions[i].end, mention.index)));
  const dates: { index: number; end: number; value: string; quote: string }[] = [];
  for (const match of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b|tomorrow|परसों|parso|आज|\baaj\b|today|कल|\bkal\b/giu)) {
    const quote = match[0];
    const value = /^\d{4}/u.test(quote) ? quote : /today|आज|aaj/iu.test(quote) ? today : /parso|परसों/iu.test(quote) ? shifted(2) : shifted(1);
    dates.push({ index: match.index, end: match.index + quote.length, value, quote });
  }
  for (const [pattern, day] of weekdays) for (const match of text.matchAll(new RegExp(pattern.source, 'giu'))) {
    const delta = (day - current.getUTCDay() + 7) % 7;
    dates.push({ index: match.index, end: match.index + match[0].length, value: shifted(delta || 7), quote: match[0] });
  }
  dates.sort((a, b) => a.index - b.index);
  if (dates.length) {
    if (!corrected(dates) && new Set(dates.map(d => d.value)).size > 1) {
      add('visitDate', null, text); result.question = 'You mentioned different dates. Please give one requested visit date.'; result.questionField = 'visitDate';
    } else if (/yesterday|कल[^.!।\n]*(?:हुई\s*थी|हुआ\s*था)|\bkal\b[^.!।\n]*(?:hua\s*tha|hui\s*thi)/iu.test(text)) {
      result.question = 'Do you mean a new visit tomorrow? Please give the requested date.'; result.questionField = 'visitDate';
    } else { const last = dates.at(-1)!; add('visitDate', last.value, last.quote); }
  }
  const flexible = text.match(/any\s*time|anytime|time\s*(?:is\s*)?flexible|कभी\s*भी|kabhi\s*bhi/iu);
  const qualified = [...text.matchAll(timePattern)];
  const times = qualified.map(match => {
    const h = amount(match[2]), minute = match[3] ? Number(digitText(match[3])) : 0;
    const p = `${match[1] || ''} ${match[4]}`.toLowerCase();
    const explicit = /am|pm|a\.m|p\.m|morning|evening|night|afternoon|subah|shaam|sham|raat|dopahar|सुबह|शाम|रात|दोपहर/iu.test(p);
    const pm = /pm|p\.m|evening|night|afternoon|shaam|sham|raat|dopahar|शाम|रात|दोपहर/iu.test(p);
    const hour = h !== null && h <= 12 ? h % 12 + (pm ? 12 : 0) : h;
    const valid = h !== null && h <= 23 && minute < 60 && (explicit ? h >= 1 && h <= 12 : h > 12);
    return { index: match.index, end: match.index + match[0].length, quote: match[0], value: valid ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : null };
  });
  for (const match of text.matchAll(/(?<![\d०-९])([0-9०-९]{1,2}):([0-9०-९]{2})(?![\d०-९])/gu)) {
    if (times.some(t => match.index >= t.index && match.index < t.end)) continue;
    const h = Number(digitText(match[1])), m = Number(digitText(match[2]));
    times.push({ index: match.index, end: match.index + match[0].length, quote: match[0], value: h > 12 && h <= 23 && m < 60 ? `${h}:${String(m).padStart(2, '0')}` : null });
  }
  times.sort((a, b) => a.index - b.index);
  if (flexible && !/flexible\s*(?:nahi|नहीं)|not\s*flexible/iu.test(text) && !times.length) add('visitTime', 'flexible', flexible[0]);
  else if (times.length) {
    const last = times.at(-1)!;
    if ((!corrected(times) && new Set(times.map(t => t.value)).size > 1) || flexible) {
      add('visitTime', null, text); result.question = 'You mentioned more than one time. Which single time should we request, including AM or PM?'; result.questionField = 'visitTime';
    } else if (last.value) add('visitTime', last.value, last.quote);
    else { add('visitTime', null, last.quote); result.question = 'सुबह या शाम? Please say the time with AM/PM, for example “shaam chhe baje” or “6 PM”.'; result.questionField = 'visitTime'; }
  }
  const lastQuestion = turns.at(-1)?.reply || '';
  if (!result.changes.length && !result.question) {
    if (/what name|आपका नाम/iu.test(lastQuestion) && /^[\p{L}][\p{L} '-]{1,80}$/u.test(text.trim())) add('name', text.trim(), text);
    else if (/service address|पूरा पता/iu.test(lastQuestion) && /flat|house|road|street|apartment|नगर|रोड|मकान|फ्लैट|\d/iu.test(text) && text.length >= 8 && text.length <= 300) add('address', text.trim(), text);
    else if (/what needs attention|क्या परेशानी/iu.test(lastQuestion) && text.length >= 8 && text.length <= 300) add('problem', text.trim(), text);
    else result.question = 'I could not confidently map that phrase. Please use a specific detail, or edit the job card directly.';
  }
  for (const clause of clauses) {
    const c = clause.trim();
    const captured = result.changes.some(change => change.field === 'conditions' ? (change.value as string[]).includes(c) : change.quote.includes(c) || c.includes(change.quote));
    const schedule = dates.some(d => c.includes(d.quote)) || times.some(t => c.includes(t.quote)) || (flexible && c.includes(flexible[0]));
    if (!captured && !schedule && !/^(?:yes|haan|हाँ|हां)[, ]*$/iu.test(c)) {
      result.question ||= 'Some words could not be mapped confidently. Please check every instruction on the card, then acknowledge this question.';
    }
  }

  return result;
}
