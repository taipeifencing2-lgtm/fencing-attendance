import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Paperclip, AlertTriangle, CalendarDays, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LEAVE_TYPES, LEAVE_TYPE_MAP, leaveLabel, type LeaveTypeKey } from "@/lib/leave-types";
import { calcAnnualLeaveDays } from "@/lib/annual-leave";
import { isRestDay, type Holiday } from "@/lib/work-hours";
import { fetchTaiwanHolidays } from "@/lib/holidays-tw";

export const Route = createFileRoute("/requests")({
  component: RequestsPage,
});

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending:   { text: "待審核", cls: "bg-warning/20 text-warning-foreground" },
  approved:  { text: "已核准", cls: "bg-success/20 text-success" },
  rejected:  { text: "已拒絕", cls: "bg-destructive/20 text-destructive" },
  withdrawn: { text: "已撤回", cls: "bg-secondary text-muted-foreground" },
};

interface RequestRow {
  id: string;
  leave_type: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  created_at: string;
  attachment_url: string | null;
  use_overtime_hours: number;
  review_note?: string | null;
  leader_status?: "pending" | "approved" | "rejected" | null;
  secretary_status?: "pending" | "approved" | "rejected" | null;
  exec_status?: "pending" | "approved" | "rejected" | null;
}

interface AttRow { id: string; type: "clock_in" | "clock_out"; clocked_at: string; }
interface MakeupRow { id: string; type: "clock_in" | "clock_out"; target_time: string; reason: string | null; status: "pending" | "approved" | "rejected"; created_at: string; }
interface OtTxRow { id: string; hours: number; source: string; reason: string | null; created_at: string; }

function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function RequestsPage() {
  const { user, employeeType, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [open, setOpen] = useState(false);
  const [otBalance, setOtBalance] = useState(0);
  const [hireDate, setHireDate] = useState<string | null>(null);
  const [myAtt, setMyAtt] = useState<AttRow[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [makeupRows, setMakeupRows] = useState<MakeupRow[]>([]);
  const [otTxRows, setOtTxRows] = useState<OtTxRow[]>([]);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [workStartHour, setWorkStartHour] = useState(9);
  const [workEndHour, setWorkEndHour] = useState(18);
  const [systemStartDate, setSystemStartDate] = useState("2026-06-01");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const year = new Date().getFullYear();
    const [{ data: req }, { data: ot }, { data: profile }, { data: att }, { data: mkup }, twH0, twH1] = await Promise.all([
      supabase.from("leave_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("overtime_transactions").select("id,hours,source,reason,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("hire_date").eq("id", user.id).maybeSingle(),
      supabase.from("attendance").select("id,type,clocked_at").eq("user_id", user.id).order("clocked_at", { ascending: false }).limit(500),
      supabase.from("makeup_requests").select("id,type,target_time,reason,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
      fetchTaiwanHolidays(year).catch(() => []),
      fetchTaiwanHolidays(year + 1).catch(() => []),
    ]);
    setRows((req ?? []) as RequestRow[]);
    setOtTxRows((ot ?? []) as OtTxRow[]);
    const sum = (ot ?? []).reduce((s, r) => s + Number(r.hours), 0);
    setOtBalance(Math.round(sum * 100) / 100);
    setHireDate((profile as { hire_date?: string | null } | null)?.hire_date ?? null);
    setMyAtt((att ?? []) as AttRow[]);
    setMakeupRows((mkup ?? []) as MakeupRow[]);
    setHolidays([...twH0, ...twH1] as Holiday[]);
    setDataLoaded(true);
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  useEffect(() => {
    supabase.from("site_settings").select("key,value").in("key", ["work_start_hour", "work_end_hour", "system_start_date"]).then(({ data }) => {
      (data ?? []).forEach((s: { key: string; value: string }) => {
        if (s.key === "work_start_hour") setWorkStartHour(Number(s.value) || 9);
        if (s.key === "work_end_hour") setWorkEndHour(Number(s.value) || 18);
        if (s.key === "system_start_date" && s.value) setSystemStartDate(s.value);
      });
    });
  }, []);

  // 即時通知：申請狀態有變動時自動更新並推送 toast
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`leave_updates_${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leave_requests", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as { status: string; leader_status?: string | null; secretary_status?: string | null };
          const o = payload.old as { status?: string; leader_status?: string | null; secretary_status?: string | null };
          if (n.status !== o.status) {
            if (n.status === "approved") toast.success("您的申請已全部審核通過 ✓");
            else if (n.status === "rejected") toast.error("您的申請已被拒絕");
          } else if (n.leader_status !== o.leader_status && n.leader_status === "approved") {
            toast.info("第一階段（組長）已審核通過");
          } else if (n.secretary_status !== o.secretary_status && n.secretary_status === "approved") {
            toast.info("第二階段（秘書長）已審核通過");
          }
          load();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  // 已使用特休天數(本年度已核准的 annual)
  const usedAnnualDays = useMemo(() => {
    const year = new Date().getFullYear();
    let days = 0;
    rows.filter(r => r.leave_type === "annual" && r.status === "approved").forEach(r => {
      const s = new Date(r.start_at), e = new Date(r.end_at);
      if (s.getFullYear() === year) {
        const ms = e.getTime() - s.getTime();
        days += Math.max(0.5, Math.round((ms / 86400000) * 2) / 2);
      }
    });
    return days;
  }, [rows]);

  const annualTotal = useMemo(() => calcAnnualLeaveDays(hireDate), [hireDate]);
  const annualRemain = Math.max(0, annualTotal - usedAnnualDays);

  // 個人差勤異常偵測(近 60 天，最早從 2026/6/1 起算)
  const exceptions = useMemo(() => {
    if (!user) return [] as { date: string; kind: string; detail: string }[];
    const isHourly = employeeType === "hourly";
    const out: { date: string; kind: string; detail: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 掃描到昨天為止，今天尚未結束不列入
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const start60 = new Date(today);
    start60.setDate(start60.getDate() - 60);
    const systemStart = new Date(systemStartDate);
    const start = start60 > systemStart ? start60 : systemStart;

    // 將打卡按日期分組
    const byDay: Record<string, { in?: Date; out?: Date }> = {};
    myAtt.forEach(r => {
      const dk = dateKey(r.clocked_at);
      const d = new Date(r.clocked_at);
      if (!byDay[dk]) byDay[dk] = {};
      if (r.type === "clock_in") {
        if (!byDay[dk].in || d < byDay[dk].in!) byDay[dk].in = d;
      } else {
        if (!byDay[dk].out || d > byDay[dk].out!) byDay[dk].out = d;
      }
    });

    // 已核准請假的日期區間
    const leaveDays = new Set<string>();
    rows.filter(r => r.status === "approved").forEach(r => {
      const s = new Date(r.start_at), e = new Date(r.end_at);
      const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      const last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
      while (cur <= last) {
        leaveDays.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
        cur.setDate(cur.getDate() + 1);
      }
    });

    // 待審核
    rows.filter(r => r.status === "pending").forEach(r => {
      out.push({
        date: dateKey(r.start_at),
        kind: "申請未審核",
        detail: `${leaveLabel(r.leave_type)} · 等待主管審核`,
      });
    });

    // 逐日掃描（到昨天為止）
    const cur = new Date(start);
    while (cur <= yesterday) {
      const dk = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      const rest = isRestDay(dk, holidays);
      const rec = byDay[dk];
      const onLeave = leaveDays.has(dk);

      if (!rest.rest && !onLeave) {
        if (!rec || (!rec.in && !rec.out)) {
          // 未打卡且未請假
          out.push({ date: dk, kind: "未打卡", detail: "工作日無打卡且無請假" });
        } else if (!isHourly) {
          // 正職才偵測遲到/早退/未打下班卡
          if (rec.in) {
            const expected = new Date(cur);
            expected.setHours(workStartHour, 0, 0, 0);
            if (rec.in.getTime() > expected.getTime() + 60000) {
              const min = Math.round((rec.in.getTime() - expected.getTime()) / 60000);
              out.push({ date: dk, kind: "遲到", detail: `晚 ${min} 分鐘 (${rec.in.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })})` });
            }
          }
          if (rec.out) {
            const expected = new Date(cur);
            expected.setHours(workEndHour, 0, 0, 0);
            if (rec.out.getTime() < expected.getTime() - 60000) {
              const min = Math.round((expected.getTime() - rec.out.getTime()) / 60000);
              out.push({ date: dk, kind: "早退", detail: `早 ${min} 分鐘 (${rec.out.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })})` });
            }
          }
          if (rec.in && !rec.out) {
            out.push({ date: dk, kind: "未打下班卡", detail: `上班 ${rec.in.toLocaleTimeString("zh-TW", { hour12: false })}` });
          }
        }
      }
      cur.setDate(cur.getDate() + 1);
    }

    // 依日期新→舊
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
  }, [myAtt, rows, holidays, user, workStartHour, workEndHour, systemStartDate]);

  if (loading || !user) return null;
  if (!dataLoaded) return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl space-y-6">
      <Skeleton className="h-12 w-48 rounded-xl" />
      <div className="grid sm:grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
  const isMonthly = employeeType === "monthly";

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">差勤申請</h1>
          <p className="text-muted-foreground mt-1">提交請假或加班申請</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> 新增申請</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>新增申請</DialogTitle></DialogHeader>
            <RequestForm
              onDone={() => { setOpen(false); load(); }}
              userId={user.id}
              otBalance={otBalance}
              annualRemain={annualRemain}
              isMonthly={isMonthly}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* 餘額卡片 */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border bg-success/5 border-success/20 p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">剩餘特休</div>
          <div className="text-3xl font-bold tabular-nums text-success leading-none">{annualRemain.toFixed(1)}<span className="text-base font-normal text-muted-foreground ml-1">/ {annualTotal} 天</span></div>
          <div className="text-xs text-muted-foreground mt-2">{hireDate ? `本年度已使用 ${usedAnnualDays.toFixed(1)} 天` : "尚未設定到職日，請聯絡管理員"}</div>
        </div>
        {isMonthly ? (
          <div className="rounded-xl border bg-accent/10 border-accent/20 p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">可用加班時數</div>
            <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: "var(--clock-out)" }}>{otBalance.toFixed(1)}<span className="text-base font-normal text-muted-foreground ml-1">小時</span></div>
            <div className="text-xs text-muted-foreground mt-2">可於請假時折抵使用</div>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">員工類型</div>
            <div className="text-3xl font-bold leading-none mt-1">兼職</div>
          </div>
        )}
      </div>

      {/* 申請紀錄表 */}
      <div className="rounded-2xl bg-card border p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <h2 className="font-semibold mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4" /> 我的申請</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">類型</th>
                <th className="py-2 pr-4 font-medium">起始</th>
                <th className="py-2 pr-4 font-medium">結束</th>
                <th className="py-2 pr-4 font-medium">附件</th>
                <th className="py-2 pr-4 font-medium">原因</th>
                <th className="py-2 pr-4 font-medium">審核狀態</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const ls = r.leader_status ?? null;
                const ss = r.secretary_status ?? null;
                const es = r.exec_status ?? null;
                // 燈號：通過=亮色圓點，拒絕=紅色X，等待=暗灰圓點，跳過/未到=—
                const dot = (status: string | null) => {
                  if (status === "approved") return <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 shadow-sm" />;
                  if (status === "rejected") return <XIcon className="h-3.5 w-3.5 text-destructive" />;
                  if (status === "pending") return <span className="inline-block h-3 w-3 rounded-full bg-muted-foreground/20 border border-muted-foreground/30" />;
                  return <span className="text-[11px] text-muted-foreground leading-none">—</span>;
                };
                const ssShow = ls !== "pending" ? ss : null;
                const esShow = ls !== "pending" && ss !== "pending" ? es : null;
                const canWithdraw = r.status !== "withdrawn" && r.status !== "rejected";
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 whitespace-nowrap">{leaveLabel(r.leave_type)}</td>
                    <td className="py-3 pr-4 tabular-nums text-xs">{new Date(r.start_at).toLocaleString("zh-TW", { hour12: false })}</td>
                    <td className="py-3 pr-4 tabular-nums text-xs">{new Date(r.end_at).toLocaleString("zh-TW", { hour12: false })}</td>
                    <td className="py-3 pr-4">
                      {r.attachment_url ? (
                        <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs"><Paperclip className="h-3 w-3" /> 檢視</a>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="py-3 pr-4 max-w-xs truncate">{r.reason || "—"}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col items-center gap-0.5">
                            {dot(ls)}
                            <span className="text-[9px] text-muted-foreground">組長</span>
                          </div>
                          <span className="text-muted-foreground text-[10px] mb-3">›</span>
                          <div className="flex flex-col items-center gap-0.5">
                            {dot(ssShow)}
                            <span className="text-[9px] text-muted-foreground">秘書長</span>
                          </div>
                          <span className="text-muted-foreground text-[10px] mb-3">›</span>
                          <div className="flex flex-col items-center gap-0.5">
                            {dot(esShow)}
                            <span className="text-[9px] text-muted-foreground">執行長</span>
                          </div>
                        </div>
                        {r.status === "pending" && (
                          <div className="text-[10px] text-warning-foreground">
                            {ls === "pending" ? "等待組長審核" : ssShow === "pending" ? "等待秘書長審核" : esShow === "pending" ? "等待執行長審核" : "審核中"}
                          </div>
                        )}
                        {r.review_note && <div className="text-[10px] text-muted-foreground">{r.review_note}</div>}
                      </div>
                    </td>
                    <td className="py-3">
                      {canWithdraw && (
                        <button
                          onClick={() => setConfirmWithdraw(r.id)}
                          className="text-xs text-destructive hover:underline"
                        >撤回</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">尚未有申請紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 補打卡申請紀錄 */}
      <div className="rounded-2xl bg-card border p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <h2 className="font-semibold mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4" /> 補打卡申請紀錄</h2>
        {makeupRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">尚無補打卡申請</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">類型</th>
                <th className="py-2 pr-4 font-medium">補登時間</th>
                <th className="py-2 pr-4 font-medium">原因</th>
                <th className="py-2 font-medium">狀態</th>
              </tr></thead>
              <tbody>
                {makeupRows.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4" style={{ color: r.type === "clock_in" ? "var(--clock-in)" : "var(--clock-out)" }}>{r.type === "clock_in" ? "補上班打卡" : "補下班打卡"}</td>
                    <td className="py-2 pr-4 tabular-nums text-xs">{new Date(r.target_time).toLocaleString("zh-TW", { hour12: false })}</td>
                    <td className="py-2 pr-4 text-muted-foreground max-w-xs truncate">{r.reason || "—"}</td>
                    <td className="py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                        r.status === "approved" ? "bg-success/20 text-success" :
                        r.status === "rejected" ? "bg-destructive/20 text-destructive" :
                        "bg-warning/20 text-warning-foreground"
                      }`}>{r.status === "approved" ? "已核准" : r.status === "rejected" ? "已拒絕" : "待審核"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 加班時數異動明細 */}
      {otTxRows.length > 0 && (
        <div className="rounded-2xl bg-card border p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
          <h2 className="font-semibold mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4" /> 加班時數異動明細</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">日期</th>
                <th className="py-2 pr-4 font-medium">類別</th>
                <th className="py-2 pr-4 font-medium">時數</th>
                <th className="py-2 font-medium">說明</th>
              </tr></thead>
              <tbody>
                {otTxRows.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 tabular-nums text-xs">{new Date(r.created_at).toLocaleDateString("zh-TW")}</td>
                    <td className="py-2 pr-4 text-xs">
                      <span className={`px-1.5 py-0.5 rounded ${r.source === "leave_offset" ? "bg-destructive/10 text-destructive" : r.source === "overtime" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
                        {r.source === "leave_offset" ? "請假折抵" : r.source === "overtime" ? "加班累積" : "手動調整"}
                      </span>
                    </td>
                    <td className={`py-2 pr-4 tabular-nums font-semibold ${Number(r.hours) >= 0 ? "text-success" : "text-destructive"}`}>
                      {Number(r.hours) > 0 ? "+" : ""}{r.hours}h
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">{r.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 個人差勤異常日曆 */}
      <div className="rounded-2xl bg-card border p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" /> 個人差勤異常 <span className="text-xs text-muted-foreground font-normal">(近 60 日)</span>
        </h2>
        <p className="text-xs text-muted-foreground mb-3">未打卡、遲到、早退、未審核的申請會在此列出,方便您及時處理。標準上下班 {workStartHour}:00–{workEndHour}:00</p>
        {exceptions.length === 0 ? (
          <div className="py-8 text-center text-sm text-success">✓ 近 60 日無異常,出勤狀況良好</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">日期</th>
                <th className="py-2 pr-4 font-medium">異常類別</th>
                <th className="py-2 font-medium">說明</th>
              </tr></thead>
              <tbody>
                {exceptions.map((e, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4 tabular-nums">{e.date}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                        e.kind === "未打卡" || e.kind === "未打下班卡" ? "bg-destructive/15 text-destructive" :
                        e.kind === "申請未審核" ? "bg-warning/20 text-warning-foreground" :
                        "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                      }`}>{e.kind}</span>
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* 撤回確認 Dialog */}
      <Dialog open={!!confirmWithdraw} onOpenChange={o => { if (!o) setConfirmWithdraw(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>確認撤回</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">確定要撤回此申請？撤回後需重新提交。</p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" size="sm" onClick={() => setConfirmWithdraw(null)}>取消</Button>
            <Button variant="destructive" size="sm" onClick={async () => {
              const id = confirmWithdraw;
              setConfirmWithdraw(null);
              if (!id) return;
              const { error } = await supabase.from("leave_requests").update({ status: "withdrawn" }).eq("id", id).eq("user_id", user!.id);
              if (error) toast.error(error.message);
              else { toast.success("已撤回申請"); load(); }
            }}>確定撤回</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequestForm({ onDone, userId, otBalance, annualRemain, isMonthly }: {
  onDone: () => void; userId: string; otBalance: number; annualRemain: number; isMonthly: boolean;
}) {
  const [type, setType] = useState<LeaveTypeKey>("personal_basic");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [useOt, setUseOt] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const def = LEAVE_TYPE_MAP[type];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end) return toast.error("請填寫起訖時間");
    if (new Date(end) < new Date(start)) return toast.error("結束時間需晚於開始時間");
    const useOtNum = Math.max(0, Number(useOt) || 0);
    if (useOtNum > otBalance) return toast.error(`折抵時數不可超過餘額 ${otBalance.toFixed(2)}h`);
    if (def?.needAttachment && !file) return toast.error(`「${def.label}」需上傳證明文件`);

    // 特休天數檢查
    if (type === "annual") {
      const days = Math.max(0.5, Math.round(((new Date(end).getTime() - new Date(start).getTime()) / 86400000) * 2) / 2);
      if (days > annualRemain) return toast.error(`特休餘額不足 (剩 ${annualRemain.toFixed(1)} 天,本次申請 ${days} 天)`);
    }

    setBusy(true);
    try {
      // 衝突檢查：是否有重疊的待審或已核准假期
      const { data: conflicts } = await supabase
        .from("leave_requests")
        .select("id, leave_type, start_at, end_at")
        .eq("user_id", userId)
        .not("status", "in", '("rejected","withdrawn")')
        .lte("start_at", new Date(end).toISOString())
        .gte("end_at", new Date(start).toISOString());
      if (conflicts && conflicts.length > 0) {
        const c = conflicts[0] as { leave_type: string; start_at: string; end_at: string };
        throw new Error(`所選期間與現有申請重疊（${leaveLabel(c.leave_type)} ${new Date(c.start_at).toLocaleDateString("zh-TW")}）`);
      }

      let attachmentUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("leave-attachments").upload(path, file, {
          contentType: file.type, upsert: false,
        });
        if (upErr) throw new Error(`檔案上傳失敗:${upErr.message}`);
        const { data: signed } = await supabase.storage.from("leave-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
        attachmentUrl = signed?.signedUrl || path;
      }

      // 偵測哪些審核階段有人，跳過沒人擔任的職位
      const { data: roleRows } = await supabase.rpc("get_existing_roles");
      const existingRoles = new Set((roleRows ?? []).map((r: { role: string }) => r.role));
      const hasLeader = existingRoles.has("leader");
      const hasSecretary = existingRoles.has("secretary_general");
      const hasExec = existingRoles.has("executive_director");
      const noApprovers = !hasLeader && !hasSecretary && !hasExec;
      const stageInit: Record<string, string | null> = {
        leader_status: hasLeader ? "pending" : null,
        secretary_status: !hasLeader && hasSecretary ? "pending" : null,
        exec_status: !hasLeader && !hasSecretary && hasExec ? "pending" : null,
        ...(noApprovers ? { status: "approved" } : {}),
      };

      const { error } = await supabase.from("leave_requests").insert({
        user_id: userId,
        leave_type: type,
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
        reason: reason || null,
        use_overtime_hours: useOtNum,
        attachment_url: attachmentUrl,
        ...stageInit,
      });
      if (error) throw new Error(error.message);
      toast.success("申請已送出,等待主管審核");
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fillFullDay = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setStart(`${date}T09:00`);
    setEnd(`${date}T18:00`);
  };

  const showOffset = isMonthly && type !== "overtime" && otBalance > 0;
  const leaveDays = useMemo(() => {
    if (!start || !end) return null;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms <= 0) return null;
    return Math.max(0.5, Math.round((ms / 86400000) * 2) / 2);
  }, [start, end]);

  return (
    <form onSubmit={submit} className="space-y-4 mt-2">
      <div>
        <Label>假別</Label>
        <Select value={type} onValueChange={(v) => setType(v as LeaveTypeKey)}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LEAVE_TYPES.filter(t => t.key !== "other").map(t => (
              <SelectItem key={t.key} value={t.key}>
                <span className="font-mono text-xs text-muted-foreground mr-2">{t.code}</span>{t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {def?.description && <p className="text-xs text-muted-foreground mt-1">{def.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>開始</Label><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="mt-1.5" /></div>
        <div><Label>結束</Label><Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="mt-1.5" /></div>
      </div>
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={fillFullDay}>
        請假一整天（今天 09:00–18:00）
      </Button>
      {leaveDays !== null && (
        <p className="text-xs text-muted-foreground -mt-2">共 <span className="font-semibold text-foreground">{leaveDays}</span> 天
          {type === "annual" && <span className="ml-1">(剩餘特休 {annualRemain.toFixed(1)} 天)</span>}
        </p>
      )}

      {type === "annual" && (
        <div className="text-xs p-2 rounded bg-primary/5 border border-primary/10">
          剩餘特休:<span className="font-bold text-primary"> {annualRemain.toFixed(1)} 天</span>
        </div>
      )}

      {showOffset && (
        <div>
          <Label>使用加班時數折抵 (可用 {otBalance.toFixed(2)}h)</Label>
          <div className="flex gap-2 mt-1.5">
            <Input type="number" min="0" max={otBalance} step="0.5" value={useOt} onChange={e => setUseOt(e.target.value)} />
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setUseOt(String(Math.min(8, otBalance)))}>
              折抵 8 小時
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">核准後將自動從加班時數中扣除</p>
        </div>
      )}

      <div>
        <Label className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> 證明文件 {def?.needAttachment && <span className="text-destructive">*</span>}</Label>
        <Input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1.5" />
        <p className="text-xs text-muted-foreground mt-1">上傳檔案會儲存於系統私有空間,僅本人與主管可下載。支援圖片或 PDF</p>
      </div>

      <div>
        <Label>原因 (選填)</Label>
        <Textarea value={reason} onChange={e => setReason(e.target.value)} className="mt-1.5" rows={3} />
      </div>

      <Button type="submit" disabled={busy} className="w-full">{busy ? "送出中..." : "送出申請"}</Button>
    </form>
  );
}
