const DEFAULT_TIME_SCALE_SECONDS = Number(process.env.TIME_SCALE || 3600); // 1 real hour = 1 IG day
const DEFAULT_EPOCH_REAL = process.env.IG_EPOCH_REAL_ISO || "2025-01-01T00:00:00Z";

export type InGameTimestamp = string; // format: Y#:M#:D#:H#

export function getCurrentInGameTimestamp(now = new Date()): InGameTimestamp {
  const epoch = new Date(DEFAULT_EPOCH_REAL);
  const elapsedSeconds = Math.max(0, (now.getTime() - epoch.getTime()) / 1000);
  const igDays = Math.floor(elapsedSeconds / DEFAULT_TIME_SCALE_SECONDS);
  const igHours = Math.floor(((elapsedSeconds % DEFAULT_TIME_SCALE_SECONDS) / DEFAULT_TIME_SCALE_SECONDS) * 24);

  const daysPerMonth = 30;
  const monthsPerYear = 12;

  const totalMonths = Math.floor(igDays / daysPerMonth);
  const year = Math.floor(totalMonths / monthsPerYear) + 1;
  const month = (totalMonths % monthsPerYear) + 1;
  const day = (igDays % daysPerMonth) + 1;

  return `Y${year}:M${month}:D${day}:H${igHours}`;
} 