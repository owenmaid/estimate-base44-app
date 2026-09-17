import { createClientFromRequest } from 'npm:@base44/sdk@0.8.45';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 3660;

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));

const nthWeekday = (year: number, month: number, weekday: number, occurrence: number) => {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, month, 1 + offset + ((occurrence - 1) * 7));
};

const mondayBefore = (year: number, month: number, day: number) => {
  const date = utcDate(year, month, day);
  const daysBack = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date;
};

// Monday closest to a given date (used by NL for several holidays).
const nearestMonday = (year: number, month: number, day: number) => {
  const date = utcDate(year, month, day);
  let diff = 1 - date.getUTCDay();
  if (diff < -3) diff += 7;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
};

// Anonymous Gregorian computus.
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

const goodFriday = (year: number) => {
  const e = easterSunday(year);
  e.setUTCDate(e.getUTCDate() - 2);
  return e;
};

type HolidayRule = { name: string; date: (year: number) => Date };

// Common holidays shared by most provinces.
const newYears = (): HolidayRule => ({ name: "New Year's Day", date: (y) => utcDate(y, 0, 1) });
const goodFridayRule = (): HolidayRule => ({ name: 'Good Friday', date: (y) => goodFriday(y) });
const canadaDay = (): HolidayRule => ({ name: 'Canada Day', date: (y) => utcDate(y, 6, 1) });
const labourDay = (): HolidayRule => ({ name: 'Labour Day', date: (y) => nthWeekday(y, 8, 1, 1) });
const thanksgiving = (): HolidayRule => ({ name: 'Thanksgiving Day', date: (y) => nthWeekday(y, 9, 1, 2) });
const remembranceDay = (): HolidayRule => ({ name: 'Remembrance Day', date: (y) => utcDate(y, 10, 11) });
const christmas = (): HolidayRule => ({ name: 'Christmas Day', date: (y) => utcDate(y, 11, 25) });
const boxingDay = (): HolidayRule => ({ name: 'Boxing Day', date: (y) => utcDate(y, 11, 26) });
const victoriaDay = (): HolidayRule => ({ name: 'Victoria Day', date: (y) => mondayBefore(y, 4, 24) });
const familyDay = (label = 'Family Day'): HolidayRule => ({
  name: label,
  date: (y) => nthWeekday(y, 1, 1, 3),
});

const PROVINCE_HOLIDAYS: Record<string, HolidayRule[]> = {
  AB: [
    newYears(),
    familyDay('Alberta Family Day'),
    goodFridayRule(),
    victoriaDay(),
    canadaDay(),
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
  ],
  BC: [
    newYears(),
    familyDay('Family Day'),
    goodFridayRule(),
    victoriaDay(),
    canadaDay(),
    { name: 'B.C. Day', date: (y) => nthWeekday(y, 7, 1, 1) },
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
  ],
  MB: [
    newYears(),
    { name: 'Louis Riel Day', date: (y) => nthWeekday(y, 1, 1, 3) },
    goodFridayRule(),
    victoriaDay(),
    canadaDay(),
    { name: 'Terry Fox Day', date: (y) => nthWeekday(y, 7, 1, 1) },
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
  ],
  NB: [
    newYears(),
    goodFridayRule(),
    victoriaDay(),
    canadaDay(),
    { name: 'New Brunswick Day', date: (y) => nthWeekday(y, 7, 1, 1) },
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
    boxingDay(),
  ],
  NL: [
    newYears(),
    { name: "St. Patrick's Day", date: (y) => nearestMonday(y, 2, 17) },
    goodFridayRule(),
    { name: 'Discovery Day', date: (y) => nearestMonday(y, 5, 24) },
    canadaDay(),
    { name: "Orangemen's Day", date: (y) => nearestMonday(y, 6, 12) },
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
  ],
  NS: [
    newYears(),
    goodFridayRule(),
    victoriaDay(),
    canadaDay(),
    { name: 'Natal Day', date: (y) => nthWeekday(y, 7, 1, 1) },
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
  ],
  NT: [
    newYears(),
    goodFridayRule(),
    victoriaDay(),
    { name: 'National Indigenous Peoples Day', date: (y) => utcDate(y, 5, 21) },
    canadaDay(),
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
  ],
  NU: [
    newYears(),
    goodFridayRule(),
    victoriaDay(),
    { name: 'Nunavut Day', date: (y) => utcDate(y, 6, 9) },
    canadaDay(),
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
  ],
  ON: [
    newYears(),
    familyDay('Family Day'),
    goodFridayRule(),
    victoriaDay(),
    canadaDay(),
    { name: 'Civic Holiday', date: (y) => nthWeekday(y, 7, 1, 1) },
    labourDay(),
    thanksgiving(),
    christmas(),
    boxingDay(),
  ],
  PE: [
    newYears(),
    { name: 'Islander Day', date: (y) => nthWeekday(y, 1, 1, 3) },
    goodFridayRule(),
    victoriaDay(),
    canadaDay(),
    { name: 'Gold Cup Parade Day', date: (y) => nthWeekday(y, 7, 1, 3) },
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
    boxingDay(),
  ],
  QC: [
    newYears(),
    goodFridayRule(),
    { name: 'National Patriots Day', date: (y) => mondayBefore(y, 4, 24) },
    { name: 'St. Jean Baptiste Day', date: (y) => utcDate(y, 5, 24) },
    canadaDay(),
    labourDay(),
    thanksgiving(),
    christmas(),
  ],
  SK: [
    newYears(),
    familyDay('Family Day'),
    goodFridayRule(),
    victoriaDay(),
    canadaDay(),
    { name: 'Saskatchewan Day', date: (y) => nthWeekday(y, 7, 1, 1) },
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
  ],
  YT: [
    newYears(),
    { name: 'Heritage Day', date: (y) => {
      // Friday before the last Sunday in February
      const lastDay = utcDate(y, 1, 28);
      let lastSunday = lastDay;
      while (lastSunday.getUTCDay() !== 0) {
        lastSunday = utcDate(y, 1, lastSunday.getUTCDate() + 1);
        if (lastSunday.getUTCMonth() > 1) break;
      }
      const friday = new Date(lastSunday);
      friday.setUTCDate(lastSunday.getUTCDate() - 2);
      return friday;
    }},
    goodFridayRule(),
    victoriaDay(),
    { name: 'National Indigenous Peoples Day', date: (y) => utcDate(y, 5, 21) },
    canadaDay(),
    { name: 'Discovery Day', date: (y) => nthWeekday(y, 7, 1, 3) },
    labourDay(),
    thanksgiving(),
    remembranceDay(),
    christmas(),
  ],
};

const PROVINCE_NAMES: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
};

const holidaysForYear = (year: number, province: string): Array<{ date: string; name: string; provinces: string }> => {
  const rules = PROVINCE_HOLIDAYS[province];
  if (!rules) return [];
  return rules.map((rule) => ({ date: toIsoDate(rule.date(year)), name: rule.name, provinces: province }));
};

const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value ? null : date;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { startDate, endDate, province = 'AB' } = await req.json();
    const provinceCode = String(province).toUpperCase();

    if (!PROVINCE_HOLIDAYS[provinceCode]) {
      const supported = Object.keys(PROVINCE_HOLIDAYS).join(', ');
      return Response.json(
        { error: `Unsupported province "${provinceCode}". Supported: ${supported}.` },
        { status: 400 },
      );
    }

    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (!start || !end) {
      return Response.json({ error: 'startDate and endDate must use YYYY-MM-DD.' }, { status: 400 });
    }
    if (end < start) {
      return Response.json({ error: 'endDate cannot be earlier than startDate.' }, { status: 400 });
    }
    if ((end.getTime() - start.getTime()) / 86400000 > MAX_RANGE_DAYS) {
      return Response.json({ error: 'Date range cannot exceed 10 years.' }, { status: 400 });
    }

    const holidays = [];
    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
      holidays.push(...holidaysForYear(year, provinceCode));
    }

    return Response.json({
      province: provinceCode,
      provinceName: PROVINCE_NAMES[provinceCode],
      holidays: holidays.filter(({ date }) => date >= startDate && date <= endDate),
    });
  } catch (error) {
    console.error('Unable to calculate statutory holidays:', error);
    return Response.json({ error: 'Unable to calculate statutory holidays.' }, { status: 500 });
  }
});