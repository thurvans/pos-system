const DEFAULT_OFFSET_MINUTES = 7 * 60;

const toSafeInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const BUSINESS_TZ_OFFSET_MINUTES = toSafeInteger(
  process.env.BUSINESS_TZ_OFFSET_MINUTES,
  DEFAULT_OFFSET_MINUTES
);
const BUSINESS_TZ_OFFSET_MS = BUSINESS_TZ_OFFSET_MINUTES * 60 * 1000;

const formatDateKey = ({ year, month, day }) => (
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const parseDateKey = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() + 1 !== month
    || probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const toBusinessDate = (value = new Date()) => {
  const source = value instanceof Date ? value : new Date(value);
  return new Date(source.getTime() + BUSINESS_TZ_OFFSET_MS);
};

const toBusinessDateKey = (value = new Date()) => {
  const shifted = toBusinessDate(value);
  return formatDateKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
};

const shiftBusinessDateKey = (dateKey, deltaDays = 0) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;

  const shifted = new Date(Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day + Number(deltaDays || 0)
  ));

  return formatDateKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
};

const getBusinessDateStartUtc = (dateKey) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;

  const utcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0)
    - BUSINESS_TZ_OFFSET_MS;
  return new Date(utcMs);
};

const getBusinessDateEndUtc = (dateKey) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;

  const utcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 23, 59, 59, 999)
    - BUSINESS_TZ_OFFSET_MS;
  return new Date(utcMs);
};

const buildBusinessDateRange = ({ dateFrom, dateTo } = {}) => {
  const gte = getBusinessDateStartUtc(dateFrom);
  const lte = getBusinessDateEndUtc(dateTo);
  if (!gte && !lte) return null;
  return {
    ...(gte && { gte }),
    ...(lte && { lte }),
  };
};

module.exports = {
  BUSINESS_TZ_OFFSET_MINUTES,
  toBusinessDate,
  toBusinessDateKey,
  shiftBusinessDateKey,
  buildBusinessDateRange,
};
