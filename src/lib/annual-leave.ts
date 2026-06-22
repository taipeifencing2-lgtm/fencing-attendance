// 依台灣勞基法第38條計算特休天數
// 6個月→3日、1年→7日、2年→10日、3年→14日、5年→15日、10年起每年+1日,上限30日
export function calcAnnualLeaveDays(hireDate?: string | null, asOf: Date = new Date()): number {
  if (!hireDate) return 0;
  const start = new Date(hireDate);
  if (isNaN(start.getTime())) return 0;
  const ms = asOf.getTime() - start.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  const years = days / 365.25;

  if (years < 0.5) return 0;
  if (years < 1) return 3;
  if (years < 2) return 7;
  if (years < 3) return 10;
  if (years < 5) return 14;
  if (years < 10) return 15;
  // 10年起每年+1,上限30
  return Math.min(30, 15 + Math.floor(years - 9));
}

/** 在職時間中文敘述,如「2 年 3 個月」 */
export function tenureLabel(hireDate?: string | null, asOf: Date = new Date()): string {
  if (!hireDate) return "—";
  const start = new Date(hireDate);
  if (isNaN(start.getTime())) return "—";
  let years = asOf.getFullYear() - start.getFullYear();
  let months = asOf.getMonth() - start.getMonth();
  let days = asOf.getDate() - start.getDate();
  if (days < 0) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return "未到職";
  if (years === 0 && months === 0) return "未滿一個月";
  return `${years > 0 ? `${years} 年` : ""}${months > 0 ? ` ${months} 個月` : ""}`.trim() || "—";
}
