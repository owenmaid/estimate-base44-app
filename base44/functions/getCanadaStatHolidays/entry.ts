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

const albertaHolidaysForYear = (year: number) => {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(easter.getUTCDate() - 2);

  return [
    { date: toIsoDate(utcDate(year, 0, 1)), name: "New Year's Day", provinces: 'AB' },
    { date: toIsoDate(nthWeekday(year, 1, 1, 3)), name: 'Alberta Family Day', provinces: 'AB' },
    { date: toIsoDate(goodFriday), name: 'Good Friday', provinces: 'AB' },
    { date: toIsoDate(mondayBefore(year, 4, 24)), name: 'Victoria Day', provinces: 'AB' },
    { date: toIsoDate(utcDate(year, 6, 1)), name: 'Canada Day', provinces: 'AB' },
    { date: toIsoDate(nthWeekday(year, 8, 1, 1)), name: 'Labour Day', provinces: 'AB' },
    { date: toIsoDate(nthWeekday(year, 9, 1, 2)), name: 'Thanksgiving Day', provinces: 'AB' },
    { date: toIsoDate(utcDate(year, 10, 11)), name: 'Remembrance Day', provinces: 'AB' },
    { date: toIsoDate(utcDate(year, 11, 25)), name: 'Christmas Day', provinces: 'AB' },
  ];
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
    if (String(province).toUpperCase() !== 'AB') {
      return Response.json({ error: 'Only Alberta statutory holidays are currently supported.' }, { status: 400 });
    }

    const holidays = [];
    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
      holidays.push(...albertaHolidaysForYear(year));
    }

    return Response.json({
      province: 'AB',
      holidays: holidays.filter(({ date }) => date >= startDate && date <= endDate),
    });
  } catch (error) {
    console.error('Unable to calculate statutory holidays:', error);
    return Response.json({ error: 'Unable to calculate statutory holidays.' }, { status: 500 });
  }
});
