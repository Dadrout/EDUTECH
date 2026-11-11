/** Разбор значений ячеек. Каждая функция возвращает null для недопустимого значения. */

const TRUE_VALUES = new Set([
  "1", "1.0", "true", "t", "yes", "y", "да", "д", "верно", "правильно", "истина", "+",
  "иә", "дұрыс", "是", "对", "正确", "sí", "si", "verdadero", "correcto", "oui", "vrai", "juste", "ja", "wahr", "richtig", "evet", "doğru", "dogru", "ha", "toʻgʻri", "to'g'ri",
]);
const FALSE_VALUES = new Set([
  "0", "0.0", "false", "f", "no", "n", "нет", "н", "неверно", "неправильно", "ложь", "-",
  "жоқ", "қате", "否", "错", "错误", "falso", "incorrecto", "non", "faux", "nein", "falsch", "hayır", "hayir", "yanlış", "yanlis", "yoʻq", "yo'q", "notoʻgʻri", "noto'g'ri",
]);

export function parseBoolean(value: string): boolean | null {
  const v = value.trim().toLowerCase().replace(",", ".");
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return null;
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ГГГГ-ММ-ДД (в т.ч. с временем) или ДД.ММ.ГГГГ → ISO ГГГГ-ММ-ДД. */
export function parseDate(value: string): string | null {
  const v = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(v);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
}

/** Параллель: целое 1–12. */
export function parseGrade(value: string): number | null {
  const v = value.trim().replace(/\s*(класс|кл\.?)$/i, "");
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 12 ? n : null;
}

/** Параллель из кода класса: «7А» → 7, «10-Б» → 10. */
export function gradeFromClassId(classId: string): number | null {
  const m = /^\s*(\d{1,2})/.exec(classId);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : null;
}

/** Неотрицательное число (допускается десятичная запятая). */
export function parseNonNegativeNumber(value: string): number | null {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function isHalfHourMultiple(n: number): boolean {
  return Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
}
