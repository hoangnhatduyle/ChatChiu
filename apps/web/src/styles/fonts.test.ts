// Step 3.1: self-hosted fonts with Vietnamese diacritics (F-AP-05, CSP font-src 'self').
import plexRanges from '@fontsource/ibm-plex-mono/unicode.json'
import interRanges from '@fontsource/inter-tight/unicode.json'
import fontsCss from './fonts.css?raw'

type Face = { family: string; weight: number; src: string; range: string; display: string }

const faces: Face[] = [
  ...fontsCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@font-face\s*\{([^}]*)\}/g),
].map(([, body = '']) => {
  // Prettier wraps long declarations, so whitespace inside a value is collapsed before comparing.
  const get = (prop: string) =>
    (body.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`))?.[1] ?? '').replace(/\s+/g, ' ').trim()
  return {
    family: get('font-family').replace(/['"]/g, ''),
    weight: Number(get('font-weight')),
    src: get('src'),
    range: get('unicode-range').replace(/\s/g, ''),
    display: get('font-display'),
  }
})

const parseRange = (range: string): Array<[number, number]> =>
  range.split(',').map((part) => {
    const [lo = '', hi = lo] = part.trim().replace(/^U\+/i, '').split('-')
    return [parseInt(lo, 16), parseInt(hi, 16)]
  })

const covers = (family: string, weight: number, text: string) => {
  const ranges = faces
    .filter((f) => f.family === family && f.weight === weight)
    .flatMap((f) => parseRange(f.range))
  return [...text].filter((ch) => {
    const cp = ch.codePointAt(0) ?? 0
    return !ranges.some(([lo, hi]) => cp >= lo && cp <= hi)
  })
}

const BRAND = 'Chắt Chiu'
const VIETNAMESE =
  'ĂÂĐÊÔƠƯăâđêôơư àáảãạ ằắẳẵặ ấầẩẫậ èéẻẽẹ ềếểễệ ìíỉĩị òóỏõọ ồốổỗộ ờớởỡợ ùúủũụ ừứửữự ỳýỷỹỵ ' +
  'ÀÁẢÃẠ ẰẮẲẴẶ ẤẦẨẪẬ ỀẾỂỄỆ ỒỐỔỖỘ ỜỚỞỠỢ ỪỨỬỮỰ'
// Some Vietnamese keyboards type a precomposed vowel plus a combining tone mark
// ("â" + U+0301 instead of "ấ"). The subsets cover those five tone marks; fully decomposed
// breve / circumflex / horn are not in any @fontsource subset, and input is not typed that way.
const COMBINING_TONES = 'â\u0301 ơ\u0300 ư\u0303 ă\u0309 ê\u0323 a\u0301'
const UI_WEIGHTS = [400, 500, 600, 700, 800]
const MONO_WEIGHTS = [500, 600]

describe('fonts.css', () => {
  it.each(UI_WEIGHTS)(
    'F-AP-05: Inter Tight %i covers "Chắt Chiu", the Vietnamese alphabet and combining tone marks',
    (weight) => {
      const text = `${BRAND} ${VIETNAMESE} ${COMBINING_TONES} 0123456789 %·—`
      expect(covers('Inter Tight', weight, text)).toEqual([])
    },
  )

  it.each(MONO_WEIGHTS)('F-AP-05: IBM Plex Mono %i covers numbers and Vietnamese', (weight) => {
    expect(covers('IBM Plex Mono', weight, `0123456789 %.,/ ${VIETNAMESE}`)).toEqual([])
  })

  it("F-AP-05: every face is self-hosted woff2 from @fontsource (CSP font-src 'self')", () => {
    expect(faces.length).toBeGreaterThan(0)
    for (const face of faces) {
      expect(face.src).toMatch(
        /^url\('@fontsource\/[a-z-]+\/files\/[a-z0-9-]+\.woff2'\) format\('woff2'\)$/,
      )
      expect(face.src).not.toMatch(/https?:/)
    }
    expect(fontsCss).not.toMatch(/@import|https?:\/\//)
  })

  it('F-AP-05: each face uses font-display swap', () => {
    expect(faces.every((f) => f.display === 'swap')).toBe(true)
  })

  it("F-AP-05: unicode-range matches @fontsource's subset ranges (no drift)", () => {
    const expected: Record<string, Record<string, string>> = {
      'Inter Tight': interRanges,
      'IBM Plex Mono': plexRanges,
    }
    for (const face of faces) {
      const subset = face.src.match(/-(latin|vietnamese)-\d{3}-normal\.woff2/)?.[1] ?? ''
      expect(face.range).toBe(expected[face.family]?.[subset])
    }
  })

  it('loads only the latin and vietnamese subsets at the weights the UI uses', () => {
    const keys = faces.map((f) => `${f.family} ${f.weight}`).sort()
    const want = [
      ...UI_WEIGHTS.map((w) => `Inter Tight ${w}`),
      ...MONO_WEIGHTS.map((w) => `IBM Plex Mono ${w}`),
    ].flatMap((k) => [k, k])
    expect(keys).toEqual(want.sort())
  })
})
