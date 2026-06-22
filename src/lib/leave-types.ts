// 假別常數定義(依首字筆畫排序,加上英文編號)
// 對應 Supabase enum public.leave_type

export type LeaveTypeKey =
  | "official"
  | "occupational_injury"
  | "overtime"
  | "maternity_sick"
  | "military"
  | "personal"
  | "indigenous"
  | "annual"
  | "sick"
  | "marriage"
  | "paternity"
  | "bereavement"
  | "other";

export interface LeaveTypeDef {
  key: LeaveTypeKey;
  code: string;       // 英文編號
  label: string;      // 中文名稱
  shortLabel?: string;
  needAttachment?: boolean;
  description?: string;
}

// 排序依首字筆畫: 公(4) 加(5) 安(6) 兵(7) 事(8) 原(10) 特(10) 病(10) 婚(11) 陪(11) 喪(12)
export const LEAVE_TYPES: LeaveTypeDef[] = [
  { key: "official",            code: "L01", label: "公出",                shortLabel: "公出" },
  { key: "occupational_injury", code: "L02", label: "公傷假",              needAttachment: true, description: "因公受傷,需附醫療證明" },
  { key: "overtime",            code: "L03", label: "加班",                shortLabel: "加班" },
  { key: "maternity_sick",      code: "L04", label: "安胎病假",            needAttachment: true, description: "需附醫師診斷證明" },
  { key: "military",            code: "L05", label: "兵役假",              needAttachment: true, description: "需附召集令" },
  { key: "personal",            code: "L06", label: "事假(家庭照顧假)",    shortLabel: "事假" },
  { key: "indigenous",          code: "L07", label: "原住民歲時祭儀假" },
  { key: "annual",              code: "L08", label: "特休",                shortLabel: "特休" },
  { key: "sick",                code: "L09", label: "病假",                description: "三日以上需附診斷證明" },
  { key: "marriage",            code: "L10", label: "婚假",                needAttachment: true, description: "需附結婚證明" },
  { key: "paternity",           code: "L11", label: "陪產檢及陪產假",      needAttachment: true, description: "需附證明文件" },
  { key: "bereavement",         code: "L12", label: "喪假",                needAttachment: true, description: "需附訃聞或證明" },
  { key: "other",               code: "L99", label: "其他" },
];

export const LEAVE_TYPE_MAP: Record<string, LeaveTypeDef> = LEAVE_TYPES.reduce(
  (acc, t) => { acc[t.key] = t; return acc; },
  {} as Record<string, LeaveTypeDef>
);

export function leaveLabel(key?: string | null): string {
  if (!key) return "—";
  const t = LEAVE_TYPE_MAP[key];
  return t ? `${t.code} ${t.label}` : key;
}

export function leaveShortLabel(key?: string | null): string {
  if (!key) return "";
  const t = LEAVE_TYPE_MAP[key];
  return t?.shortLabel || t?.label || key;
}
