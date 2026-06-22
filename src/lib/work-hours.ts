// 月薪員工標準工時計算
// 早上 3.5h + 下午 4.5h = 每日 8 小時(中間休息 1h 不計)
export const STANDARD_DAILY_HOURS = 8;

export interface DaySummary {
  date: string;
  user_id: string;
  clock_in?: string;
  clock_out?: string;
}

export interface Holiday {
  holiday_date: string; // YYYY-MM-DD
  name: string;
  is_workday: boolean; // 補班日 = true
}

/** 計算單日實際工時(扣除午休 1h) */
export function calcWorkedHours(clockIn?: string, clockOut?: string): number {
  if (!clockIn || !clockOut) return 0;
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  const raw = ms / 3600000;
  // 若超過 4.5 小時則扣午休 1 小時
  const net = raw > 4.5 ? raw - 1 : raw;
  return Math.max(0, Math.round(net * 100) / 100);
}

/** 判斷指定日期是否為休息日(週六日 + 國定假日,扣除補班日) */
export function isRestDay(dateStr: string, holidays: Holiday[]): { rest: boolean; name?: string } {
  const h = holidays.find((x) => x.holiday_date === dateStr);
  if (h) {
    if (h.is_workday) return { rest: false, name: h.name }; // 補班
    return { rest: true, name: h.name };
  }
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const names = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  if (day === 0 || day === 6) return { rest: true, name: names[day] };
  return { rest: false, name: names[day] };
}

/** 計算當日加班時數(超過 8h 的部分;休息日全部視為加班) */
export function calcOvertimeForDay(workedHours: number, isRest: boolean): number {
  if (workedHours <= 0) return 0;
  if (isRest) return Math.round(workedHours * 100) / 100;
  return Math.max(0, Math.round((workedHours - STANDARD_DAILY_HOURS) * 100) / 100);
}
