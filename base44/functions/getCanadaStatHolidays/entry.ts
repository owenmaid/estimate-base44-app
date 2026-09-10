import { createClientFromRequest } from 'npm:@base44/sdk@0.8.45';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 3660;

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const FEDERAL = 'Federal';
const NATIONWIDE = [...PROVINCES];

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));
const shiftDate = (date: Date, days: number) => utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days);
const union = (...groups: string[][]) => [...new Set(groups.flat())].sort();
const provincesLabel = (codes: string[]) => codes.length === PROVINCES.length ? FEDERAL : codes.join(', ');
const holiday = (date: Date, name: string, provinces: string[]) => ({ date: toIsoDate(date), name, provinces: provincesLabel(provinces) });

const nthWeekday = (year: number, month: number, weekday: number, occurrence: number) => {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, month, 1 + offset + ((occurrence - 1) * 7));
};

const lastWeekday = (year: number, month: number, weekday: number) => {
  const last = utcDate(year, month + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return utcDate(year, month, last.getUTCDate() - offset);
};

const mondayBefore = (year: number, month: number, day: number) => {
  const date = utcDate(year, month, day);
  const daysBack = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date;
};

const nearestMonday = (date: Date) => {
  const day = date.getUTCDay();
  if (day === 1) return date;
  if (day === 0) return shiftDate(date, 1);
  return shiftDate(date, (8 - day) % 7);
};

const observedFixedHoliday = (year: number, month: number, day: number) => {
  const actual = utcDate(year, month, day);
  if (actual.getUTCDay() === 0) return shiftDate(actual, 1);
  if (actual.getUTCDay() === 6) return shiftDate(actual, 2);
  return actual;
};

const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const g = Math.floor((8 * b + 13) / 25);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 19 * l) / 433);
  const month = Math.floor((h + l - 7 * m + 90) / 25);
  const day = (h + l - 7 * m + 33 * month + 19) % 32;
  return utcDate(year, month - 1, day);
};

const allCanadaHolidaysForYear = (year: number) => {
  const easter = easterSunday(year);
  const goodFriday = shiftDate(easter, -2);
  const easterMonday = shiftDate(easter, 1);
  const civicHoliday = nthWeekday(year, 7, 1, 1);
  const nationalDayTruthReconciliation = observedFixedHoliday(year, 8, 30);
  const remembranceDay = observedFixedHoliday(year, 10, 11);
  const christmasDay = observedFixedHoliday(year, 11, 25);
  const boxingDay = observedFixedHoliday(year, 11, 26);

  return [
    holiday(observedFixedHoliday(year, 0, 1), "New Year's Day", NATIONWIDE),
    holiday(nthWeekday(year, 1, 1, 3), 'Alberta Family Day', ['AB']),
    holiday(nthWeekday(year, 1, 1, 3), 'Louis Riel Day', ['MB']),
    holiday(nthWeekday(year, 1, 1, 3), 'Nova Scotia Heritage Day', ['NS']),
    holiday(goodFriday, 'Good Friday', ['AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']),
    holiday(easterMonday, 'Easter Monday', ['QC']),
    holiday(nthWeekday(year, 4, 1, 3), 'National Patriots\' Day', ['QC']),
    holiday(mondayBefore(year, 4, 24), 'Victoria Day', ['AB', 'BC', 'MB', 'NT', 'NU', 'ON', 'PE', 'SK', 'YT']),
    holiday(mondayBefore(year, 4, 25), 'National Patriots\' Day', ['QC']),
    holiday(nthWeekday(year, 5, 5, 3), 'Discovery Day', ['YT']),
    holiday(nthWeekday(year, 5, 0, 3), 'Father\'s Day', ['NB']),
    holiday(observedFixedHoliday(year, 6, 1), 'Canada Day', NATIONWIDE),
    holiday(civicHoliday, 'Civic Holiday', ['NT', 'NU']),
    holiday(civicHoliday, 'British Columbia Day', ['BC']),
    holiday(civicHoliday, 'Heritage Day', ['AB']),
    holiday(civicHoliday, 'Terry Fox Day', ['MB']),
    holiday(civicHoliday, 'New Brunswick Day', ['NB']),
    holiday(civicHoliday, 'Natal Day', ['NS']),
    holiday(civicHoliday, 'Saskatchewan Day', ['SK']),
    holiday(nthWeekday(year, 7, 1, 3), 'Gold Cup Parade Day', ['PE']),
    holiday(nthWeekday(year, 7, 1, 3), 'Discovery Day', ['YT']),
    holiday(nthWeekday(year, 8, 1, 1), 'Labour Day', NATIONWIDE),
    holiday(nationalDayTruthReconciliation, 'National Day for Truth and Reconciliation', ['BC', 'NB', 'NL', 'NT', 'NS', 'NU', 'PE', 'YT', 'Federal']),
    holiday(nthWeekday(year, 9, 1, 2), 'Thanksgiving Day', ['AB', 'BC', 'MB', 'NB', 'NT', 'NU', 'ON', 'PE', 'SK', 'YT']),
    holiday(remembranceDay, 'Remembrance Day', ['BC', 'NB', 'NL', 'NT', 'NU', 'PE', 'SK', 'YT']),
    holiday(christmasDay, 'Christmas Day', NATIONWIDE),
    holiday(boxingDay, 'Boxing Day', ['NB', 'NL', 'NT', 'NU', 'ON', 'PE']),
    holiday(lastWeekday(year, 11, 1), 'St. Stephen\'s Day', ['MB']),
  ];
};

const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value ? null : date;
};

const normalizeProvince = (value: unknown) => {
  if (value == null || value === '') return null;
  const province = String(value).toUpperCase();
  return PROVINCES.includes(province) ? province : null;
};

const matchesProvince = (holidayProvinces: string, province: string | null) => {
  if (!province) return true;
  if (holidayProvinces === FEDERAL) return true;
  return holidayProvinces.split(',').map((code) => code.trim()).includes(province);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { startDate, endDate, province } = await req.json();
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    const normalizedProvince = normalizeProvince(province);

    if (!start || !end) {
      return Response.json({ error: 'startDate and endDate must use YYYY-MM-DD.' }, { status: 400 });
    }
    if (end < start) {
      return Response.json({ error: 'endDate cannot be earlier than startDate.' }, { status: 400 });
    }
    if ((end.getTime() - start.getTime()) / 86400000 > MAX_RANGE_DAYS) {
      return Response.json({ error: 'Date range cannot exceed 10 years.' }, { status: 400 });
    }
    if (province != null && province !== '' && !normalizedProvince) {
      return Response.json({ error: 'province must be a valid Canadian province or territory code.' }, { status: 400 });
    }

    const holidays = [];
    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
      holidays.push(...allCanadaHolidaysForYear(year));
    }

    return Response.json({
      province: normalizedProvince ?? 'ALL',
      holidays: holidays.filter(({ date, provinces }) => date >= startDate && date <= endDate && matchesProvince(provinces, normalizedProvince)),
    });
  } catch (error) {
    console.error('Unable to calculate statutory holidays:', error);
    return Response.json({ error: 'Unable to calculate statutory holidays.' }, { status: 500 });
  }
});
