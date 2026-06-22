import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isRestDay, type Holiday } from "@/lib/work-hours";
import { leaveShortLabel } from "@/lib/leave-types";

export interface LeaveItem {
  user_id: string;
  user_name: string;
  leave_type: string;
}

export interface PresentUser {
  id: string;
  name: string;
  color?: string | null;
  inTime?: string;
  outTime?: string;
}

export interface DayCell {
  date: string; // YYYY-MM-DD
  inTime?: string;
  outTime?: string;
  presentUsers?: PresentUser[];
  leaves?: LeaveItem[];
}

interface Props {
  records: DayCell[];
  holidays: Holiday[];
  mode?: "personal" | "admin";
  initialMonth?: string; // YYYY-MM
  onMonthChange?: (month: string) => void;
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hhmm(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AttendanceCalendar({ records, holidays, mode = "personal", initialMonth, onMonthChange }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => {
    if (initialMonth) {
      const [y, m] = initialMonth.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  // 當父元件切換月份時同步日曆顯示
  useEffect(() => {
    if (!initialMonth) return;
    const [y, m] = initialMonth.split("-").map(Number);
    setCursor(new Date(y, m - 1, 1));
    setSelected(null);
  }, [initialMonth]);

  // 當日曆切換月份時通知父元件（用於懶載入）
  useEffect(() => {
    const m = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    onMonthChange?.(m);
  }, [cursor, onMonthChange]);

  const recordMap = useMemo(() => {
    const m: Record<string, DayCell> = {};
    records.forEach((r) => { m[r.date] = r; });
    return m;
  }, [records]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const startPad = first.getDay();
    const arr: { date?: string; day?: number; outOfMonth?: boolean }[] = [];
    for (let i = 0; i < startPad; i++) arr.push({ outOfMonth: true });
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      arr.push({ date: fmt(dt), day: d });
    }
    while (arr.length % 7) arr.push({ outOfMonth: true });
    return arr;
  }, [cursor]);

  const monthLabel = `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月`;
  const selectedCell = selected ? recordMap[selected] : null;

  return (
    <div className="rounded-2xl bg-card border p-4 md:p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-semibold">{monthLabel}</h3>
        <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">
        {["日", "一", "二", "三", "四", "五", "六"].map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (c.outOfMonth) return <div key={i} />;
          const rec = recordMap[c.date!];
          const rest = isRestDay(c.date!, holidays);
          const isToday = c.date === fmt(today);
          const isSelected = c.date === selected;
          const presentCount = rec?.presentUsers?.length || 0;
          const leaveCount = rec?.leaves?.length || 0;

          return (
            <button
              key={i}
              onClick={() => setSelected(isSelected ? null : c.date!)}
              className={cn(
                "min-h-[78px] md:min-h-[100px] rounded-md border text-left p-1 md:p-1.5 flex flex-col transition-colors overflow-hidden",
                rest.rest ? "bg-destructive/5 border-destructive/20" : "bg-background",
                isToday && "ring-2 ring-primary",
                isSelected && "bg-primary/10 border-primary",
                "hover:bg-secondary"
              )}
            >
              <div className="flex items-start justify-between gap-1 leading-none">
                <span className={cn("text-xs md:text-sm font-semibold", rest.rest && "text-destructive")}>{c.day}</span>
                {rest.name && (
                  <span
                    className={cn(
                      "text-[8px] md:text-[10px] truncate max-w-[60%] text-right font-medium",
                      rest.rest ? "text-destructive" : "text-warning-foreground"
                    )}
                    title={rest.name}
                  >
                    {rest.name}
                  </span>
                )}
              </div>

              {mode === "personal" && (rec?.inTime || rec?.outTime) && (
                <div className="mt-0.5 space-y-0.5 text-[9px] md:text-xs tabular-nums leading-tight">
                  {rec?.inTime && (
                    <div className="flex items-center gap-0.5 text-success truncate">
                      <span className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full bg-success shrink-0" />
                      <span className="truncate">{hhmm(rec.inTime)}</span>
                    </div>
                  )}
                  {rec?.outTime && (
                    <div className="flex items-center gap-0.5 truncate" style={{ color: "var(--clock-out)" }}>
                      <span className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full shrink-0" style={{ background: "var(--clock-out)" }} />
                      <span className="truncate">{hhmm(rec.outTime)}</span>
                    </div>
                  )}
                </div>
              )}

              {mode === "admin" && presentCount > 0 && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {(rec?.presentUsers || []).slice(0, 4).map((u) => (
                    <span
                      key={u.id}
                      className="text-[9px] md:text-[11px] px-0.5 md:px-1 rounded leading-tight truncate max-w-full"
                      style={{
                        background: u.color ? `${u.color}33` : "hsl(var(--secondary))",
                        color: u.color || undefined,
                        borderLeft: u.color ? `2px solid ${u.color}` : undefined,
                      }}
                      title={u.name}
                    >
                      {u.name}
                    </span>
                  ))}
                  {presentCount > 4 && (
                    <span className="text-[9px] text-muted-foreground">+{presentCount - 4}</span>
                  )}
                </div>
              )}

              {mode === "personal" && presentCount > 0 && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {(rec?.presentUsers || []).slice(0, 3).map((u) => (
                    <span
                      key={u.id}
                      className="text-[9px] md:text-[10px] px-0.5 md:px-1 rounded leading-tight truncate max-w-full bg-secondary text-muted-foreground"
                      style={{ borderLeft: u.color ? `2px solid ${u.color}` : undefined }}
                      title={u.name}
                    >
                      {u.name}
                    </span>
                  ))}
                  {presentCount > 3 && <span className="text-[9px] text-muted-foreground">+{presentCount - 3}</span>}
                </div>
              )}

              {leaveCount > 0 && (
                <div className="mt-auto pt-0.5 flex flex-col gap-0.5">
                  {(rec?.leaves || []).slice(0, 2).map((l, idx) => (
                    <span key={idx} className="text-[9px] md:text-[10px] px-0.5 md:px-1 rounded bg-warning/20 text-warning-foreground truncate" title={`${l.user_name} ${leaveShortLabel(l.leave_type)}`}>
                      {`${l.user_name} ${leaveShortLabel(l.leave_type)}`}
                    </span>
                  ))}
                  {leaveCount > 2 && <span className="text-[9px] text-muted-foreground">+{leaveCount - 2}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedCell && (
        <div className="mt-4 p-3 rounded-lg bg-secondary text-sm">
          <div className="font-medium mb-2">{selectedCell.date}</div>
          {mode === "personal" ? (
            <div className="space-y-3">
              <div className="space-y-1 text-xs tabular-nums">
                <div><span className="text-success font-medium">我的上班</span>:{selectedCell.inTime ? new Date(selectedCell.inTime).toLocaleTimeString("zh-TW", { hour12: false }) : "—"}</div>
                <div><span style={{ color: "var(--clock-out)" }} className="font-medium">我的下班</span>:{selectedCell.outTime ? new Date(selectedCell.outTime).toLocaleTimeString("zh-TW", { hour12: false }) : "—"}</div>
              </div>
              {selectedCell.presentUsers && selectedCell.presentUsers.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">今日出勤同仁 ({selectedCell.presentUsers.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedCell.presentUsers.map((u) => (
                      <span key={u.id} className="px-2 py-0.5 rounded text-xs bg-background border" style={{ borderLeft: u.color ? `3px solid ${u.color}` : undefined }}>{u.name}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedCell.leaves && selectedCell.leaves.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">請假 ({selectedCell.leaves.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedCell.leaves.map((l, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-warning/20 text-warning-foreground text-xs">{l.user_name} · {leaveShortLabel(l.leave_type)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <div className="text-xs text-muted-foreground mb-1">出勤人員 ({selectedCell.presentUsers?.length || 0})</div>
                <div className="flex flex-wrap gap-1">
                  {(selectedCell.presentUsers || []).map((u) => (
                    <span
                      key={u.id}
                      className="px-2 py-0.5 rounded text-xs tabular-nums"
                      style={{
                        background: u.color ? `${u.color}22` : "hsl(var(--background))",
                        borderLeft: u.color ? `3px solid ${u.color}` : "3px solid hsl(var(--border))",
                      }}
                    >
                      {u.name}
                      {u.inTime && <span className="ml-1 text-success">{hhmm(u.inTime)}</span>}
                      {u.outTime && <span className="ml-1" style={{ color: "var(--clock-out)" }}>{hhmm(u.outTime)}</span>}
                    </span>
                  ))}
                  {(!selectedCell.presentUsers || selectedCell.presentUsers.length === 0) && <span className="text-xs text-muted-foreground">無</span>}
                </div>
              </div>
              {selectedCell.leaves && selectedCell.leaves.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">請假 ({selectedCell.leaves.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedCell.leaves.map((l, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-warning/20 text-warning-foreground text-xs">
                        {l.user_name} · {leaveShortLabel(l.leave_type)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> 上班</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--clock-out)" }} /> 下班</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning/30" /> 請假</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive/30" /> 休息日</span>
      </div>
    </div>
  );
}
