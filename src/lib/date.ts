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

/** Aceita apenas AAAA-MM-DD com ano plausível e data calendarística válida (evita loops gigantes / anos absurdos). */
export function parseSafeIsoDateYmd(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Limite de segurança para laços dia-a-dia (filtros / geração automática). */
export const MAX_SAFE_DATE_RANGE_DAYS = 400;

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
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatDateYmd(parsed);
}

export function formatYmdPtBr(ymd: string): string {
  return parseYmd(ymd).toLocaleDateString('pt-BR');
}

/**
 * Regra de jornada:
 * - segunda a sexta: 1.0
 * - sábado: 0.5
 * - domingo: 0.0
 */
export function getBusinessDayFactorFromDate(date: Date): number {
  const weekDay = date.getDay();
  if (weekDay === 0) return 0;
  if (weekDay === 6) return 0.5;
  return 1;
}

export function getBusinessDayFactorFromYmd(ymd: string): number {
  const dt = parseYmd(ymd);
  return getBusinessDayFactorFromDate(dt);
}

export function getMonthBusinessUnitsFromYmd(ymd: string): number {
  const base = parseYmd(ymd);
  const year = base.getFullYear();
  const month = base.getMonth();
  const monthEnd = new Date(year, month + 1, 0).getDate();
  let units = 0;
  for (let day = 1; day <= monthEnd; day += 1) {
    units += getBusinessDayFactorFromDate(new Date(year, month, day));
  }
  return units;
}
