import { describe, expect, it } from 'vitest';
import { chordSymbolParts, SMUFL } from './smufl';

describe('chordSymbolParts', () => {
  it('#/b 를 SMuFL 임시표로 바꾼다', () => {
    const parts = chordSymbolParts('F#m7b5');
    expect(parts.map((p) => p.text).join('')).toBe(`F${SMUFL.accidentalSharp}m7${SMUFL.accidentalFlat}5`);
  });
  it('루트의 b 는 바꾸지 않는다', () => {
    expect(chordSymbolParts('Bb')[0]).toEqual({ text: 'B', glyph: false });
    expect(chordSymbolParts('Bb')[1].glyph).toBe(true);
    expect(chordSymbolParts('Csub').some((p) => p.glyph)).toBe(false);
  });
});
