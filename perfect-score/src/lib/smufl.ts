// SMuFL(Standard Music Font Layout) 코드포인트 — Bravura 폰트로 렌더링한다.
// 규약: font-size 1em = 오선 높이(4칸). 글리프 기준점(baseline)은 오선의 해당 줄에 맞춘다.
// 2단계(스마트 필기)에서 손글씨 인식 결과를 이 글리프로 치환한다.
// 전체 목록: https://w3c.github.io/smufl/latest/tables/

export const SMUFL = {
  // 음자리표
  gClef: '',
  fClef: '',
  cClef: '',
  // 음표 머리
  noteheadWhole: '',
  noteheadHalf: '',
  noteheadBlack: '',
  noteheadXBlack: '',
  noteheadSlashHorizontalEnds: '',
  // 완성형 음표(줄기 포함)
  noteWhole: '',
  noteHalfUp: '',
  noteQuarterUp: '',
  note8thUp: '',
  note16thUp: '',
  // 꼬리
  flag8thUp: '',
  flag8thDown: '',
  flag16thUp: '',
  flag16thDown: '',
  // 쉼표
  restWhole: '',
  restHalf: '',
  restQuarter: '',
  rest8th: '',
  rest16th: '',
  // 임시표
  accidentalFlat: '',
  accidentalNatural: '',
  accidentalSharp: '',
  // 아티큘레이션
  articAccentAbove: '',
  articStaccatoAbove: '',
  articTenutoAbove: '',
  articMarcatoAbove: '',
  fermataAbove: '',
  // 반복/구조
  repeatLeft: '',
  repeatRight: '',
  segno: '',
  coda: '',
  repeat1Bar: '',
  // 페달
  keyboardPedalPed: '',
  keyboardPedalUp: '',
  // 셈여림
  dynamicPiano: '',
  dynamicMezzo: '',
  dynamicForte: '',
} as const;

export type SmuflGlyph = keyof typeof SMUFL;

export const MUSIC_FONT_FAMILY = 'Bravura';

// 코드 네임의 #, b 를 SMuFL 임시표로 바꿔 악보 폰트처럼 보이게 한다. (예: "F#m7b5")
export function chordSymbolParts(text: string): { text: string; glyph: boolean }[] {
  const parts: { text: string; glyph: boolean }[] = [];
  for (const [i, ch] of [...text].entries()) {
    const isAccidental = i > 0 && (ch === '#' || ch === 'b' || ch === '♯' || ch === '♭');
    // 'b' 는 루트 바로 뒤나 숫자 앞일 때만 플랫으로 본다(예: Bb, E7b9). 'sub', 'dim' 등은 제외.
    if (isAccidental && ch === 'b' && !/[A-G0-9]/.test(text[i - 1] ?? '')) {
      parts.push({ text: ch, glyph: false });
      continue;
    }
    if (isAccidental) parts.push({ text: ch === '#' || ch === '♯' ? SMUFL.accidentalSharp : SMUFL.accidentalFlat, glyph: true });
    else parts.push({ text: ch, glyph: false });
  }
  return parts;
}

// 폰트가 실제로 로드되었는지 확인(오프라인 캐시 점검용).
export async function ensureMusicFont(): Promise<boolean> {
  if (!('fonts' in document)) return false;
  try {
    await document.fonts.load(`32px ${MUSIC_FONT_FAMILY}`, SMUFL.gClef);
    return document.fonts.check(`32px ${MUSIC_FONT_FAMILY}`, SMUFL.gClef);
  } catch {
    return false;
  }
}
