/**
 * Небольшие цветовые утилиты: смешивание в OKLab (перцептивно равномерно)
 * и выбор цвета текста по контрасту WCAG.
 */

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function rgbToOklab([r, g, b]: RGB): RGB {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin: RGB = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const c = Math.max(0, Math.min(1, v));
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  }) as RGB;
}

/** Смешать два цвета в OKLab: t = 0 → a, t = 1 → b. */
export function mixOklab(a: string, b: string, t: number): string {
  const A = rgbToOklab(hexToRgb(a));
  const B = rgbToOklab(hexToRgb(b));
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(oklabToRgb([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]));
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Белый или почти чёрный текст — что контрастнее на данном фоне. */
export function readableTextOn(background: string, dark = "#111216", light = "#ffffff"): string {
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

// Значения совпадают с токенами --div-* в globals.css.
export const DIVERGING = { neg: "#c22e2a", mid: "#efeeea", pos: "#1a56a0" } as const;

/**
 * Цвет ячейки тепловой карты по успешности (0..1).
 * Нейтральная середина — между порогами среднего и высокого уровней;
 * ниже — красное плечо, выше — синее.
 */
export function divergingColor(rate: number, thresholds: { medium: number; high: number }): string {
  const pct = rate * 100;
  const mid = (thresholds.medium + thresholds.high) / 2;
  const low = Math.max(0, thresholds.medium - 30);
  if (pct <= mid) {
    const t = mid === low ? 1 : (mid - pct) / (mid - low);
    return mixOklab(DIVERGING.mid, DIVERGING.neg, t);
  }
  const t = mid >= 100 ? 1 : (pct - mid) / (100 - mid);
  return mixOklab(DIVERGING.mid, DIVERGING.pos, t);
}
