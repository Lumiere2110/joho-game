// ゲーム内の日付。1週目 = 2027年4月5日（月）として、1週間ずつ進む
const START = Date.UTC(2027, 3, 5);

export function weekToDate(week: number): Date {
  return new Date(START + (week - 1) * 7 * 86400000);
}

export function fmtDate(week: number): string {
  const d = weekToDate(week);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

export function fmtDateShort(week: number): string {
  const d = weekToDate(week);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
