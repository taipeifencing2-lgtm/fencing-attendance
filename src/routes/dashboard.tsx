import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { LogIn, LogOut, Clock, Download, Plus, MapPin, Info, Users, Check } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calcWorkedHours, type Holiday } from "@/lib/work-hours";
import { calcAnnualLeaveDays } from "@/lib/annual-leave";
import { checkAtOfficeOrWifi, OFFICE_LOCATION } from "@/lib/office-location";
import { leaveLabel } from "@/lib/leave-types";
import { fetchTaiwanHolidays } from "@/lib/holidays-tw";

function playClockSound(type: "clock_in" | "clock_out") {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const notes = type === "clock_in" ? [523.25, 783.99] : [783.99, 523.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
    setTimeout(() => ctx.close(), 600);
  } catch { /* ignore */ }
}
import { HoldButton } from "@/components/HoldButton";
import { AttendanceCalendar, type DayCell } from "@/components/AttendanceCalendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

interface AttendanceRow {
  id: string;
  user_id: string;
  type: "clock_in" | "clock_out";
  clocked_at: string;
  note: string | null;
}

function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function initialLoadedMonths() {
  const today = new Date();
  const s = new Set<string>();
  for (let i = -1; i <= 1; i++) s.add(monthKey(new Date(today.getFullYear(), today.getMonth() + i, 1)));
  return s;
}

function Dashboard() {
  const { user, employeeType, loading } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [allAtt, setAllAtt] = useState<AttendanceRow[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [otBalance, setOtBalance] = useState(0);
  const [hireDate, setHireDate] = useState<string | null>(null);
  const [leaves, setLeaves] = useState<{ user_id: string; leave_type: string; start_at: string; end_at: string }[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, { name: string; color?: string | null }>>({});
  const [busy, setBusy] = useState(false);
  const [exportMonth, setExportMonth] = useState(currentMonth());
  const [makeupOpen, setMakeupOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const loadedMonthsRef = useRef<Set<string>>(initialLoadedMonths());

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadRecords = useCallback(async () => {
    if (!user) return;
    // 重新載入時重置已載入月份集合，避免 allAtt 重置後 loadMonth 誤判已載入
    loadedMonthsRef.current = initialLoadedMonths();
    const today = new Date();
    const year = today.getFullYear();
    const startISO = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const endISO = new Date(today.getFullYear(), today.getMonth() + 2, 1).toISOString();
    const [{ data: a }, { data: ot }, { data: lv }, { data: pf }, { data: me }, twHolidays0, twHolidays1] = await Promise.all([
      supabase.from("attendance").select("*").gte("clocked_at", startISO).lt("clocked_at", endISO).order("clocked_at", { ascending: false }),
      supabase.from("overtime_transactions").select("hours").eq("user_id", user.id),
      supabase.from("leave_requests").select("user_id,leave_type,start_at,end_at").eq("status", "approved"),
      supabase.from("profiles").select("id,full_name,email,display_color"),
      supabase.from("profiles").select("hire_date").eq("id", user.id).maybeSingle(),
      fetchTaiwanHolidays(year).catch(() => []),
      fetchTaiwanHolidays(year + 1).catch(() => []),
    ]);
    const h = [...twHolidays0, ...twHolidays1].map(item => ({
      holiday_date: item.holiday_date,
      name: item.name,
      is_workday: item.is_workday,
    }));
    setAllAtt((a ?? []) as AttendanceRow[]);
    setHolidays(h as Holiday[]);
    setLeaves((lv ?? []) as { user_id: string; leave_type: string; start_at: string; end_at: string }[]);
    const pmap: Record<string, { name: string; color?: string | null }> = {};
    (pf ?? []).forEach((p: { id: string; full_name: string | null; email: string | null; display_color: string | null }) => {
      pmap[p.id] = { name: p.full_name || p.email || p.id.slice(0, 6), color: p.display_color };
    });
    setProfileMap(pmap);
    const sum = (ot ?? []).reduce((s, r) => s + Number(r.hours), 0);
    setOtBalance(Math.round(sum * 100) / 100);
    setHireDate((me as { hire_date?: string | null } | null)?.hire_date ?? null);
    setDataLoaded(true);
  }, [user]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const loadMonth = useCallback(async (month: string) => {
    if (!user || loadedMonthsRef.current.has(month)) return;
    loadedMonthsRef.current.add(month);
    setCalendarLoading(true);
    try {
      const [y, m] = month.split("-").map(Number);
      const startISO = new Date(y, m - 1, 1).toISOString();
      const endISO = new Date(y, m, 1).toISOString();
      const { data } = await supabase.from("attendance").select("*")
        .gte("clocked_at", startISO).lt("clocked_at", endISO)
        .order("clocked_at", { ascending: false });
      if (data && data.length > 0) {
        setAllAtt(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const newRecs = (data as AttendanceRow[]).filter(r => !existingIds.has(r.id));
          return newRecs.length > 0 ? [...prev, ...newRecs] : prev;
        });
      }
    } finally {
      setCalendarLoading(false);
    }
  }, [user]);

  useEffect(() => {
    supabase.from("site_settings").select("value").eq("key", "announcement").maybeSingle().then(({ data }) => {
      setAnnouncement((data as { value?: string } | null)?.value ?? "");
    });
  }, []);

  const myRecords = useMemo(() => allAtt.filter(r => r.user_id === user?.id), [allAtt, user]);

  const todayRecords = myRecords.filter(r => {
    const d = new Date(r.clocked_at);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  const lastToday = todayRecords[0];
  const nextAction: "clock_in" | "clock_out" =
    !lastToday || lastToday.type === "clock_out" ? "clock_in" : "clock_out";
  const todayDone = todayRecords.some(r => r.type === "clock_in") && todayRecords.some(r => r.type === "clock_out");

  // Calendar: own times + everyone else's presence + leaves
  const calendarCells = useMemo<DayCell[]>(() => {
    const map: Record<string, DayCell & { _presentMap: Map<string, { id: string; name: string; color?: string | null; inTime?: string; outTime?: string }> }> = {};
    // sort ascending
    [...allAtt].sort((a, b) => a.clocked_at.localeCompare(b.clocked_at)).forEach((r) => {
      const dk = dateKey(r.clocked_at);
      if (!map[dk]) map[dk] = { date: dk, _presentMap: new Map() };
      // own clock times
      if (r.user_id === user?.id) {
        if (r.type === "clock_in" && !map[dk].inTime) map[dk].inTime = r.clocked_at;
        if (r.type === "clock_out") map[dk].outTime = r.clocked_at;
      }
      // present user list
      const prof = profileMap[r.user_id];
      const existing = map[dk]._presentMap.get(r.user_id) || { id: r.user_id, name: prof?.name || "員工", color: prof?.color };
      if (r.type === "clock_in" && !existing.inTime) existing.inTime = r.clocked_at;
      if (r.type === "clock_out") existing.outTime = r.clocked_at;
      map[dk]._presentMap.set(r.user_id, existing);
    });
    leaves.forEach(l => {
      const s = new Date(l.start_at), e = new Date(l.end_at);
      const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      const last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
      while (cur <= last) {
        const dk = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        if (!map[dk]) map[dk] = { date: dk, _presentMap: new Map() };
        if (!map[dk].leaves) map[dk].leaves = [];
        map[dk].leaves!.push({ user_id: l.user_id, user_name: profileMap[l.user_id]?.name || "員工", leave_type: l.leave_type });
        cur.setDate(cur.getDate() + 1);
      }
    });
    return Object.values(map).map(c => ({
      date: c.date, inTime: c.inTime, outTime: c.outTime, leaves: c.leaves,
      presentUsers: Array.from(c._presentMap.values())
        .filter(u => u.id !== user?.id)
        .map(({ id, name, color }) => ({ id, name, color })),
    }));
  }, [allAtt, leaves, profileMap, user]);

  const handleClock = async () => {
    if (!user || busy) return;
    if (todayDone) {
      toast.error("今日已完成打卡，如需補打卡請使用「補打卡申請」");
      return;
    }
    setBusy(true);

    // GPS 位置驗證
    toast.loading("正在確認定位...", { id: "geo" });
    const geo = await checkAtOfficeOrWifi();
    toast.dismiss("geo");
    if (!geo.ok) {
      toast.error(geo.message);
      setBusy(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const noteParts: string[] = [];
    if (geo.coords) noteParts.push(`@${geo.coords.lat.toFixed(5)},${geo.coords.lng.toFixed(5)} ±${Math.round(geo.coords.accuracy)}m`);
    else if (geo.message === "已連接公司 WiFi") noteParts.push("WiFi驗證");
    const { error } = await supabase.from("attendance").insert({
      user_id: user.id,
      type: nextAction,
      clocked_at: nowIso,
      note: noteParts.join(" ") || null,
    });
    if (error) { toast.error("打卡失敗:" + error.message); setBusy(false); return; }

    playClockSound(nextAction);
    toast.success(`${nextAction === "clock_in" ? "上班" : "下班"}打卡成功 · ${geo.message}`);

    await loadRecords();
    setBusy(false);
  };

  const LEAVE_LABEL: Record<string, string> = { annual: "特休", sick: "病假", personal: "事假", overtime: "加班", official: "公出" };

  // Build a per-day leave-type map for current user (approved leaves)
  const myLeaveByDate = useMemo(() => {
    const m: Record<string, string> = {};
    leaves.filter(l => l.user_id === user?.id).forEach(l => {
      const s = new Date(l.start_at), e = new Date(l.end_at);
      const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      const last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
      while (cur <= last) {
        const dk = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        m[dk] = LEAVE_LABEL[l.leave_type] || l.leave_type;
        cur.setDate(cur.getDate() + 1);
      }
    });
    return m;
  }, [leaves, user]);

  // Monthly worked hours (current month)
  const monthlyHours = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth();
    const start = new Date(y, m, 1).getTime(), end = new Date(y, m + 1, 1).getTime();
    const recs = myRecords.filter(r => {
      const t = new Date(r.clocked_at).getTime();
      return t >= start && t < end;
    });
    const days: Record<string, { in?: string; out?: string }> = {};
    [...recs].sort((a, b) => a.clocked_at.localeCompare(b.clocked_at)).forEach(r => {
      const dk = dateKey(r.clocked_at);
      if (!days[dk]) days[dk] = {};
      if (r.type === "clock_in" && !days[dk].in) days[dk].in = r.clocked_at;
      if (r.type === "clock_out") days[dk].out = r.clocked_at;
    });
    const total = Object.values(days).reduce((s, d) => s + calcWorkedHours(d.in, d.out), 0);
    return Math.round(total * 100) / 100;
  }, [myRecords]);

  // 特休統計
  const annualTotal = useMemo(() => calcAnnualLeaveDays(hireDate), [hireDate]);
  const usedAnnualDays = useMemo(() => {
    const year = new Date().getFullYear();
    let days = 0;
    leaves.filter(l => l.user_id === user?.id && l.leave_type === "annual").forEach(l => {
      const s = new Date(l.start_at), e = new Date(l.end_at);
      if (s.getFullYear() === year) {
        days += Math.max(0.5, Math.round(((e.getTime() - s.getTime()) / 86400000) * 2) / 2);
      }
    });
    return days;
  }, [leaves, user]);
  const annualRemain = Math.max(0, annualTotal - usedAnnualDays);

  // 今日所有員工出勤狀況
  const todayAllAttendance = useMemo(() => {
    const todayKey = dateKey(new Date().toISOString());
    const byUser: Record<string, { in?: boolean; out?: boolean }> = {};
    [...allAtt].sort((a, b) => a.clocked_at.localeCompare(b.clocked_at)).forEach(r => {
      if (dateKey(r.clocked_at) !== todayKey) return;
      if (!byUser[r.user_id]) byUser[r.user_id] = {};
      if (r.type === "clock_in" && !byUser[r.user_id].in) byUser[r.user_id].in = true;
      if (r.type === "clock_out") byUser[r.user_id].out = true;
    });
    const todayLeaves = leaves.filter(l => {
      const s = new Date(l.start_at), e = new Date(l.end_at);
      const t = new Date();
      const sk = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
      const ek = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
      const tk = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
      return tk >= sk && tk <= ek;
    });
    return { byUser, todayLeaves };
  }, [allAtt, leaves]);

  // Export my own records
  const exportMine = () => {
    if (!user) return;
    const [y, m] = exportMonth.split("-").map(Number);
    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();
    const monthRecs = myRecords.filter(r => {
      const t = new Date(r.clocked_at).getTime();
      return t >= start && t < end;
    });
    const days: Record<string, { date: string; in?: string; out?: string }> = {};
    [...monthRecs].sort((a, b) => a.clocked_at.localeCompare(b.clocked_at)).forEach(r => {
      const dk = dateKey(r.clocked_at);
      if (!days[dk]) days[dk] = { date: dk };
      if (r.type === "clock_in" && !days[dk].in) days[dk].in = r.clocked_at;
      if (r.type === "clock_out") days[dk].out = r.clocked_at;
    });
    // include dates that have only a leave
    Object.keys(myLeaveByDate).forEach(dk => {
      if (dk.startsWith(exportMonth) && !days[dk]) days[dk] = { date: dk };
    });
    const sorted = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
    let totalHours = 0;
    const rows = sorted.map(d => {
      const worked = calcWorkedHours(d.in, d.out);
      totalHours += worked;
      return {
        日期: d.date,
        上班時間: d.in ? new Date(d.in).toLocaleTimeString("zh-TW", { hour12: false }) : "",
        下班時間: d.out ? new Date(d.out).toLocaleTimeString("zh-TW", { hour12: false }) : "",
        假別: myLeaveByDate[d.date] || "",
        總時數: worked || "",
      };
    });
    rows.push({ 日期: "本月總計", 上班時間: "", 下班時間: "", 假別: "", 總時數: Math.round(totalHours * 100) / 100 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "個人打卡");
    const me = profileMap[user.id]?.name || "員工";
    XLSX.writeFile(wb, `${me}_打卡紀錄_${exportMonth}.xlsx`);
    toast.success("已匯出");
  };

  if (loading || !user) return null;
  if (!dataLoaded) return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl">
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <Skeleton className="mt-8 h-96 rounded-2xl" />
    </div>
  );

  const myName = profileMap[user.id]?.name;

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl">
      {myName && (
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              {(() => { const h = now.getHours(); return h < 12 ? "☀ 早安" : h < 18 ? "🌤 午安" : "🌙 晚安"; })()}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {myName}，你好！
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {now.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: "0.05s" }}>
        {/* Clock card */}
        <div className="rounded-2xl p-8 text-primary-foreground relative overflow-hidden" style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-elegant)" }}>
          {/* Subtle background decoration */}
          <div className="pointer-events-none absolute top-0 right-0 h-40 w-40 opacity-10 rounded-full"
            style={{ background: "radial-gradient(circle, white, transparent 70%)", transform: "translate(30%, -30%)" }} />
          <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-32 opacity-5 rounded-full"
            style={{ background: "radial-gradient(circle, white, transparent 70%)", transform: "translate(-30%, 30%)" }} />

          <div className="relative">
            <div className="flex items-center gap-2 text-xs text-primary-foreground/70 mb-3 font-medium uppercase tracking-wider">
              <Clock className="h-3.5 w-3.5" />
              今日打卡
            </div>
            <div className="text-5xl md:text-6xl font-bold tabular-nums tracking-tight leading-none">
              {now.toLocaleTimeString("zh-TW", { hour12: false, hour: "2-digit", minute: "2-digit" })}
              <span className="text-2xl md:text-3xl font-normal opacity-60 ml-1">
                :{String(now.getSeconds()).padStart(2, "0")}
              </span>
            </div>
            <p className="text-xs text-primary-foreground/60 mt-2">
              {now.toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" })}
            </p>
            <HoldButton
              onHoldComplete={handleClock}
              disabled={busy || todayDone}
              size="lg"
              className="w-full font-semibold text-base h-14 mt-5 border-0"
              style={{
                background: todayDone ? "rgba(255,255,255,0.15)" : nextAction === "clock_in" ? "var(--clock-in)" : "var(--clock-out)",
                color: "#fff",
                backdropFilter: todayDone ? "blur(4px)" : undefined,
              }}
            >
              {todayDone ? <><Check className="h-5 w-5" /> 今日打卡完成</> : nextAction === "clock_in" ? <><LogIn className="h-5 w-5" /> 長按 2 秒上班打卡</> : <><LogOut className="h-5 w-5" /> 長按 2 秒下班打卡</>}
            </HoldButton>
            <p className="text-[11px] text-primary-foreground/50 mt-2.5 text-center flex items-center justify-center gap-1">
              <MapPin className="h-3 w-3" /> 限於 {OFFICE_LOCATION.name} {OFFICE_LOCATION.radiusMeters}m 內，或連接公司 WiFi
            </p>
          </div>
        </div>

        {/* Today's records card */}
        <div className="rounded-2xl p-6 bg-card border flex flex-col" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">今日紀錄</h2>
            <span className="text-xs px-2.5 py-1 rounded-full border font-medium"
              style={{ background: employeeType === "monthly" ? "oklch(0.28 0.09 255 / 0.08)" : "oklch(0.62 0.15 155 / 0.08)",
                       borderColor: employeeType === "monthly" ? "oklch(0.28 0.09 255 / 0.2)" : "oklch(0.62 0.15 155 / 0.2)",
                       color: employeeType === "monthly" ? "oklch(0.28 0.09 255)" : "oklch(0.5 0.15 155)" }}>
              {employeeType === "monthly" ? "正職" : "兼職"}
            </span>
          </div>
          {todayRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">今天還沒有打卡紀錄</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {todayRecords.map(r => (
                <li key={r.id} className="flex items-center justify-between px-4 py-3 rounded-xl border"
                  style={{ borderLeftWidth: "3px", borderLeftColor: r.type === "clock_in" ? "var(--clock-in)" : "var(--clock-out)",
                           background: r.type === "clock_in" ? "oklch(0.62 0.15 155 / 0.04)" : "oklch(0.62 0.18 35 / 0.04)" }}>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: r.type === "clock_in" ? "var(--clock-in)" : "var(--clock-out)" }} />
                    <span className="text-sm font-medium" style={{ color: r.type === "clock_in" ? "var(--clock-in)" : "var(--clock-out)" }}>
                      {r.type === "clock_in" ? "上班打卡" : "下班打卡"}
                    </span>
                  </div>
                  <span className="tabular-nums text-sm font-semibold">
                    {new Date(r.clocked_at).toLocaleTimeString("zh-TW", { hour12: false })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Stats: 本月工時 + 加班 + 特休 */}
          <div className="mt-auto pt-4 grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 flex flex-col gap-0.5">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">本月工時</div>
              <div className="font-bold tabular-nums text-primary text-lg leading-none mt-1">{monthlyHours.toFixed(1)}<span className="text-xs font-normal ml-0.5">h</span></div>
            </div>
            <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 flex flex-col gap-0.5">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">加班餘額</div>
              <div className="font-bold tabular-nums text-lg leading-none mt-1" style={{ color: "var(--clock-out)" }}>{otBalance.toFixed(1)}<span className="text-xs font-normal ml-0.5">h</span></div>
            </div>
            <div className="p-3 rounded-xl bg-success/5 border border-success/20 flex flex-col gap-0.5">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">剩餘特休</div>
              <div className="font-bold tabular-nums text-success text-lg leading-none mt-1">{annualRemain.toFixed(1)}<span className="text-xs font-normal ml-0.5">/{annualTotal}天</span></div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t space-y-3">
            <div>
              <Label className="text-xs">匯出月份</Label>
              <Input type="month" value={exportMonth} onChange={e => setExportMonth(e.target.value)} className="mt-1 h-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={exportMine} className="gap-1 h-9 flex-1 min-w-[120px]"><Download className="h-3.5 w-3.5" /> 匯出我的紀錄</Button>
              <Dialog open={makeupOpen} onOpenChange={setMakeupOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1 h-9 flex-1 min-w-[120px]"><Plus className="h-3.5 w-3.5" /> 補打卡申請</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>補打卡申請</DialogTitle></DialogHeader>
                  <MakeupForm userId={user.id} onDone={() => setMakeupOpen(false)} />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* 公告欄 */}
      <div className="mt-8 rounded-2xl bg-card border overflow-hidden animate-fade-in" style={{ boxShadow: "var(--shadow-soft)", animationDelay: "0.1s" }}>
        <div className="px-6 py-4 border-b flex items-center gap-3" style={{ background: "oklch(0.28 0.09 255 / 0.03)" }}>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "oklch(0.28 0.09 255 / 0.1)" }}>
            <Info className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">公告欄</h2>
        </div>
        <div className="p-6 text-sm text-muted-foreground space-y-2 leading-relaxed">
          {announcement ? (
            announcement.split("\n").filter(l => l.trim()).map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />
                <p>{line.startsWith("·") ? line.slice(1).trim() : line}</p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground/50 italic py-2">目前無公告內容。</p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-semibold text-lg mb-4 tracking-tight">出勤日曆</h2>
        <div className="relative">
          {calendarLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 rounded-2xl">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          <AttendanceCalendar records={calendarCells} holidays={holidays} mode="personal" onMonthChange={loadMonth} />
        </div>
      </div>

      {/* 今日出勤清單 */}
      <div className="mt-8 rounded-2xl bg-card border overflow-hidden animate-fade-in" style={{ boxShadow: "var(--shadow-soft)", animationDelay: "0.15s" }}>
        <div className="px-6 py-4 border-b flex items-center gap-3" style={{ background: "oklch(0.28 0.09 255 / 0.03)" }}>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "oklch(0.28 0.09 255 / 0.1)" }}>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">今日出勤清單</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {Object.keys(todayAllAttendance.byUser).length} 人出勤
          </span>
        </div>
        <div className="p-4">
          {Object.keys(todayAllAttendance.byUser).length === 0 && todayAllAttendance.todayLeaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">今日尚無人打卡或請假</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(todayAllAttendance.byUser).map(([uid, t]) => {
                const p = profileMap[uid];
                const color = p?.color || "oklch(0.28 0.09 255)";
                const initials = (p?.name || "員").slice(0, 2);
                return (
                  <div key={uid} className="flex items-center gap-3 px-4 py-3 rounded-xl border card-hover" style={{ borderLeftWidth: "3px", borderLeftColor: color }}>
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0 select-none"
                      style={{ background: color }}>
                      {initials}
                    </div>
                    <span className="font-medium text-sm flex-1">{p?.name || "員工"}</span>
                    <div className="flex gap-2 text-xs">
                      {t.out
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted" style={{ color: "var(--clock-out)" }}>下班</span>
                        : t.in
                        ? <span className="text-muted-foreground text-[11px] px-2 py-0.5 rounded-full bg-muted">在班中</span>
                        : null}
                    </div>
                  </div>
                );
              })}
              {todayAllAttendance.todayLeaves.map((l, i) => (
                <div key={`l${i}`} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-warning/30 bg-warning/5">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 select-none bg-warning/20 text-warning-foreground">
                    {(profileMap[l.user_id]?.name || "員").slice(0, 2)}
                  </div>
                  <span className="font-medium text-sm flex-1">{profileMap[l.user_id]?.name || "員工"}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-warning/20 text-warning-foreground">{leaveLabel(l.leave_type)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MakeupForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [type, setType] = useState<"clock_in" | "clock_out">("clock_in");
  const [targetDt, setTargetDt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDt) return toast.error("請選擇補打卡時間");
    setBusy(true);
    const { error } = await supabase.from("makeup_requests").insert({
      user_id: userId, type, target_time: new Date(targetDt).toISOString(), reason: reason || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("已送出,待管理員審核"); onDone(); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-3 mt-2">
      <div>
        <Label>類型</Label>
        <Select value={type} onValueChange={(v) => setType(v as "clock_in" | "clock_out")}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="clock_in">補上班打卡</SelectItem>
            <SelectItem value="clock_out">補下班打卡</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>實際時間</Label>
        <Input type="datetime-local" value={targetDt} onChange={e => setTargetDt(e.target.value)} className="mt-1.5" />
      </div>
      <div>
        <Label>原因</Label>
        <Textarea value={reason} onChange={e => setReason(e.target.value)} className="mt-1.5" rows={3} placeholder="例:忘記打卡、系統異常" />
      </div>
      <Button type="submit" disabled={busy} className="w-full">{busy ? "送出中..." : "送出申請"}</Button>
    </form>
  );
}
