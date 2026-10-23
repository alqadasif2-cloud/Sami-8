export function normalizeArabicDigits(str: string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = str;
  for (let i = 0; i <= 9; i++) {
    res = res.split(arabicDigits[i]).join(String(i));
  }
  return res;
}

export interface ParseResult {
  valid: boolean;
  cents?: number;
  error?: string;
}

export function parseToCents(rawInput: string): ParseResult {
  const trimmed = normalizeArabicDigits(
    rawInput
      .trim()
      .replace(/\$/g, '')
      .replace(/،/g, ',')
  );

  if (!trimmed) {
    return { valid: false, error: 'يرجى إدخال نتيجة الصفقة.' };
  }

  const normalized = trimmed.replace(/,/g, '.');
  const match = normalized.match(/^([+-])?(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    return { valid: false, error: 'يرجى إدخال رقم صحيح.' };
  }

  const sign = match[1] === '-' ? -1 : 1;
  const whole = parseInt(match[2], 10);
  if (isNaN(whole)) {
    return { valid: false, error: 'قيمة عددية غير صحيحة.' };
  }

  const fractionStr = (match[3] || '').padEnd(2, '0').slice(0, 2);
  const fraction = parseInt(fractionStr, 10) || 0;
  const totalCents = sign * (whole * 100 + fraction);

  if (totalCents === 0) {
    return { valid: false, error: 'لا يمكن أن تكون نتيجة الصفقة صفراً.' };
  }

  return { valid: true, cents: totalCents };
}

export function parseCapitalToCents(rawInput: string): ParseResult {
  const trimmed = normalizeArabicDigits(
    rawInput
      .trim()
      .replace(/\$/g, '')
      .replace(/،/g, ',')
  );

  if (!trimmed) {
    return { valid: false, error: 'يرجى إدخال قيمة صحيحة.' };
  }

  const normalized = trimmed.replace(/,/g, '.');
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    return { valid: false, error: 'يرجى إدخال رقم صحيح أكبر من صفر.' };
  }

  const whole = parseInt(match[1], 10);
  if (isNaN(whole)) {
    return { valid: false, error: 'قيمة غير صحيحة.' };
  }

  const fractionStr = (match[2] || '').padEnd(2, '0').slice(0, 2);
  const fraction = parseInt(fractionStr, 10) || 0;
  const totalCents = whole * 100 + fraction;

  if (totalCents <= 0) {
    return { valid: false, error: 'يجب أن تكون القيمة أكبر من صفر.' };
  }

  return { valid: true, cents: totalCents };
}

export function formatMoney(cents?: number | null, showSign = false): string {
  if (cents === null || cents === undefined) return '-';
  const isNegative = cents < 0;
  const isPositive = cents > 0;
  const absCents = Math.abs(cents);
  const dollars = Math.floor(absCents / 100);
  const remainder = absCents % 100;

  const formattedDollars = dollars.toLocaleString('en-US');
  const remainderStr = remainder.toString().padStart(2, '0');
  const formattedNumber = `$${formattedDollars}.${remainderStr}`;

  if (isNegative) return `-${formattedNumber}`;
  if (isPositive && showSign) return `+${formattedNumber}`;
  return formattedNumber;
}

export function calculateProgress(currentCents: number, targetCents: number): number {
  if (!targetCents || targetCents <= 0) return 0;
  if (!currentCents || currentCents <= 0) return 0;
  const pct = (currentCents / targetCents) * 100;
  return Math.max(0, Math.min(100, pct));
}
