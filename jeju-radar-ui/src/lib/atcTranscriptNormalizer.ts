import { normalizeAtcPhrase } from "./atcCommandParser";
import { sanitizeCallsign, telephonyAliasesForIcao } from "./callsignTelephony";
import type { AircraftState, RadarDataset } from "./types";

export interface AtcTranscriptNormalizationResult {
  raw: string;
  normalized: string;
  changed: boolean;
  reasons: string[];
  warnings: string[];
}

interface NormalizationContext {
  aircraft: AircraftState[];
  dataset: RadarDataset;
}

interface ParsedNumberWords {
  text: string;
  value: number;
}

interface FixCandidateMatch {
  fixId: string;
  length: number;
  score: number;
}

const digitWords: Record<string, string> = {
  ZERO: "0",
  ONE: "1",
  TWO: "2",
  THREE: "3",
  FOUR: "4",
  FIVE: "5",
  SIX: "6",
  SEVEN: "7",
  EIGHT: "8",
  NINE: "9",
  NINER: "9"
};

const smallNumberWords: Record<string, number> = {
  TEN: 10,
  ELEVEN: 11,
  TWELVE: 12,
  THIRTEEN: 13,
  FOURTEEN: 14,
  FIFTEEN: 15,
  SIXTEEN: 16,
  SEVENTEEN: 17,
  EIGHTEEN: 18,
  NINETEEN: 19
};

const tensWords: Record<string, number> = {
  TWENTY: 20,
  THIRTY: 30,
  FORTY: 40,
  FOURTY: 40,
  FIFTY: 50,
  SIXTY: 60,
  SEVENTY: 70,
  EIGHTY: 80,
  NINETY: 90
};

const procedureSuffixWords: Record<string, string> = {
  PAPA: "P",
  MIKE: "M",
  ECHO: "E",
  WHISKEY: "W",
  NOVEMBER: "N",
  KILO: "K",
  LIMA: "L",
  YANKEE: "Y",
  ZULU: "Z"
};

const phoneticLetterWords: Record<string, string> = {
  ALFA: "A",
  ALPHA: "A",
  BRAVO: "B",
  CHARLIE: "C",
  DELTA: "D",
  ECHO: "E",
  FOXTROT: "F",
  GOLF: "G",
  HOTEL: "H",
  INDIA: "I",
  JULIET: "J",
  JULIETT: "J",
  KILO: "K",
  LIMA: "L",
  MIKE: "M",
  NOVEMBER: "N",
  OSCAR: "O",
  PAPA: "P",
  QUEBEC: "Q",
  ROMEO: "R",
  SIERRA: "S",
  TANGO: "T",
  UNIFORM: "U",
  VICTOR: "V",
  WHISKEY: "W",
  XRAY: "X",
  YANKEE: "Y",
  ZULU: "Z"
};

const phoneticLetterWordPattern = Object.keys(phoneticLetterWords).join("|");

const fixContextTriggers = new Set(["DIRECT", "VIA", "AT", "OVER", "UNTIL", "HOLD"]);
const fixContextStartSkips = new Set(["TO", "AT", "OVER"]);
const fixContextStopTokens = new Set([
  "AND",
  "THEN",
  "PASSING",
  "PRESENT",
  "POSITION",
  "AS",
  "PUBLISHED",
  "INBOUND",
  "ARRIVAL",
  "APPROACH",
  "RUNWAY",
  "RWY",
  "SPEED",
  "HEADING",
  "LEFT",
  "RIGHT",
  "TURN",
  "TURNS",
  "MINUTE",
  "MINUTES",
  "LEG",
  "LEGS",
  "DESCEND",
  "CLIMB",
  "MAINTAIN",
  "CANCEL",
  "LEVEL",
  "ALTITUDE",
  "RESTRICTION",
  "RESTRICTIONS",
  "OR",
  "LESS",
  "GREATER",
  "KNOTS"
]);

const fixAliases: Array<{ fixId: string; aliases: string[] }> = [
  { fixId: "YUMIN", aliases: ["YOU MEAN", "YOU MEN", "YOU MIN", "YU MEAN", "YU MIN", "YUM IN", "YUMEN", "YUMIN", "HUMAN"] },
  { fixId: "LIMSO", aliases: ["LIM SO", "LIMSO", "LIMS O", "LIM SOL", "LIM SOUL"] },
  { fixId: "LIMDI", aliases: ["LIM D", "LIM DEE", "LIMDI"] },
  {
    fixId: "DAKPI",
    aliases: [
      "DAK P",
      "DAK PE",
      "DAK PEE",
      "DACK P",
      "DACK PEE",
      "DARK P",
      "DARK PE",
      "DARK PEE",
      "DOC P",
      "DOC PE",
      "DOC PEA",
      "DOC PEE",
      "DOCK P",
      "DOCK PEE",
      "DUCK P",
      "DUCK PE",
      "DUCK PEE",
      "DOKPI",
      "DAKPI"
    ]
  },
  { fixId: "DOTOL", aliases: ["DO TALL", "DO TOL", "DOT ALL", "DOTAL", "DOTEL", "DODOL", "DOTOLE", "DOTOL"] },
  { fixId: "DUKAL", aliases: ["DU KAL", "DU CAL", "DO KAL", "DO CALL", "DUCAL", "DUKAL", "DUCK AL", "DUCKAL"] },
  { fixId: "TOKIN", aliases: ["TO KIN", "TO KEN", "TO KING", "TOKEN", "TOKIN"] },
  { fixId: "MANBA", aliases: ["MAN BA", "MAN BAR", "MAMBA", "MANBA"] },
  { fixId: "PALRI", aliases: ["PAL RI", "PALRY", "PALRI"] },
  { fixId: "KAMIT", aliases: ["KAM IT", "COMET", "KAMIT"] },
  { fixId: "AKPON", aliases: ["AK PON", "ACPON", "AKPON"] },
  { fixId: "TAMNA", aliases: ["TAM NA", "TAMNA"] },
  { fixId: "PANSI", aliases: ["PAN SI", "PANSI"] },
  { fixId: "SOSDO", aliases: ["SOS DO", "SOSDO"] },
  { fixId: "TOSAN", aliases: ["TO SAN", "TOSAN"] },
  { fixId: "UPGOS", aliases: ["UP GOS", "UPGOS"] },
  { fixId: "OLLEH", aliases: ["OL LEH", "OLL EH", "OLEH", "OLLEG", "OL LEG", "OLLEH"] },
  { fixId: "BIROM", aliases: ["BI ROM", "BIROM"] },
  { fixId: "PIMIK", aliases: ["PI MIK", "PIMIK"] },
  { fixId: "CHUJA", aliases: ["CHU JA", "CHUJA"] },
  { fixId: "MAKET", aliases: ["MAKE IT", "MAKET"] }
];

export function normalizeAtcTranscriptForParser(
  rawText: string,
  context: NormalizationContext
): AtcTranscriptNormalizationResult {
  const reasons = new Set<string>();
  const warnings = new Set<string>();
  let phrase = normalizeKoreanAtcWords(String(rawText ?? ""), reasons);
  phrase = normalizeKoreanPronunciationAliases(phrase, reasons);
  phrase = normalizeAtcPhrase(phrase).replace(/[;:!?]/g, " ").replace(/\s+/g, " ").trim();

  phrase = normalizeCommonSttMishears(phrase, reasons);
  phrase = expandCompactSpokenNumberTokens(phrase, reasons);
  phrase = replaceNumberWords(phrase, reasons);
  phrase = normalizePhoneticAlphanumericCodes(phrase, reasons);
  phrase = normalizeRunwayNumbers(phrase, reasons);
  phrase = normalizeProcedureSuffixes(phrase, reasons);
  phrase = normalizeCallsignAtStart(phrase, context.aircraft, reasons, warnings);
  phrase = normalizeFixAliases(phrase, context.dataset, reasons, warnings);
  phrase = normalizeContextualFixCandidates(phrase, context.dataset, reasons, warnings);
  phrase = normalizeCommandAliases(phrase, reasons);
  phrase = normalizeAtcPhrase(phrase);

  return {
    raw: rawText,
    normalized: phrase,
    changed: normalizeAtcPhrase(rawText) !== phrase,
    reasons: [...reasons],
    warnings: [...warnings]
  };
}

function normalizeKoreanAtcWords(rawText: string, reasons: Set<string>) {
  const before = rawText;
  const nextText = rawText
    .replace(/제주\s*(?:어프로치|접근관제|접근)/gi, " Jeju Approach ")
    .replace(/제주\s*(?:디파쳐|디파처|출발관제|출발)/gi, " Jeju Departure ")
    .replace(/(?:레이더|레이다)\s*(?:컨택|콘택트|콘텍트)/gi, " radar contact ")
    .replace(/대한\s*항공|코리안\s*에어/gi, " Korean Air ")
    .replace(/아시아나(?:\s*항공)?/gi, " Asiana ")
    .replace(/제주\s*(?:에어|제어|항공)/gi, " Jeju Air ")
    .replace(/진\s*에어/gi, " Jin Air ")
    .replace(/티\s*웨이(?:\s*항공)?/gi, " Teeway ")
    .replace(/이스타(?:\s*항공|젯)?/gi, " Eastar ")
    .replace(/에어\s*부산/gi, " Air Busan ")
    .replace(/에어\s*서울/gi, " Air Seoul ")
    .replace(/에어로\s*(?:케이|한국)/gi, " Aero Hanguk ");

  if (nextText !== before) {
    reasons.add("Korean ATC/airline word normalized");
  }

  return nextText;
}

function normalizeKoreanPronunciationAliases(rawText: string, reasons: Set<string>) {
  const before = rawText;
  let nextText = rawText;

  const replacements: Array<[RegExp, string]> = [
    [/에어로\s*한국/gi, " Aero Hanguk "],
    [/에어로\s*케이/gi, " Aero Hanguk "],
    [/제주\s*제어/gi, " Jeju Air "],

    [/라이트\s*턴/gi, " right turn "],
    [/롸이트\s*턴/gi, " right turn "],
    [/레프트\s*턴/gi, " left turn "],
    [/좌\s*턴/gi, " left turn "],
    [/우\s*턴/gi, " right turn "],
    [/플라이\s*프레젠트\s*헤딩/gi, " fly present heading "],
    [/프레젠트\s*헤딩/gi, " present heading "],
    [/플라이\s*헤딩/gi, " fly heading "],
    [/헤딩/gi, " heading "],
    [/해딩/gi, " heading "],
    [/턴/gi, " turn "],
    [/라이트/gi, " right "],
    [/롸이트/gi, " right "],
    [/레프트/gi, " left "],

    [/리듀스\s*스피드\s*투/gi, " reduce speed to "],
    [/리듀스\s*스피드/gi, " reduce speed "],
    [/인크리즈\s*스피드\s*투/gi, " increase speed to "],
    [/인크리스\s*스피드\s*투/gi, " increase speed to "],
    [/인크리즈\s*스피드/gi, " increase speed "],
    [/인크리스\s*스피드/gi, " increase speed "],
    [/줄여/gi, " reduce "],
    [/스피드/gi, " speed "],
    [/속도/gi, " speed "],
    [/메인테인/gi, " maintain "],
    [/미니멈\s*스피드/gi, " minimum speed "],
    [/노말\s*스피드/gi, " normal speed "],
    [/리줌/gi, " resume "],
    [/리섬/gi, " resume "],
    [/이하/gi, " or less "],
    [/이상/gi, " or greater "],
    [/오어\s*레스/gi, " or less "],
    [/올\s*레스/gi, " or less "],
    [/오어\s*그레이터/gi, " or greater "],
    [/언틸/gi, " until "],
    [/까지/gi, " until "],
    [/패싱/gi, " passing "],

    [/디센드\s*비아/gi, " descend via "],
    [/디센트\s*비아/gi, " descend via "],
    [/디센\s*비아/gi, " descend via "],
    [/디센드\s*투/gi, " descend to "],
    [/디센트\s*투/gi, " descend to "],
    [/디센\s*투/gi, " descend to "],
    [/디센드/gi, " descend "],
    [/디센트/gi, " descend "],
    [/디센/gi, " descend "],
    [/강하/gi, " descend "],
    [/클라임\s*투/gi, " climb to "],
    [/클라임브\s*투/gi, " climb to "],
    [/클라임/gi, " climb "],
    [/클라임브/gi, " climb "],
    [/상승/gi, " climb "],
    [/버티컬\s*스피드/gi, " vertical speed "],
    [/레이트/gi, " rate "],
    [/액스\s*퍼다잇/gi, " expedite "],
    [/엑스\s*퍼다잇/gi, " expedite "],
    [/익스\s*퍼다잇/gi, " expedite "],
    [/익스페다이트/gi, " expedite "],
    [/엑스페다이트/gi, " expedite "],

    [/디렉트\s*투/gi, " direct to "],
    [/다이렉트\s*투/gi, " direct to "],
    [/디렉\s*투/gi, " direct to "],
    [/다이렉\s*투/gi, " direct to "],
    [/디렉트/gi, " direct "],
    [/다이렉트/gi, " direct "],
    [/디렉/gi, " direct "],
    [/다이렉/gi, " direct "],

    [/클리어드\s*포/gi, " cleared for "],
    [/클리어\s*포/gi, " cleared for "],
    [/클리어드/gi, " cleared "],
    [/클리어/gi, " cleared "],
    [/아이\s*엘\s*에스/gi, " ILS "],
    [/아이엘에스/gi, " ILS "],
    [/아일레스/gi, " ILS "],
    [/런웨이/gi, " runway "],
    [/런웨/gi, " runway "],
    [/활주로/gi, " runway "],
    [/어프로치/gi, " approach "],
    [/어라이벌\s*투/gi, " arrival to "],
    [/아라이벌\s*투/gi, " arrival to "],
    [/어라이벌/gi, " arrival "],
    [/아라이벌/gi, " arrival "],
    [/제트/gi, " Z "],
    [/지\s*접근/gi, " Z approach "],
    [/와이/gi, " Y "],

    [/캔슬/gi, " cancel "],
    [/켄슬/gi, " cancel "],
    [/레벨/gi, " level "],
    [/알티튜드/gi, " altitude "],
    [/리스트릭션스/gi, " restrictions "],
    [/리스트릭션/gi, " restriction "],

    [/홀딩/gi, " hold "],
    [/홀드/gi, " hold "],
    [/앳/gi, " at "],
    [/애즈\s*퍼블리시드/gi, " as published "],
    [/에즈\s*퍼블리시드/gi, " as published "],
    [/애즈\s*퍼블리쉬드/gi, " as published "],
    [/에즈\s*퍼블리쉬드/gi, " as published "],
    [/퍼블리시드/gi, " published "],
    [/퍼블리쉬드/gi, " published "],
    [/\bas\s+publish\b/gi, " as published "],
    [/미스드\s*어프로치/gi, " missed approach "],
    [/고\s*어라운드/gi, " go around "],
    [/누가\s*(?:불렀어|콜\s*했어)\??/gi, " who called "],
    [/누구\s*(?:불렀어|콜\s*했어)\??/gi, " who called "],
    [/나\s*(?:불렀어|콜\s*했어)\??/gi, " who called "],
    [/코렉션/gi, " correction "],
    [/코랙션/gi, " correction "],
    [/커렉션/gi, " correction "],
    [/정정/gi, " correction "],
    [/다시\s*말하면/gi, " correction "],
    [/다시/gi, " correction "],
    [/아니(?!오)/gi, " correction "],
    [/시퀀스\s*넘버/gi, " sequence number "],
    [/시퀀스\s*번호/gi, " sequence number "],
    [/컨택\s*타워/gi, " contact tower "],
    [/콘택트\s*타워/gi, " contact tower "],
    [/콘텍트\s*타워/gi, " contact tower "],
    [/모니터\s*타워/gi, " monitor tower "],
    [/스위치\s*타워/gi, " switch tower "],
    [/체인지\s*타워/gi, " change tower "],
    [/데시멀/gi, " decimal "],
    [/포인트/gi, " point "],

    [/유\s*민/gi, " YUMIN "],
    [/유민/gi, " YUMIN "],
    [/유\s*멘/gi, " YUMIN "],
    [/유멘/gi, " YUMIN "],
    [/유\s*맨/gi, " YUMIN "],
    [/유맨/gi, " YUMIN "],
    [/림\s*소/gi, " LIMSO "],
    [/림소/gi, " LIMSO "],
    [/림\s*디/gi, " LIMDI "],
    [/림디/gi, " LIMDI "],
    [/닥\s*피/gi, " DAKPI "],
    [/닥피/gi, " DAKPI "],
    [/닭\s*피/gi, " DAKPI "],
    [/닭피/gi, " DAKPI "],
    [/도\s*톨/gi, " DOTOL "],
    [/도톨/gi, " DOTOL "],
    [/마\s*켓/gi, " MAKET "],
    [/마켓/gi, " MAKET "],
    [/토\s*산/gi, " TOSAN "],
    [/토산/gi, " TOSAN "],
    [/소스\s*도/gi, " SOSDO "],
    [/소스도/gi, " SOSDO "],
    [/탐\s*나/gi, " TAMNA "],
    [/탐나/gi, " TAMNA "],
    [/업\s*고스/gi, " UPGOS "],
    [/업고스/gi, " UPGOS "],
    [/올\s*레/gi, " OLLEH "],
    [/올레/gi, " OLLEH "],

    [/알파/gi, " ALFA "],
    [/브라보/gi, " BRAVO "],
    [/찰리/gi, " CHARLIE "],
    [/델타/gi, " DELTA "],
    [/에코/gi, " ECHO "],
    [/폭스트롯/gi, " FOXTROT "],
    [/골프/gi, " GOLF "],
    [/호텔/gi, " HOTEL "],
    [/인디아/gi, " INDIA "],
    [/줄리엣/gi, " JULIET "],
    [/킬로/gi, " KILO "],
    [/리마/gi, " LIMA "],
    [/마이크/gi, " MIKE "],
    [/노벰버/gi, " NOVEMBER "],
    [/오스카/gi, " OSCAR "],
    [/파파/gi, " PAPA "],
    [/퀘벡/gi, " QUEBEC "],
    [/로미오/gi, " ROMEO "],
    [/시에라/gi, " SIERRA "],
    [/탱고/gi, " TANGO "],
    [/유니폼/gi, " UNIFORM "],
    [/빅터/gi, " VICTOR "],
    [/위스키/gi, " WHISKEY "],
    [/엑스레이/gi, " XRAY "],
    [/양키/gi, " YANKEE "],
    [/줄루/gi, " ZULU "],

    [/따우전드/gi, " THOUSAND "],
    [/따우전/gi, " THOUSAND "],
    [/따우젼/gi, " THOUSAND "],
    [/따우즌/gi, " THOUSAND "],
    [/사우전드/gi, " THOUSAND "],
    [/사우전/gi, " THOUSAND "],
    [/싸우전드/gi, " THOUSAND "],
    [/싸우전/gi, " THOUSAND "],
    [/타우전/gi, " THOUSAND "],
    [/천/gi, " THOUSAND "],
    [/헌드레드/gi, " HUNDRED "],
    [/헌드렛/gi, " HUNDRED "],
    [/헌드릿/gi, " HUNDRED "],
    [/나이너/gi, " NINER "],
    [/나인티/gi, " NINETY "],
    [/나인틴/gi, " NINETEEN "],
    [/세븐틴/gi, " SEVENTEEN "],
    [/식스틴/gi, " SIXTEEN "],
    [/피프틴/gi, " FIFTEEN "],
    [/포틴/gi, " FOURTEEN "],
    [/써틴/gi, " THIRTEEN "],
    [/트웰브/gi, " TWELVE "],
    [/일레븐/gi, " ELEVEN "],
    [/트웬티/gi, " TWENTY "],
    [/써티/gi, " THIRTY "],
    [/포티/gi, " FORTY "],
    [/피프티/gi, " FIFTY "],
    [/식스티/gi, " SIXTY "],
    [/세븐티/gi, " SEVENTY "],
    [/에이티/gi, " EIGHTY "],
    [/에이틴/gi, " EIGHTEEN "],
    [/제로/gi, " ZERO "],
    [/지로/gi, " ZERO "],
    [/원/gi, " ONE "],
    [/투/gi, " TWO "],
    [/튜/gi, " TWO "],
    [/쓰리/gi, " THREE "],
    [/트리/gi, " THREE "],
    [/뜨리/gi, " THREE "],
    [/파이브/gi, " FIVE "],
    [/파입/gi, " FIVE "],
    [/식스/gi, " SIX "],
    [/씩스/gi, " SIX "],
    [/세븐/gi, " SEVEN "],
    [/쎄븐/gi, " SEVEN "],
    [/세번/gi, " SEVEN "],
    [/에이트/gi, " EIGHT "],
    [/에잇트/gi, " EIGHT "],
    [/에잇/gi, " EIGHT "],
    [/나인/gi, " NINE "],
    [/텐/gi, " TEN "],
    [/포/gi, " FOUR "]
  ];

  for (const [pattern, replacement] of replacements) {
    nextText = nextText.replace(pattern, replacement);
  }

  if (nextText !== before) {
    reasons.add("Korean phonetic ATC words normalized");
  }

  return nextText;
}

function normalizeCommonSttMishears(phrase: string, reasons: Set<string>) {
  const before = phrase;
  const nextPhrase = phrase
    .replace(/\bDEDUCE\b/g, "REDUCE")
    .replace(/\bREDUCES\b/g, "REDUCE")
    .replace(/\bDESCENT\s+(?=TO|\d|ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|NINER)/g, "DESCEND ")
    .replace(/\bHEDGING\b/g, "HEADING")
    .replace(/\bSPIT\b/g, "SPEED")
    .replace(/\bMINIMUN\b/g, "MINIMUM")
    .replace(/\bCLEAR\s+FOR\s+ILS\b/g, "CLEARED FOR ILS")
    .replace(/\bCLEAR\s+ILS\b/g, "CLEARED ILS")
    .replace(/\bTURN\s+RIDE\b/g, "TURN RIGHT")
    .replace(/\bRIDE\s+TURN\b/g, "RIGHT TURN")
    .replace(/\bMAKE\s+RIDE\b/g, "MAKE RIGHT")
    .replace(/\bRIDE\s+TURNS\b/g, "RIGHT TURNS")
    .replace(/\b(HEADING|HDG)\s+TOO\b/g, "$1 TWO")
    .replace(/\b(HEADING|HDG)\s+TO\s+(?=ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|NINER|\d)/g, "$1 TWO ")
    .replace(/\b(RUNWAY|RWY)\s+TO\s+(?=ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|NINER|\d)/g, "$1 TWO ")
    .replace(/\b(SPEED|REDUCE|INCREASE|MAINTAIN SPEED)\s+TOO\b/g, "$1 TWO")
    .replace(/\bHOLD\s+THAT\b/g, "HOLD AT")
    .replace(/\bAISLES\b/g, "ILS")
    .replace(/\bISLES\b/g, "ILS")
    .replace(/\bINTENSION\b/g, "INTENTIONS")
    .replace(/\bCOLLECTION\b/g, "CORRECTION")
    .replace(/\bCORRECTING\b/g, "CORRECTION")
    .replace(/\bCORRECT\b/g, "CORRECTION")
    .replace(/\bYORN\s+NUMBER\b/g, "YOU ARE NUMBER")
    .replace(/\bSEVER\b/g, "SEVEN")
    .replace(/\bTO TO ZERO\b/g, "TWO TWO ZERO")
    .replace(/\bTREE\b/g, "THREE")
    .replace(/\bFIFE\b/g, "FIVE")
    .replace(/\bMILES\b/g, "MILE")
    .replace(/\bO'?CLOCK\b/g, "OCLOCK")
    .replace(/\b(\d{1,2})\s+O\s+CLOCK\b/g, "$1 OCLOCK")
    .replace(/\b(\d{1,2})\s+CLOCK\b/g, "$1 OCLOCK")
    .replace(/\b(NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST)BOUND\b/g, "$1 BOUND");

  if (nextPhrase !== before) {
    reasons.add("common STT mishear normalized");
  }

  return nextPhrase;
}

function expandCompactSpokenNumberTokens(phrase: string, reasons: Set<string>) {
  const tokens = phrase.split(" ");
  let changed = false;
  const nextTokens = tokens.map((token) => {
    if (/[^A-Z]/.test(token)) {
      return token;
    }

    const expanded = compactSpokenNumberToken(token);
    if (!expanded || expanded === token) {
      return token;
    }

    changed = true;
    return expanded;
  });

  if (changed) {
    reasons.add("compact spoken number normalized");
  }

  return nextTokens.join(" ");
}

function compactSpokenNumberToken(token: string) {
  const words = [
    ...Object.keys(smallNumberWords),
    ...Object.keys(tensWords),
    ...Object.keys(digitWords),
    "HUNDRED",
    "THOUSAND"
  ].sort((first, second) => second.length - first.length);
  const result: string[] = [];
  let cursor = 0;

  while (cursor < token.length) {
    const match = words.find((word) => token.startsWith(word, cursor));

    if (!match) {
      return null;
    }

    result.push(match);
    cursor += match.length;
  }

  return result.length > 1 ? result.join(" ") : null;
}

function replaceNumberWords(phrase: string, reasons: Set<string>) {
  const tokens = phrase.split(" ");
  const nextTokens: string[] = [];
  let changed = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!isNumberWord(token)) {
      nextTokens.push(token);
      continue;
    }

    const parsed = parseNumberWordsAt(tokens, index);
    if (!parsed) {
      nextTokens.push(token);
      continue;
    }

    nextTokens.push(parsed.number.text);
    index += parsed.length - 1;
    changed = true;
  }

  if (changed) {
    reasons.add("spoken numbers normalized");
  }

  return nextTokens.join(" ");
}

function parseNumberWordsAt(tokens: string[], startIndex: number) {
  const maxLength = Math.min(6, tokens.length - startIndex);

  for (let length = maxLength; length >= 1; length -= 1) {
    const slice = tokens.slice(startIndex, startIndex + length);

    if (!slice.every(isNumberWord)) {
      continue;
    }

    const number = parseNumberWordSequence(slice);
    if (number) {
      return { length, number };
    }
  }

  return null;
}

function parseNumberWordSequence(tokens: string[]): ParsedNumberWords | null {
  const thousandIndex = tokens.indexOf("THOUSAND");
  if (thousandIndex > 0) {
    const before = parseNumberWordSequence(tokens.slice(0, thousandIndex));
    const afterTokens = tokens.slice(thousandIndex + 1);
    const after = afterTokens.length > 0 ? parseNumberWordSequence(afterTokens) : null;

    if (!before || (afterTokens.length > 0 && !after)) {
      return null;
    }

    const value = before.value * 1000 + (after?.value ?? 0);
    return { value, text: String(value) };
  }

  const hundredIndex = tokens.indexOf("HUNDRED");
  if (hundredIndex > 0) {
    const before = parseNumberWordSequence(tokens.slice(0, hundredIndex));
    const afterTokens = tokens.slice(hundredIndex + 1);
    const after = afterTokens.length > 0 ? parseNumberWordSequence(afterTokens) : null;

    if (!before || (afterTokens.length > 0 && !after)) {
      return null;
    }

    const value = before.value * 100 + (after?.value ?? 0);
    return { value, text: String(value) };
  }

  if (tokens.every((token) => digitWords[token] !== undefined)) {
    const text = tokens.map((token) => digitWords[token]).join("");
    return { value: Number.parseInt(text, 10), text };
  }

  if (tokens.length === 1) {
    return singleNumberWord(tokens[0]);
  }

  if (tokens.length >= 2 && digitWords[tokens[0]] !== undefined && tensWords[tokens[1]] !== undefined) {
    const hundreds = Number.parseInt(digitWords[tokens[0]], 10) * 100;
    const ones = tokens.length === 3 && digitWords[tokens[2]] !== undefined
      ? Number.parseInt(digitWords[tokens[2]], 10)
      : 0;
    const value = hundreds + tensWords[tokens[1]] + ones;

    return tokens.length <= 3 ? { value, text: String(value) } : null;
  }

  if (tokens.length === 2 && digitWords[tokens[0]] !== undefined && smallNumberWords[tokens[1]] !== undefined) {
    const value = Number.parseInt(digitWords[tokens[0]], 10) * 100 + smallNumberWords[tokens[1]];
    return { value, text: String(value) };
  }

  if (tensWords[tokens[0]] !== undefined) {
    const ones = tokens.length === 2 && digitWords[tokens[1]] !== undefined
      ? Number.parseInt(digitWords[tokens[1]], 10)
      : 0;

    return tokens.length <= 2 ? { value: tensWords[tokens[0]] + ones, text: String(tensWords[tokens[0]] + ones) } : null;
  }

  return null;
}

function singleNumberWord(token: string): ParsedNumberWords | null {
  if (digitWords[token] !== undefined) {
    return { value: Number.parseInt(digitWords[token], 10), text: digitWords[token] };
  }

  if (smallNumberWords[token] !== undefined) {
    return { value: smallNumberWords[token], text: String(smallNumberWords[token]) };
  }

  if (tensWords[token] !== undefined) {
    return { value: tensWords[token], text: String(tensWords[token]) };
  }

  return null;
}

function isNumberWord(token: string) {
  return (
    digitWords[token] !== undefined ||
    smallNumberWords[token] !== undefined ||
    tensWords[token] !== undefined ||
    token === "HUNDRED" ||
    token === "THOUSAND"
  );
}

function normalizePhoneticAlphanumericCodes(phrase: string, reasons: Set<string>) {
  const before = phrase;
  const phoneticCodePattern = new RegExp(
    `\\b((?:${phoneticLetterWordPattern})(?:\\s+(?:${phoneticLetterWordPattern})){1,2})\\s+(\\d{1,4})\\b`,
    "g"
  );
  const nextPhrase = phrase.replace(phoneticCodePattern, (_match, letterWords: string, digits: string) => {
    const letters = letterWords
      .split(/\s+/)
      .map((word) => phoneticLetterWords[word] ?? "")
      .join("");

    return letters ? `${letters}${digits}` : _match;
  });

  if (nextPhrase !== before) {
    reasons.add("phonetic alphanumeric code normalized");
  }

  return nextPhrase;
}

function normalizeRunwayNumbers(phrase: string, reasons: Set<string>) {
  const nextPhrase = phrase.replace(/\b(RUNWAY|RWY) (\d)([LRC]?)\b/g, "$1 0$2$3");

  if (nextPhrase !== phrase) {
    reasons.add("runway number normalized");
  }

  return nextPhrase;
}

function normalizeProcedureSuffixes(phrase: string, reasons: Set<string>) {
  const nextPhrase = phrase.replace(
    new RegExp(`\\b(\\d+) (${Object.keys(procedureSuffixWords).join("|")})\\b`, "g"),
    (_match, numberText: string, suffixWord: string) => `${numberText}${procedureSuffixWords[suffixWord]}`
  );

  if (nextPhrase !== phrase) {
    reasons.add("procedure suffix normalized");
  }

  return nextPhrase;
}

function normalizeCallsignAtStart(
  phrase: string,
  aircraft: AircraftState[],
  reasons: Set<string>,
  warnings: Set<string>
) {
  if (phrase.startsWith("NEGATIVE ")) {
    const tail = phrase.slice("NEGATIVE ".length);
    const normalizedTail = normalizeCallsignAtStart(tail, aircraft, reasons, warnings);
    return `NEGATIVE ${normalizedTail}`.trim();
  }

  const correctionSplit = phrase.match(/^(.+?)\s+CORRECTION\s+(.+)$/);
  if (correctionSplit) {
    const [, prefix, tail] = correctionSplit;
    const normalizedPrefix = normalizeCallsignAtStart(prefix.trim(), aircraft, reasons, warnings);
    const normalizedTail = normalizeCallsignAtStart(tail, aircraft, reasons, warnings);
    return `${normalizedPrefix} CORRECTION ${normalizedTail}`.trim();
  }

  const activeCandidates = aircraft
    .flatMap((target) => callsignVariants(target.callsign).map((variant) => ({ callsign: target.callsign, variant })))
    .sort((first, second) => second.variant.length - first.variant.length);
  const matches = activeCandidates.filter(({ variant }) => new RegExp(`^${escapeRegex(variant)}(?=\\s|$)`).test(phrase));
  const distinctMatches = new Map(matches.map((match) => [sanitizeCallsign(match.callsign), match]));

  if (distinctMatches.size > 1) {
    warnings.add("ambiguous callsign; kept transcript callsign unchanged");
    return phrase;
  }

  const match = matches[0];
  if (match) {
    const normalizedCallsign = sanitizeCallsign(match.callsign);
    const nextPhrase = phrase.replace(new RegExp(`^${escapeRegex(match.variant)}(?=\\s|$)`), normalizedCallsign);

    if (nextPhrase !== phrase) {
      reasons.add("callsign normalized");
    }

    return nextPhrase;
  }

  const spacedPrefixMatch = phrase.match(/^([A-Z]{2,3}) (\d{2,4})(?=\s|$)/);
  if (spacedPrefixMatch) {
    reasons.add("callsign spacing normalized");
    return phrase.replace(/^([A-Z]{2,3}) (\d{2,4})(?=\s|$)/, "$1$2");
  }

  return phrase;
}

function callsignVariants(rawCallsign: string) {
  const callsign = sanitizeCallsign(rawCallsign);
  const match = callsign.match(/^([A-Z]{2,3})(\d{2,4})$/);

  if (!match) {
    return [callsign];
  }

  const [, prefix, digits] = match;
  const prefixVariants = new Set([
    prefix,
    prefix.split("").join(" "),
    ...telephonyAliasesForIcao(prefix)
  ]);
  const digitVariants = new Set([digits, digits.split("").join(" ")]);
  const variants = new Set<string>([callsign]);

  for (const prefixVariant of prefixVariants) {
    for (const digitVariant of digitVariants) {
      variants.add(`${prefixVariant}${digitVariant}`);
      variants.add(`${prefixVariant} ${digitVariant}`);
    }
  }

  return [...variants].sort((first, second) => second.length - first.length);
}

function normalizeFixAliases(
  phrase: string,
  dataset: RadarDataset,
  reasons: Set<string>,
  warnings: Set<string>
) {
  const knownFixes = new Set(dataset.procedures.fixes.map((fix) => fix.id.toUpperCase()));
  let nextPhrase = phrase;

  for (const { fixId, aliases } of fixAliases) {
    if (!knownFixes.has(fixId)) {
      continue;
    }

    for (const alias of aliases) {
      nextPhrase = nextPhrase.replace(new RegExp(`\\b${escapeRegex(alias)}\\b`, "g"), fixId);
    }
  }

  if (/\bLIM\b/.test(nextPhrase) && knownFixes.has("LIMSO") && knownFixes.has("LIMDI")) {
    warnings.add("ambiguous fix LIM; kept unchanged");
  }

  if (nextPhrase !== phrase) {
    reasons.add("fix name normalized");
  }

  return nextPhrase;
}

function normalizeContextualFixCandidates(
  phrase: string,
  dataset: RadarDataset,
  reasons: Set<string>,
  warnings: Set<string>
) {
  const knownFixes = uniqueStrings(
    dataset.procedures.fixes
      .map((fix) => fix.id.toUpperCase())
      .filter((fixId) => /^[A-Z0-9]{2,6}$/.test(fixId))
  );
  const tokens = phrase.split(" ").filter(Boolean);
  let changed = false;

  if (knownFixes.length === 0 || tokens.length === 0) {
    return phrase;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (!fixContextTriggers.has(tokens[index])) {
      continue;
    }

    let startIndex = index + 1;

    while (startIndex < tokens.length && fixContextStartSkips.has(tokens[startIndex])) {
      startIndex += 1;
    }

    if (tokens[startIndex] === "PASSING") {
      continue;
    }

    const match = bestContextualFixMatch(tokens, startIndex, knownFixes);

    if (!match) {
      continue;
    }

    tokens.splice(startIndex, match.length, match.fixId);
    changed = true;
    index = startIndex;
  }

  const nextPhrase = tokens.join(" ");

  if (changed) {
    reasons.add("context fix candidate normalized");
  }

  if (/\bLIM\b/.test(nextPhrase) && knownFixes.includes("LIMSO") && knownFixes.includes("LIMDI")) {
    warnings.add("ambiguous fix LIM; kept unchanged");
  }

  return nextPhrase;
}

function bestContextualFixMatch(tokens: string[], startIndex: number, knownFixes: string[]) {
  const matches: FixCandidateMatch[] = [];
  const maxSpanLength = Math.min(3, tokens.length - startIndex);

  for (let length = maxSpanLength; length >= 1; length -= 1) {
    const span = tokens.slice(startIndex, startIndex + length);

    if (!isFixCandidateSpan(span)) {
      continue;
    }

    const spanText = span.join(" ");

    for (const fixId of knownFixes) {
      const score = fixCandidateScore(spanText, fixId);

      if (score >= 84) {
        matches.push({ fixId, length, score });
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((first, second) => {
    if (second.score !== first.score) {
      return second.score - first.score;
    }

    if (second.length !== first.length) {
      return second.length - first.length;
    }

    return first.fixId.localeCompare(second.fixId);
  });

  const best = matches[0];
  const rival = matches.find((candidate) => candidate.fixId !== best.fixId);

  if (rival && best.score - rival.score < 5) {
    return null;
  }

  return best;
}

function isFixCandidateSpan(tokens: string[]) {
  if (tokens.length === 0) {
    return false;
  }

  return tokens.every((token) => /^[A-Z0-9]+$/.test(token) && !/^\d+$/.test(token) && !fixContextStopTokens.has(token));
}

function fixCandidateScore(spanText: string, fixId: string) {
  const compactSpan = compactAlnum(spanText);

  if (compactSpan === fixId) {
    return 100;
  }

  const spanKey = canonicalFixSpeechKey(spanText);
  const aliases = fixCandidateAliases(fixId);

  if (aliases.some((alias) => compactAlnum(alias) === compactSpan || canonicalFixSpeechKey(alias) === spanKey)) {
    return 98;
  }

  const fixKey = canonicalFixSpeechKey(fixId);
  const distance = levenshteinDistance(spanKey, fixKey);
  const maxLength = Math.max(spanKey.length, fixKey.length);
  const similarity = maxLength === 0 ? 0 : 1 - distance / maxLength;

  if (maxLength >= 4 && distance <= 1 && similarity >= 0.78) {
    return 90;
  }

  if (maxLength >= 5 && distance <= 2 && similarity >= 0.72) {
    return 84;
  }

  return 0;
}

function fixCandidateAliases(fixId: string) {
  const staticAliases = fixAliases.find((entry) => entry.fixId === fixId)?.aliases ?? [];
  const generatedAliases = generatedFixAliases(fixId);

  return uniqueStrings([fixId, ...staticAliases, ...generatedAliases]);
}

function generatedFixAliases(fixId: string) {
  const aliases = new Set<string>();
  const normalizedFixId = fixId.toUpperCase();
  const alphaNumericMatch = normalizedFixId.match(/^([A-Z]+)(\d+)$/);

  aliases.add(normalizedFixId);
  aliases.add(normalizedFixId.split("").join(" "));

  if (alphaNumericMatch) {
    const [, letters, digits] = alphaNumericMatch;
    const phoneticLetters = letters
      .split("")
      .map(phoneticWordForLetter)
      .filter(Boolean)
      .join(" ");

    aliases.add(`${letters} ${digits}`);
    aliases.add(`${letters.split("").join(" ")} ${digits}`);

    if (phoneticLetters) {
      aliases.add(`${phoneticLetters} ${digits}`);
      aliases.add(`${phoneticLetters} ${digits.split("").join(" ")}`);
    }
  }

  if (/^[A-Z]{4,6}$/.test(normalizedFixId)) {
    for (let splitIndex = 2; splitIndex <= Math.min(3, normalizedFixId.length - 2); splitIndex += 1) {
      aliases.add(`${normalizedFixId.slice(0, splitIndex)} ${normalizedFixId.slice(splitIndex)}`);
    }
  }

  return [...aliases];
}

function phoneticWordForLetter(letter: string) {
  const entry = Object.entries(phoneticLetterWords).find(([, value]) => value === letter.toUpperCase());

  return entry?.[0] ?? "";
}

function canonicalFixSpeechKey(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(canonicalFixSpeechToken)
    .join("");
}

function canonicalFixSpeechToken(token: string) {
  const tokenMap: Record<string, string> = {
    YOU: "YU",
    U: "YU",
    YU: "YU",
    MEAN: "MIN",
    MEN: "MIN",
    MIN: "MIN",
    HUMAN: "YUMIN",
    DACK: "DAK",
    DAK: "DAK",
    DARK: "DAK",
    DOC: "DAK",
    DOCK: "DAK",
    DOK: "DAK",
    DUCK: "DAK",
    P: "PI",
    PE: "PI",
    PEA: "PI",
    PEE: "PI",
    PI: "PI",
    TALL: "TOL",
    TOLL: "TOL",
    TOLE: "TOL",
    TOL: "TOL",
    ALL: "OL",
    SOUL: "SO",
    SOL: "SO",
    SO: "SO",
    DEE: "DI",
    D: "DI",
    CAL: "KAL",
    CALL: "KAL",
    ALFA: "A",
    ALPHA: "A",
    BRAVO: "B",
    CHARLIE: "C",
    DELTA: "D",
    ECHO: "E",
    FOXTROT: "F",
    GOLF: "G",
    HOTEL: "H",
    INDIA: "I",
    JULIET: "J",
    JULIETT: "J",
    KILO: "K",
    LIMA: "L",
    MIKE: "M",
    NOVEMBER: "N",
    OSCAR: "O",
    PAPA: "P",
    QUEBEC: "Q",
    ROMEO: "R",
    SIERRA: "S",
    TANGO: "T",
    UNIFORM: "U",
    VICTOR: "V",
    WHISKEY: "W",
    XRAY: "X",
    YANKEE: "Y",
    ZULU: "Z"
  };

  return tokenMap[token] ?? token;
}

function compactAlnum(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function levenshteinDistance(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_value, index) => index);
  const current = Array.from({ length: second.length + 1 }, () => 0);

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    current[0] = firstIndex;

    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitutionCost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;

      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + substitutionCost
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[second.length] ?? 0;
}

function normalizeCommandAliases(phrase: string, reasons: Set<string>) {
  const before = phrase;
  let nextPhrase = phrase
    .replace(/\bHDG\b/g, "HEADING")
    .replace(/\b(RUNWAY|RWY)(\d{1,2})([LRC]?)\b/g, "$1 $2$3")
    .replace(/\bCANCEL ALTITUDE RESTRICTIONS?\b/g, "CANCEL LEVEL RESTRICTION")
    .replace(/\bCANCEL ALTITUDE\b/g, "CANCEL LEVEL")
    .replace(/\bF\s+L\s+(\d{2,3})\b/g, "FL $1")
    .replace(/\bFL\s*(\d{2,3})\b/g, (_match, level: string) => `${Number(level) * 100}`)
    .replace(/\bCLIMB AND MAINTAIN FLIGHT LEVEL (\d{2,3})\b/g, (_match, level: string) => `CLIMB ${Number(level) * 100}`)
    .replace(/\bDESCEND AND MAINTAIN FLIGHT LEVEL (\d{2,3})\b/g, (_match, level: string) => `DESCEND ${Number(level) * 100}`)
    .replace(/\bMAINTAIN FLIGHT LEVEL (\d{2,3})\b/g, (_match, level: string) => `MAINTAIN ${Number(level) * 100}`)
    .replace(/\bCLIMB TO FLIGHT LEVEL (\d{2,3})\b/g, (_match, level: string) => `CLIMB ${Number(level) * 100}`)
    .replace(/\bDESCEND TO FLIGHT LEVEL (\d{2,3})\b/g, (_match, level: string) => `DESCEND ${Number(level) * 100}`)
    .replace(/\bFLIGHT LEVEL (\d{2,3})\b/g, (_match, level: string) => `${Number(level) * 100}`)
    .replace(/\bCLEAR\s+FOR\s+ILS\b/g, "CLEARED FOR ILS")
    .replace(/\bCLEAR\s+ILS\b/g, "CLEARED ILS")
    .replace(/\bMILES\b/g, "MILE")
    .replace(/\b(\d{1,2})\s+O\s+CLOCK\b/g, "$1 OCLOCK")
    .replace(/\b(\d{1,2})\s+CLOCK\b/g, "$1 OCLOCK")
    .replace(/\bCLIMB AND MAINTAIN (\d{2,5})\b/g, "CLIMB $1")
    .replace(/\bDESCEND AND MAINTAIN (\d{2,5})\b/g, "DESCEND $1")
    .replace(/\bCLIMB TO (\d{2,5})\b/g, "CLIMB $1")
    .replace(/\bDESCEND TO (\d{2,5})\b/g, "DESCEND $1")
    .replace(/\bINCREASE SPEED TO (\d{2,3})\b/g, "INCREASE SPEED $1")
    .replace(/\bINCREASE TO (\d{2,3})\b/g, "INCREASE $1")
    .replace(/\bREDUCE SPEED TO MINIMUM SPEED\b/g, "MINIMUM SPEED")
    .replace(/\bREDUCE SPEED TO MINIMUM\b/g, "MINIMUM SPEED")
    .replace(/\bMAINTAIN MINIMUM SPEED\b/g, "MINIMUM SPEED")
    .replace(/\bTURN (LEFT|RIGHT) (\d{1,3})(?!\s+CIRCLE)\b/g, "TURN $1 HEADING $2")
    .replace(/\b(LEFT|RIGHT) HEADING (\d{1,3})\b/g, "$1 TURN HEADING $2")
    .replace(/\bTURN (LEFT|RIGHT) TURN HEADING (\d{1,3})\b/g, "TURN $1 HEADING $2")
    .replace(/\bPROCEED DIRECT TO\b/g, "PROCEED DIRECT TO")
    .replace(/\bCLEAR(?:ED)? FOR ILS ([ZY]) APPROACH (RUNWAY|RWY) (\d{2}[LRC]?)\b/g, "CLEARED ILS $1 RWY $3 APPROACH")
    .replace(/\bCLEAR(?:ED)? ILS ([ZY]) APPROACH (RUNWAY|RWY) (\d{2}[LRC]?)\b/g, "CLEARED ILS $1 RWY $3 APPROACH")
    .replace(/\bCLEAR(?:ED)? FOR ILS ([ZY]) (RUNWAY|RWY) (\d{2}[LRC]?)\b/g, "CLEARED ILS $1 RWY $3")
    .replace(/\bCLEAR(?:ED)? FOR ILS (RUNWAY|RWY) (\d{2}[LRC]?)\b/g, "CLEARED ILS RWY $2");

  nextPhrase = nextPhrase
    .replace(/\bSWITCH\s+TO\s+TOWER\b/g, "CONTACT TOWER")
    .replace(/\bSWITCH\s+TOWER\b/g, "CONTACT TOWER")
    .replace(/\bCHANGE\s+TO\s+TOWER\b/g, "CONTACT TOWER")
    .replace(/\bCHANGE\s+TOWER\b/g, "CONTACT TOWER")
    .replace(/\bGO\s+TO\s+TOWER\b/g, "CONTACT TOWER")
    .replace(/\bTRANSFER\s+TO\s+TOWER\b/g, "CONTACT TOWER");
  nextPhrase = nextPhrase.replace(/\b(\d{3})\s+(?:DECIMAL|POINT)\s+(\d{1,3})\b/g, "$1 $2");
  nextPhrase = nextPhrase.replace(/\bSPEED (\d{2,3}) KNOTS\b/g, "SPEED $1");

  if (nextPhrase !== before) {
    reasons.add("command phrase normalized");
  }

  return nextPhrase;
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
