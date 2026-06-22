// 從 ruyut/TaiwanCalendar 抓取台灣政府行事曆 (人事行政總處公告)
// https://github.com/ruyut/TaiwanCalendar  CDN: jsdelivr

export interface TwHoliday {
  date: string;        // YYYYMMDD
  week: string;
  isHoliday: boolean;
  description: string; // 假日名稱; 若為補班則 description 含「補行上班」
}

export interface ImportedHoliday {
  holiday_date: string; // YYYY-MM-DD
  name: string;
  is_workday: boolean;  // 補班 true; 放假 false
}

export async function fetchTaiwanHolidays(year: number): Promise<ImportedHoliday[]> {
  const url = `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`無法取得 ${year} 年行事曆`);
  const data = (await res.json()) as TwHoliday[];
  const out: ImportedHoliday[] = [];
  data.forEach((d) => {
    const ds = `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`;
    const desc = (d.description || "").trim();
    const dayOfWeek = new Date(ds + "T00:00:00").getDay();
    if (!d.isHoliday && (dayOfWeek === 0 || dayOfWeek === 6)) {
      // 補班日(週末上班)
      out.push({ holiday_date: ds, name: desc || "補行上班", is_workday: true });
    } else if (desc) {
      // 所有有名稱的日子(假日、節日、節氣)都顯示
      out.push({ holiday_date: ds, name: desc, is_workday: !d.isHoliday });
    }
  });
  return out;
}
