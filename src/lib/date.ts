export function formatDateYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayYmd(): string {
  return formatDateYmd(new Date());
}

export function parseYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function shiftDaysYmd(base: Date, diffDays: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + diffDays);
  return formatDateYmd(d);
}

export function dayStartIsoFromYmd(ymd: string): string {
  const d = parseYmd(ymd);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function dayEndIsoFromYmd(ymd: string): string {
  const d = parseYmd(ymd);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function toDateTimeYmd(value: string | null | undefined): string {
  if (!value) return todayYmd();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return todayYmd();
  return formatDateYmd(parsed);
}

export function formatYmdPtBr(ymd: string): string {
  return parseYmd(ymd).toLocaleDateString('pt-BR');
}
