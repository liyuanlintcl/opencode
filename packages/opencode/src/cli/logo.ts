export type LogoShape = {
  left: string[]
  right: string[]
  overlapped?: boolean
}

const LOGO_NAME =
  typeof process !== "undefined" ? process.env.LOGO_NAME ?? "Omni" : "Omni"

// Bitmap font extracted from the original hand-crafted "opencode" logo.
// Each glyph is 4 rows. Most are 4 columns wide; m needs 5, i needs 3
// to remain legible at this height. Glyphs are spaced by one blank
// column when concatenated so the word stays readable.
const FONT: Record<string, string[]> = {
  // Extracted from the original logo
  o: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
  p: ["    ", "█▀▀█", "█__█", "█▀▀▀"],
  e: ["    ", "█▀▀█", "█^^^", "▀▀▀▀"],
  n: ["    ", "█▀▀▄", "█__█", "▀  ▀"],
  c: ["    ", "█▀▀▀", "█___", "▀▀▀▀"],
  d: ["   ▄", "█▀▀█", "█__█", "▀▀▀▀"],

  // New glyphs in the same style
  a: ["    ", "█▀▀ ", "█  █", "▀▀▀█"],
  b: ["▄   ", "█▀▀█", "█__█", "▀▀▀▀"],
  f: ["    ", "█▀▀▀", "█^^^", "█   "],
  g: ["    ", "█▀▀█", "█__█", "▄▄▄█"],
  h: ["▄   ", "█▀▀▄", "█__█", "▀  ▀"],
  i: [" ", "▀", "█", "▀"],
  j: ["  ", " █", " █", "▀▀"],
  k: ["    ", "█  █", "█_▀▄", "▀__▀"],
  l: [" ", "█", "█", "▀"],
  m: ["     ", "▄▀█▀▄", "█_█_█", "▀ ▀ ▀"],
  q: ["    ", "█▀▀█", "█__█", "▀▀▀█"],
  r: ["    ", "█▄▀▀", "█__ ", "▀   "],
  s: ["    ", "█▀▀▀", "▀▀▀█", "▀~~▀"],
  t: ["    ", "▄█▄▄", " █_ ", " ▀▀▀"],
  u: ["    ", "█  █", "█__█", "▀▀▀▀"],
  v: ["     ", "█   █", " █_█ ", "  ▀  "],
  w: ["     ", "█ █ █", "█_█_█", " ▀▀▀ "],
  x: ["     ", "▀▄ ▄▀", " ▄▀▄ ", "▀   ▀"],
  y: ["     ", "▀▄ ▄▀", "  █  ", "  ▀  "],
  z: ["     ", "▀▀▀█▀", " ▄▀  ", "▀▀▀▀▀"],

}

function concatGlyphs(glyphs: string[][], isCaps: boolean[]): LogoShape {
  const height = 4
  const left: string[] = []
  const right: string[] = []
  for (let row = 0; row < height; row++) {
    let leftRow = ""
    let rightRow = ""
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i]!
      const caps = isCaps[i]!
      const cell = glyph[row] ?? ""
      const width = cell.length
      if (caps) {
        leftRow += " ".repeat(width)
        rightRow += cell
      } else {
        leftRow += cell
        rightRow += " ".repeat(width)
      }
      if (i < glyphs.length - 1) {
        leftRow += " "
        rightRow += " "
      }
    }
    left.push(leftRow)
    right.push(rightRow)
  }
  return { left, right, overlapped: true }
}

export function renderLogo(text: string): LogoShape {
  const chars = text.split("")
  const glyphs = chars.map((ch) => {
    const lower = ch.toLowerCase()
    const glyph = FONT[lower]
    if (glyph === undefined) {
      throw new Error(`Unsupported character in logo: "${ch}"`)
    }
    return glyph
  })
  const isCaps = chars.map((ch) => ch !== ch.toLowerCase())
  return concatGlyphs(glyphs, isCaps)
}

export const logo = renderLogo(LOGO_NAME)
export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}
export const marks = "_^~,"
