import { BRAND } from "@opencode-ai/core/global"

export type LogoShape = {
  left: string[]
  right: string[]
}

// Bitmap font extracted from the original hand-crafted "opencode" logo.
// Each glyph is 4 rows. Most are 4 columns wide; m needs 5, i needs 3
// to remain legible at this height. Glyphs are spaced by one blank
// column when concatenated so the word stays readable.
const FONT: Record<string, string[]> = {
  // Extracted from the original logo
  o: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
  p: ["    ", "█▀▀█", "█__█", "█▀▀▀"],
  e: ["    ", "█▀▀█", "█^^^", "▀▀▀▀"],
  n: ["    ", "█▀▀▄", "█__█", "▀~~▀"],
  c: ["    ", "█▀▀▀", "█___", "▀▀▀▀"],
  d: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],

  // New glyphs in the same style
  a: ["    ", "█▀▀█", "█__█", "▀▀▀█"],
  b: ["    ", "█▀▀█", "█__█", "█▀▀▀"],
  f: ["    ", "████", "█___", "█   "],
  g: ["    ", "█▀▀█", "█__█", "▀▀▀█"],
  h: ["    ", "█▀▀▀", "█__█", "█__█"],
  i: [" █ ", "   ", " █ ", " █ "],
  j: ["   ", "  █", "  █", "███"],
  k: ["    ", "█  █", "█_█ ", "█__█"],
  l: ["    ", " █  ", " █  ", " █  "],
  m: ["     ", "█▀█▀█", "█_█_█", "▀~▀~▀"],
  q: ["    ", "█▀▀█", "█__█", "▀▀▀█"],
  r: ["    ", "████", "█___", "█   "],
  s: ["    ", " ███", "██_ ", " ███"],
  t: ["    ", "████", " █_ ", " ███"],
  u: ["    ", "█  █", "█  █", "▀▀▀▀"],
  v: ["    ", "█  █", "█  █", " ▀▀ "],
  w: ["    ", "█  █", "█ ██", "▀▀▀▀"],
  x: ["    ", "█  █", " ██ ", "█  █"],
  y: ["    ", "█  █", "█__█", "   █"],
  z: ["    ", "████", " _█ ", "████"],
  " ": ["    ", "    ", "    ", "    "],
  "0": ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
  "1": ["   ", " █ ", "██ ", " █ "],
  "2": ["    ", "████", "  _█", "████"],
  "3": ["    ", "████", "  ██", "████"],
  "4": ["█  █", "█  █", "████", "   █"],
  "5": ["    ", "████", "██_ ", "████"],
  "6": ["    ", "█   ", "████", "▀▀▀▀"],
  "7": ["    ", "████", "   █", "  █ "],
  "8": ["    ", "█▀▀█", "█^^█", "▀▀▀▀"],
  "9": ["    ", "█▀▀█", "█^^█", "   █"],
  "-": ["    ", "████", "    ", "    "],
  _: ["    ", "    ", "    ", "████"],
  ".": ["    ", "    ", "    ", " █  "],
  "?": ["    ", "█▀▀█", "  _█", " █  "],
}

function concatGlyphs(glyphs: string[][]): string[] {
  const height = 4
  const result: string[] = []
  for (let row = 0; row < height; row++) {
    const parts: string[] = []
    for (let i = 0; i < glyphs.length; i++) {
      parts.push(glyphs[i][row] ?? "")
      if (i < glyphs.length - 1) parts.push(" ")
    }
    result.push(parts.join(""))
  }
  return result
}

export function renderLogo(text: string, splitAt?: number): LogoShape {
  const chars = text.toLowerCase().split("")
  const glyphs = chars.map((ch) => FONT[ch] ?? FONT["?"] ?? FONT[" "])

  if (splitAt === undefined || splitAt <= 0 || splitAt >= chars.length) {
    return { left: concatGlyphs(glyphs), right: ["", "", "", ""] }
  }

  return {
    left: concatGlyphs(glyphs.slice(0, splitAt)),
    right: concatGlyphs(glyphs.slice(splitAt)),
  }
}

export const logo = renderLogo(BRAND)
export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}
export const marks = "_^~,"
