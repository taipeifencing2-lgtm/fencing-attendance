import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Check, X, Download, Calendar, Plus, Trash2, Pencil, Save, Shield, CloudDownload, Users, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calcWorkedHours, isRestDay, STANDARD_DAILY_HOURS, type Holiday } from "@/lib/work-hours";
import { AttendanceCalendar, type DayCell } from "@/components/AttendanceCalendar";
import { fetchTaiwanHolidays } from "@/lib/holidays-tw";
import { tenureLabel } from "@/lib/annual-leave";
import { leaveLabel } from "@/lib/leave-types";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type AppRole = "admin" | "employee" | "superadmin" | "leader" | "secretary_general" | "executive_director";
type ManageableRole = "admin" | "employee" | "leader" | "secretary_general" | "executive_director";
const ROLE_LABEL: Record<AppRole, string> = {
  superadmin: "超級管理員", admin: "管理員",
  executive_director: "執行長", secretary_general: "秘書長",
  leader: "組長", employee: "一般員工",
};

const STATUS_LABEL: Record<string, string> = { pending: "待審核", approved: "已核准", rejected: "已拒絕", withdrawn: "已撤回" };
const DEFAULT_COLORS = ["#2563eb", "#16a34a", "#db2777", "#f59e0b", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];

interface ProfileRow { id: string; full_name: string | null; email: string | null; employee_type: "monthly" | "hourly"; display_color: string | null; hire_date: string | null; }
interface AttRow { id: string; user_id: string; type: "clock_in" | "clock_out"; clocked_at: string; note: string | null; }
interface LeaveRow { id: string; user_id: string; leave_type: string; start_at: string; end_at: string; reason: string | null; status: "pending" | "approved" | "rejected"; created_at: string; use_overtime_hours: number; leader_status: "pending" | "approved" | "rejected" | null; secretary_status: "pending" | "approved" | "rejected" | null; exec_status: "pending" | "approved" | "rejected" | null; attachment_url: string | null; review_note: string | null; }
interface OtRow { id: string; user_id: string; hours: number; source: string; reason: string | null; created_at: string; }
interface RoleRow { user_id: string; role: AppRole; }
interface MakeupRow { id: string; user_id: string; type: "clock_in" | "clock_out"; target_time: string; reason: string | null; status: "pending" | "approved" | "rejected"; created_at: string; }

function getMonthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AdminPage() {
  const { user, role, isAdminOrAbove, isSuperadmin, isLeaderOrAbove, isSecretaryOrAbove, isExecutiveDirectorOrAbove, loading } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [att, setAtt] = useState<AttRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [otTx, setOtTx] = useState<OtRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [summaryFilter, setSummaryFilter] = useState<string>("all");
  const [exportTarget, setExportTarget] = useState<string>("all");
  const [makeupReqs, setMakeupReqs] = useState<MakeupRow[]>([]);
  const [noteModal, setNoteModal] = useState<{ fn: (note: string) => void; title: string; destructive?: boolean } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [leaveFilterUser, setLeaveFilterUser] = useState("all");
  const [leaveFilterType, setLeaveFilterType] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [workStartHour, setWorkStartHour] = useState(9);
  const [workEndHour, setWorkEndHour] = useState(18);
  const [workStartDraft, setWorkStartDraft] = useState(9);
  const [workEndDraft, setWorkEndDraft] = useState(18);
  const [systemStartDate, setSystemStartDate] = useState("2026-06-01");
  const [systemStartDraft, setSystemStartDraft] = useState("2026-06-01");
  const [dataLoaded, setDataLoaded] = useState(false);
  const monthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenRef = useRef(0);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (role && !isLeaderOrAbove) navigate({ to: "/dashboard" });
  }, [loading, user, role, isLeaderOrAbove, navigate]);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const { startISO, endISO } = getMonthRange(month);
    const year = new Date().getFullYear();
    const [{ data: p }, { data: a }, { data: l }, { data: ot }, { data: r }, { data: mk }, twH0, twH1] = await Promise.all([
      supabase.rpc("get_all_profiles"),
      supabase.from("attendance").select("*").gte("clocked_at", startISO).lt("clocked_at", endISO).order("clocked_at", { ascending: false }),
      supabase.rpc("get_all_leave_requests", { p_start: startISO, p_end: endISO }),
      supabase.rpc("get_all_overtime_transactions"),
      supabase.rpc("get_all_roles"),
      supabase.rpc("get_all_makeup_requests"),
      fetchTaiwanHolidays(year).catch(() => []),
      fetchTaiwanHolidays(year + 1).catch(() => []),
    ]);
    if (gen !== loadGenRef.current) return;
    const map: Record<string, ProfileRow> = {};
    (p ?? []).forEach((x) => { map[x.id] = x as ProfileRow; });
    setProfiles(map);
    setAtt((a ?? []) as AttRow[]);
    setLeaves((l ?? []) as LeaveRow[]);
    setHolidays([...twH0, ...twH1] as Holiday[]);
    setOtTx((ot ?? []) as OtRow[]);
    setRoles((r ?? []) as RoleRow[]);
    setMakeupReqs((mk ?? []) as MakeupRow[]);
    setDataLoaded(true);
  }, [month]);

  useEffect(() => { if (isLeaderOrAbove) load(); }, [isLeaderOrAbove, load]);

  // 即時通知：有新假單送入時自動重整並提示
  useEffect(() => {
    if (!isLeaderOrAbove) return;
    const channel = supabase
      .channel("admin_leave_inserts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leave_requests" }, () => {
        toast.info("有新的差勤申請");
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isLeaderOrAbove, load]);

  useEffect(() => {
    supabase.from("site_settings").select("key,value").in("key", ["announcement", "work_start_hour", "work_end_hour", "system_start_date"]).then(({ data }) => {
      (data ?? []).forEach((s: { key: string; value: string }) => {
        if (s.key === "announcement") { setAnnouncement(s.value); setAnnouncementDraft(s.value); }
        if (s.key === "work_start_hour") { const n = Number(s.value) || 9; setWorkStartHour(n); setWorkStartDraft(n); }
        if (s.key === "work_end_hour") { const n = Number(s.value) || 18; setWorkEndHour(n); setWorkEndDraft(n); }
        if (s.key === "system_start_date" && s.value) { setSystemStartDate(s.value); setSystemStartDraft(s.value); }
      });
    });
  }, []);

  // 全部員工(包含超管,但對外顯示時隱藏其超管身份)
  const allProfiles = useMemo(
    () => Object.values(profiles).sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "")),
    [profiles]
  );

  // 核准時自動補記加班時數（僅 overtime 類型累積正數）
  // 折抵扣除由 DB trigger handle_leave_overtime_offset 自動處理，勿在此重複
  const addOvertimeIfApproved = async (leaveId: string, userId: string, startAt: string, endAt: string, leaveType: string, _useOtHours?: number) => {
    if (leaveType !== "overtime") return;
    await supabase.rpc("record_overtime_for_leave", {
      p_leave_id: leaveId,
      p_user_id: userId,
      p_start_at: startAt,
      p_end_at: endAt,
      p_leave_type: leaveType,
    });
  };

  const review = async (id: string, status: "approved" | "rejected", note = "") => {
    // 強制核准/拒絕時，同步所有階段燈號
    const stageUpdate = status === "approved"
      ? { leader_status: "approved" as const, secretary_status: "approved" as const, exec_status: "approved" as const }
      : { leader_status: "rejected" as const, secretary_status: null, exec_status: null };
    const { error } = await supabase
      .from("leave_requests")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_note: note || null, ...stageUpdate })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "approved" ? "已核准" : "已拒絕");
      if (status === "approved") {
        const lv = leaves.find(l => l.id === id);
        if (lv) await addOvertimeIfApproved(lv.id, lv.user_id, lv.start_at, lv.end_at, lv.leave_type, lv.use_overtime_hours);
      }
      load();
    }
  };

  const getExistingRoles = async () => {
    const { data } = await supabase.rpc("get_existing_roles");
    return new Set((data ?? []).map((r: { role: string }) => r.role));
  };

  // 第一階段：組長審核
  const reviewLeader = async (id: string, s: "approved" | "rejected", note = "") => {
    const base = {
      leader_status: s,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    };
    let extra: { status?: "approved" | "rejected"; secretary_status?: "pending"; exec_status?: "pending" } = {};
    if (s === "rejected") {
      extra = { status: "rejected" };
    } else {
      const roles = await getExistingRoles();
      if (roles.has("secretary_general")) extra = { secretary_status: "pending" };
      else if (roles.has("executive_director")) extra = { exec_status: "pending" };
      else extra = { status: "approved" };
    }
    const { error } = await supabase.from("leave_requests").update({ ...base, ...extra }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(s === "approved" ? "組長已核准" : "已拒絕");
      if (s === "approved" && (extra as { status?: string }).status === "approved") {
        const lv = leaves.find(l => l.id === id);
        if (lv) await addOvertimeIfApproved(lv.id, lv.user_id, lv.start_at, lv.end_at, lv.leave_type, lv.use_overtime_hours);
      }
      load();
    }
  };

  // 第二階段：秘書長審核
  const reviewSecretary = async (id: string, s: "approved" | "rejected", note = "") => {
    const lv = leaves.find(l => l.id === id);
    const update: Record<string, unknown> = {
      secretary_status: s,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    };
    if (s === "rejected") {
      update.status = "rejected";
    } else {
      // 檢查是否還有執行長階段
      const existingRoles = await getExistingRoles();
      if (existingRoles.has("executive_director")) {
        update.exec_status = "pending";
      } else {
        update.status = "approved";
      }
    }
    // 組長階段若還是 pending，標為 null（跳過，顯示 -）
    if (s === "approved" && lv?.leader_status === "pending") update.leader_status = null;
    const { error } = await supabase.from("leave_requests").update(update).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(s === "approved" ? "秘書長已核准" : "已拒絕");
      if (s === "approved" && (update as { status?: string }).status === "approved") {
        if (lv) await addOvertimeIfApproved(lv.id, lv.user_id, lv.start_at, lv.end_at, lv.leave_type, lv.use_overtime_hours);
      }
      load();
    }
  };

  // 第三階段：執行長審核（核准直接通過，跳過的前階段標為 null）
  const reviewExec = async (id: string, s: "approved" | "rejected", note = "") => {
    const lv = leaves.find(l => l.id === id);
    const update: Record<string, unknown> = {
      exec_status: s,
      status: s,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    };
    // 前面階段若還是 pending，標為 null（跳過，顯示 -）
    if (s === "approved" && lv?.leader_status === "pending") update.leader_status = null;
    if (s === "approved" && lv?.secretary_status === "pending") update.secretary_status = null;
    const { error } = await supabase.from("leave_requests").update(update).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(s === "approved" ? "已核准" : "已拒絕");
      if (s === "approved") {
        if (lv) await addOvertimeIfApproved(lv.id, lv.user_id, lv.start_at, lv.end_at, lv.leave_type, lv.use_overtime_hours);
      }
      load();
    }
  };

  const adminWithdraw = async (id: string) => {
    const { error } = await supabase.from("leave_requests").update({ status: "withdrawn" }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("已撤回申請"); load(); }
  };

  const updateEmployeeType = async (id: string, t: "monthly" | "hourly") => {
    const { error } = await supabase.rpc("update_employee_profile", { target_id: id, p_employee_type: t });
    if (error) toast.error(error.message); else { toast.success("員工類型已更新"); load(); }
  };
  const updateName = async (id: string, name: string) => {
    const { error } = await supabase.rpc("update_employee_profile", { target_id: id, p_full_name: name });
    if (error) toast.error(error.message); else { toast.success("姓名已更新"); load(); }
  };
  const updateColor = async (id: string, color: string) => {
    const { error } = await supabase.rpc("update_employee_profile", { target_id: id, p_display_color: color });
    if (error) toast.error(error.message); else { toast.success("顏色已更新"); load(); }
  };
  const updateRole = async (uid: string, newRole: ManageableRole) => {
    const { error } = await supabase.rpc("set_user_role", { target_user_id: uid, new_role: newRole });
    if (error) toast.error(error.message); else { toast.success("權限已更新"); load(); }
  };

  const saveAnnouncement = async () => {
    const { error } = await supabase.from("site_settings").upsert({ key: "announcement", value: announcementDraft });
    if (error) toast.error(error.message);
    else { setAnnouncement(announcementDraft); toast.success("公告已儲存"); }
  };

  const saveWorkHours = async () => {
    const [r1, r2] = await Promise.all([
      supabase.from("site_settings").upsert({ key: "work_start_hour", value: String(workStartDraft) }),
      supabase.from("site_settings").upsert({ key: "work_end_hour", value: String(workEndDraft) }),
    ]);
    if (r1.error || r2.error) toast.error((r1.error || r2.error)!.message);
    else { setWorkStartHour(workStartDraft); setWorkEndHour(workEndDraft); toast.success("上下班時間已儲存"); }
  };

  const saveSystemStart = async () => {
    const { error } = await supabase.from("site_settings").upsert({ key: "system_start_date", value: systemStartDraft });
    if (error) toast.error(error.message);
    else { setSystemStartDate(systemStartDraft); toast.success("系統起始日已儲存"); }
  };

  const handleCalendarMonthChange = useCallback((m: string) => {
    if (monthDebounceRef.current) clearTimeout(monthDebounceRef.current);
    monthDebounceRef.current = setTimeout(() => setMonth(m), 400);
  }, []);

  const updateHireDate = async (uid: string, date: string) => {
    const { error } = await supabase.rpc("update_employee_profile", { target_id: uid, p_hire_date: date || null });
    if (error) toast.error(error.message); else { toast.success("到職日已更新"); load(); }
  };

  const name = (uid: string) => profiles[uid]?.full_name || profiles[uid]?.email || uid.slice(0, 8);
  const userEmail = (uid: string) => profiles[uid]?.email || "";
  const colorOf = (uid: string) => profiles[uid]?.display_color || null;
  // 對外顯示的角色:超管對任何人都顯示為「員工」
  const displayedRoleOf = (uid: string): ManageableRole => {
    const r = roles.find(x => x.user_id === uid);
    const real = r?.role as AppRole | undefined;
    if (!real || real === "superadmin") return "employee";
    return real as ManageableRole;
  };

  // Build per-employee daily summary
  const dailySummary = useMemo(() => {
    const grouped: Record<string, { user_id: string; date: string; clock_in?: string; clock_out?: string }> = {};
    [...att].sort((a, b) => a.clocked_at.localeCompare(b.clocked_at)).forEach((r) => {
      const dk = dateKey(r.clocked_at);
      const k = `${r.user_id}_${dk}`;
      if (!grouped[k]) grouped[k] = { user_id: r.user_id, date: dk };
      if (r.type === "clock_in" && !grouped[k].clock_in) grouped[k].clock_in = r.clocked_at;
      if (r.type === "clock_out") grouped[k].clock_out = r.clocked_at;
    });
    return Object.values(grouped).sort((a, b) => (a.date + a.user_id).localeCompare(b.date + b.user_id));
  }, [att]);

  const filteredSummary = useMemo(
    () => summaryFilter === "all" ? dailySummary : dailySummary.filter(r => r.user_id === summaryFilter),
    [dailySummary, summaryFilter]
  );

  const pendingLeaveCount = useMemo(() => leaves.filter(l => l.status === "pending").length, [leaves]);

  const filteredLeaves = useMemo(() => leaves.filter(r => {
    if (leaveFilterUser !== "all" && r.user_id !== leaveFilterUser) return false;
    if (leaveFilterType !== "all" && r.leave_type !== leaveFilterType) return false;
    return true;
  }), [leaves, leaveFilterUser, leaveFilterType]);

  const pendingLeaves = useMemo(() => filteredLeaves.filter(r => r.status === "pending"), [filteredLeaves]);
  const completedLeaves = useMemo(() => filteredLeaves.filter(r => r.status !== "pending" && r.status !== "withdrawn"), [filteredLeaves]);
  const withdrawnLeaves = useMemo(() => filteredLeaves.filter(r => r.status === "withdrawn"), [filteredLeaves]);

  // 管理員日曆:每日出勤人員 + 請假
  const adminCalendarCells = useMemo<DayCell[]>(() => {
    const map: Record<string, { presentUsers: Map<string, { id: string; name: string; color?: string | null; inTime?: string; outTime?: string }>; leaves: { user_id: string; user_name: string; leave_type: string }[] }> = {};
    dailySummary.forEach(r => {
      if (!map[r.date]) map[r.date] = { presentUsers: new Map(), leaves: [] };
      if (r.clock_in || r.clock_out) {
        map[r.date].presentUsers.set(r.user_id, {
          id: r.user_id, name: name(r.user_id), color: colorOf(r.user_id),
          inTime: r.clock_in, outTime: r.clock_out,
        });
      }
    });
    leaves.filter(l => l.status === "approved").forEach(l => {
      const start = new Date(l.start_at);
      const end = new Date(l.end_at);
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cur <= last) {
        const dk = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        if (!map[dk]) map[dk] = { presentUsers: new Map(), leaves: [] };
        map[dk].leaves.push({ user_id: l.user_id, user_name: name(l.user_id), leave_type: l.leave_type });
        cur.setDate(cur.getDate() + 1);
      }
    });
    return Object.entries(map).map(([date, v]) => ({
      date, presentUsers: Array.from(v.presentUsers.values()), leaves: v.leaves,
    }));
  }, [dailySummary, leaves, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportExcel = (targetUid: string = "all") => {
    const wb = XLSX.utils.book_new();
    const monthlyIds = new Set(allProfiles.filter(p => p.employee_type === "monthly").map(p => p.id));
    const monthlyRows: Record<string, unknown>[] = [];
    const hourlyRows: Record<string, unknown>[] = [];
    const totalsByUser: Record<string, { 員工: string; Email: string; 類型: string; 出勤天數: number; 總時數: number }> = {};

    // Build leave-by-(user,date)
    const leaveByDay: Record<string, string> = {};
    leaves.filter(l => l.status === "approved").forEach(l => {
      const s = new Date(l.start_at), e = new Date(l.end_at);
      const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      const last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
      while (cur <= last) {
        const dk = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        leaveByDay[`${l.user_id}|${dk}`] = leaveLabel(l.leave_type);
        cur.setDate(cur.getDate() + 1);
      }
    });

    const filtered = targetUid === "all" ? dailySummary : dailySummary.filter(r => r.user_id === targetUid);

    // Include leave-only days (no attendance)
    const seen = new Set(filtered.map(r => `${r.user_id}|${r.date}`));
    const extraLeaveRows: { user_id: string; date: string; clock_in?: string; clock_out?: string }[] = [];
    Object.keys(leaveByDay).forEach(k => {
      const [uid, dk] = k.split("|");
      if (targetUid !== "all" && uid !== targetUid) return;
      if (!dk.startsWith(month)) return;
      if (!seen.has(k)) extraLeaveRows.push({ user_id: uid, date: dk });
    });

    const allRows = [...filtered, ...extraLeaveRows].sort((a, b) =>
      (a.date + a.user_id).localeCompare(b.date + b.user_id)
    );

    allRows.forEach((r) => {
      const worked = calcWorkedHours(r.clock_in, r.clock_out);
      const inT = r.clock_in ? new Date(r.clock_in) : null;
      const outT = r.clock_out ? new Date(r.clock_out) : null;
      const leaveLabel = leaveByDay[`${r.user_id}|${r.date}`] || "";
      const row: Record<string, unknown> = {
        日期: r.date,
        ...(targetUid === "all" ? { 員工: name(r.user_id) } : {}),
        上班時間: inT ? inT.toLocaleTimeString("zh-TW", { hour12: false }) : "",
        下班時間: outT ? outT.toLocaleTimeString("zh-TW", { hour12: false }) : "",
        假別: leaveLabel,
        總時數: worked || "",
      };
      const isMonthly = monthlyIds.has(r.user_id);
      if (isMonthly) monthlyRows.push(row); else hourlyRows.push(row);
      if (!totalsByUser[r.user_id]) totalsByUser[r.user_id] = {
        員工: name(r.user_id), Email: userEmail(r.user_id),
        類型: isMonthly ? "正職" : "兼職", 出勤天數: 0, 總時數: 0,
      };
      if (worked) { totalsByUser[r.user_id].出勤天數 += 1; totalsByUser[r.user_id].總時數 += worked; }
    });

    if (monthlyRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), "正職出勤");
    if (hourlyRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hourlyRows), "兼職出勤");

    const totalRows = Object.values(totalsByUser).map(t => ({ ...t, 總時數: Math.round(t.總時數 * 100) / 100 }));
    if (totalRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalRows), "月時數統計");

    const leaveSrc = targetUid === "all" ? leaves : leaves.filter(l => l.user_id === targetUid);
    const leaveDetails = leaveSrc.map((r) => ({
      員工: name(r.user_id),
      Email: userEmail(r.user_id),
      類型: leaveLabel(r.leave_type),
      開始: new Date(r.start_at).toLocaleString("zh-TW", { hour12: false }),
      結束: new Date(r.end_at).toLocaleString("zh-TW", { hour12: false }),
      折抵加班時數: r.use_overtime_hours || "",
      原因: r.reason || "",
      狀態: STATUS_LABEL[r.status] ?? r.status,
    }));
    if (leaveDetails.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leaveDetails), "差勤申請");

    const otSrc = targetUid === "all" ? otTx : otTx.filter(r => r.user_id === targetUid);
    const otRows = otSrc.map(r => ({
      員工: name(r.user_id),
      Email: userEmail(r.user_id),
      時數: r.hours,
      類別: r.source === "leave_offset" ? "請假折抵" : r.source === "overtime" ? "加班累積" : "手動調整",
      原因: r.reason || "",
      時間: new Date(r.created_at).toLocaleString("zh-TW", { hour12: false }),
    }));
    if (otRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(otRows), "加班時數異動");

    const who = targetUid === "all" ? "全體" : name(targetUid);
    XLSX.writeFile(wb, `中華民國擊劍協會_差勤月報_${who}_${month}.xlsx`);
    toast.success("月報已匯出");
  };

  if (loading || !user || !isLeaderOrAbove) return null;
  if (!dataLoaded) return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl space-y-6">
      <Skeleton className="h-12 w-48 rounded-xl" />
      <div className="flex gap-2 flex-wrap">
        {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-lg" />)}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">管理後台</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
              {role === "superadmin" ? "管理員" : (ROLE_LABEL[role as AppRole] ?? role)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">查看並審核全協會差勤資料</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs flex items-center gap-1 mb-1.5 text-muted-foreground"><Calendar className="h-3 w-3" /> 月份</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40 h-9" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">匯出對象</Label>
            <Select value={exportTarget} onValueChange={setExportTarget}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部員工</SelectItem>
                {allProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => exportExcel(exportTarget)} variant="outline" className="gap-2 h-9">
            <Download className="h-4 w-4" /> 匯出月報
          </Button>
        </div>
      </div>

      <Tabs defaultValue="leaves">
        <TabsList className="flex-wrap h-auto gap-0.5">
          <TabsTrigger value="leaves" className="gap-1">差勤申請{pendingLeaveCount > 0 && <span className="ml-0.5 text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5 font-bold">{pendingLeaveCount}</span>}</TabsTrigger>
          <TabsTrigger value="makeup" className="gap-1">補打卡審核{makeupReqs.filter(m => m.status === "pending").length > 0 && <span className="ml-0.5 text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5 font-bold">{makeupReqs.filter(m => m.status === "pending").length}</span>}</TabsTrigger>
          <TabsTrigger value="calendar">出勤日曆</TabsTrigger>
          <TabsTrigger value="summary">每日出勤</TabsTrigger>
          <TabsTrigger value="overtime">加班時數</TabsTrigger>
          <TabsTrigger value="employees">員工管理</TabsTrigger>
          {isSecretaryOrAbove && <TabsTrigger value="holidays">假日設定</TabsTrigger>}
          <TabsTrigger value="announcement">其他設定</TabsTrigger>
          {isSuperadmin && <TabsTrigger value="edit-att">修改打卡</TabsTrigger>}
        </TabsList>

        <TabsContent value="calendar" className="mt-6">
          <p className="text-sm text-muted-foreground mb-3">點擊日期查看當日出勤人員與請假狀況。員工顏色可在「員工管理」中設定</p>
          <AttendanceCalendar records={adminCalendarCells} holidays={holidays} mode="admin" initialMonth={month} onMonthChange={handleCalendarMonthChange} />
        </TabsContent>

        <TabsContent value="makeup" className="mt-6">
          <MakeupApproval items={makeupReqs} profiles={profiles} adminId={user.id} onChange={load} />
        </TabsContent>

        <TabsContent value="leaves" className="mt-6">
          <div className="rounded-2xl bg-card border p-6 overflow-x-auto" style={{ boxShadow: "var(--shadow-soft)" }}>
            <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground flex-wrap">
              <Users className="h-4 w-4" />
              <span>三階段審核：</span>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-medium">組長</span>
              <span>→</span>
              <span className="px-2 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-xs font-medium">秘書長</span>
              <span>→</span>
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 text-xs font-medium">執行長</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Select value={leaveFilterUser} onValueChange={setLeaveFilterUser}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="全部員工" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部員工</SelectItem>
                  {allProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={leaveFilterType} onValueChange={setLeaveFilterType}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="全部假別" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部假別</SelectItem>
                  {["annual","sick","personal","overtime","official","marriage","paternity","bereavement","military","indigenous","occupational_injury","maternity_sick","other"].map(t => (
                    <SelectItem key={t} value={t}>{leaveLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(leaveFilterUser !== "all" || leaveFilterType !== "all") && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setLeaveFilterUser("all"); setLeaveFilterType("all"); }}>清除篩選</Button>
              )}
            </div>
            {/* ── 未審核 ── */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                待審核
                {pendingLeaves.length > 0 && <span className="h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">{pendingLeaves.length}</span>}
              </h3>
            {/* 手機卡片版（待審核） */}
            <div className="md:hidden space-y-3">
              {pendingLeaves.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">目前無待審核申請</p>}
              {pendingLeaves.map(r => {
                const ls = r.leader_status;
                const ss = r.secretary_status;
                const es = r.exec_status;
                return (
                  <div key={r.id} className="rounded-xl border p-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-semibold">{name(r.user_id)}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${r.status === "approved" ? "bg-success/20 text-success" : r.status === "rejected" ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning-foreground"}`}>{STATUS_LABEL[r.status]}</span>
                    </div>
                    <div className="text-muted-foreground text-xs">{leaveLabel(r.leave_type)} · {new Date(r.start_at).toLocaleDateString("zh-TW")} → {new Date(r.end_at).toLocaleDateString("zh-TW")}</div>
                    {r.reason && <div className="text-xs text-muted-foreground truncate">{r.reason}</div>}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className={`px-1.5 py-0.5 rounded ${ls === "approved" ? "bg-blue-100 text-blue-700" : ls === "rejected" ? "bg-destructive/10 text-destructive" : ls === null ? "bg-secondary text-muted-foreground" : "bg-secondary"}`}>組長 {ls === null ? "—" : (STATUS_LABEL[ls] ?? "—")}</span>
                      <span className={`px-1.5 py-0.5 rounded ${ss === "approved" ? "bg-violet-100 text-violet-700" : ss === "rejected" ? "bg-destructive/10 text-destructive" : ss === null ? "bg-secondary text-muted-foreground" : "bg-secondary"}`}>秘書長 {ss === null ? "—" : (STATUS_LABEL[ss] ?? "—")}</span>
                      <span className={`px-1.5 py-0.5 rounded ${es === "approved" ? "bg-rose-100 text-rose-700" : es === "rejected" ? "bg-destructive/10 text-destructive" : es === null ? "bg-secondary text-muted-foreground" : "bg-secondary"}`}>執行長 {es === null ? "—" : (STATUS_LABEL[es] ?? "—")}</span>
                    </div>
                    {ls === "pending" && isLeaderOrAbove && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => reviewLeader(r.id, "approved")}>組長核准</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1 text-destructive" onClick={() => setNoteModal({ fn: (n) => reviewLeader(r.id, "rejected", n), title: "拒絕原因", destructive: true })}>拒絕</Button>
                      </div>
                    )}
                    {ss === "pending" && isSecretaryOrAbove && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => reviewSecretary(r.id, "approved")}>秘書長核准</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1 text-destructive" onClick={() => setNoteModal({ fn: (n) => reviewSecretary(r.id, "rejected", n), title: "拒絕原因", destructive: true })}>拒絕</Button>
                      </div>
                    )}
                    {es === "pending" && isExecutiveDirectorOrAbove && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => reviewExec(r.id, "approved")}>執行長核准</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1 text-destructive" onClick={() => setNoteModal({ fn: (n) => reviewExec(r.id, "rejected", n), title: "拒絕原因", destructive: true })}>拒絕</Button>
                      </div>
                    )}
                    {isLeaderOrAbove && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive w-full" onClick={() => setConfirmModal({ message: "確定要撤回此申請？", onConfirm: () => adminWithdraw(r.id) })}>撤回</Button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 桌機表格版（待審核） */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">員工</th>
                <th className="py-2 pr-4 font-medium">類型</th>
                <th className="py-2 pr-4 font-medium">期間</th>
                <th className="py-2 pr-4 font-medium">折抵</th>
                <th className="py-2 pr-4 font-medium">原因／附件</th>
                <th className="py-2 pr-3 font-medium">組長</th>
                <th className="py-2 pr-3 font-medium">秘書長</th>
                <th className="py-2 pr-4 font-medium">執行長</th>
                <th className="py-2 font-medium">最終狀態</th>
              </tr></thead>
              <tbody>
                {pendingLeaves.map((r) => {
                  const ls = r.leader_status;
                  const ss = r.secretary_status;
                  const es = r.exec_status;
                  const dot = (s: string | null) => {
                    if (s === "approved") return <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 shadow-sm" />;
                    if (s === "rejected") return <span className="inline-block h-3 w-3 rounded-full bg-destructive shadow-sm" />;
                    if (s === "pending") return <span className="inline-block h-3 w-3 rounded-full bg-muted-foreground/20 border border-muted-foreground/30" />;
                    return <span className="text-[11px] text-muted-foreground leading-none">—</span>;
                  };
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">{name(r.user_id)}</td>
                      <td className="py-3 pr-4">{leaveLabel(r.leave_type)}</td>
                      <td className="py-3 pr-4 tabular-nums text-xs">
                        {new Date(r.start_at).toLocaleString("zh-TW", { hour12: false })}<br />
                        → {new Date(r.end_at).toLocaleString("zh-TW", { hour12: false })}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{r.use_overtime_hours > 0 ? `${r.use_overtime_hours}h` : "—"}</td>
                      <td className="py-3 pr-4 max-w-[160px]">
                        <div className="truncate text-xs">{r.reason || "—"}</div>
                        {r.attachment_url && (() => {
                          const isImg = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(r.attachment_url);
                          return isImg ? (
                            <a href={r.attachment_url} target="_blank" rel="noopener noreferrer">
                              <img src={r.attachment_url} alt="附件" className="mt-1 h-14 w-20 object-cover rounded border hover:opacity-80 transition-opacity" />
                            </a>
                          ) : (
                            <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-xs text-primary underline underline-offset-2">
                              <CloudDownload className="h-3.5 w-3.5" /> 附件
                            </a>
                          );
                        })()}
                      </td>

                      {/* 第一階：組長 */}
                      <td className="py-3 pr-3">
                        <div className="flex flex-col gap-1">
                          {dot(ls)}
                          {ls === "pending" && isLeaderOrAbove && (
                            <div className="flex gap-1 mt-1">
                              <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => reviewLeader(r.id, "approved")}><Check className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => setNoteModal({ fn: (n) => reviewLeader(r.id, "rejected", n), title: "拒絕原因（選填）", destructive: true })}><X className="h-3 w-3" /></Button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 第二階：秘書長 */}
                      <td className="py-3 pr-3">
                        <div className="flex flex-col gap-1">
                          {dot(ss)}
                          {ss === "pending" && isSecretaryOrAbove && (
                            <div className="flex gap-1 mt-1">
                              <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => reviewSecretary(r.id, "approved")}><Check className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => setNoteModal({ fn: (n) => reviewSecretary(r.id, "rejected", n), title: "拒絕原因（選填）", destructive: true })}><X className="h-3 w-3" /></Button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 第三階：執行長 */}
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-1">
                          {dot(es)}
                          {es === "pending" && isExecutiveDirectorOrAbove && (
                            <div className="flex gap-1 mt-1">
                              <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => reviewExec(r.id, "approved")}><Check className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => setNoteModal({ fn: (n) => reviewExec(r.id, "rejected", n), title: "拒絕原因（選填）", destructive: true })}><X className="h-3 w-3" /></Button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 最終狀態 */}
                      <td className="py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                          r.status === "approved" ? "bg-success/20 text-success" :
                          r.status === "rejected" ? "bg-destructive/20 text-destructive" :
                          "bg-warning/20 text-warning-foreground"
                        }`}>{STATUS_LABEL[r.status]}</span>
                        {r.review_note && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[140px] truncate" title={r.review_note}>{r.review_note}</div>
                        )}
                        {r.status === "pending" && isAdminOrAbove && (
                          <div className="flex gap-1 mt-1">
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => review(r.id, "approved")}>強制核准</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => setNoteModal({ fn: (n) => review(r.id, "rejected", n), title: "拒絕原因（選填）", destructive: true })}>強制拒絕</Button>
                          </div>
                        )}
                        {isLeaderOrAbove && (
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-destructive mt-1" onClick={() => setConfirmModal({ message: "確定要撤回此申請？", onConfirm: () => adminWithdraw(r.id) })}>撤回</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {pendingLeaves.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground text-sm">目前無待審核申請</td></tr>}
              </tbody>
            </table>
            </div>
            </div>{/* end 待審核 section */}

            {/* ── 審核完成 ── */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">審核完成（本月）</h3>
            {/* 手機卡片版（審核完成） */}
            <div className="md:hidden space-y-3">
              {completedLeaves.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">本月無審核紀錄</p>}
              {completedLeaves.map(r => {
                const ls = r.leader_status;
                const ss = r.secretary_status;
                const es = r.exec_status;
                return (
                  <div key={r.id} className="rounded-xl border p-4 space-y-2 text-sm opacity-80">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-semibold">{name(r.user_id)}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${r.status === "approved" ? "bg-success/20 text-success" : r.status === "rejected" ? "bg-destructive/20 text-destructive" : "bg-secondary text-muted-foreground"}`}>{STATUS_LABEL[r.status]}</span>
                    </div>
                    <div className="text-muted-foreground text-xs">{leaveLabel(r.leave_type)} · {new Date(r.start_at).toLocaleDateString("zh-TW")} → {new Date(r.end_at).toLocaleDateString("zh-TW")}</div>
                    {r.review_note && <div className="text-xs text-muted-foreground">{r.review_note}</div>}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className={`px-1.5 py-0.5 rounded ${ls === "approved" ? "bg-emerald-100 text-emerald-700" : ls === "rejected" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>組長 {ls === null ? "—" : (STATUS_LABEL[ls] ?? "—")}</span>
                      <span className={`px-1.5 py-0.5 rounded ${ss === "approved" ? "bg-emerald-100 text-emerald-700" : ss === "rejected" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>秘書長 {ss === null ? "—" : (STATUS_LABEL[ss] ?? "—")}</span>
                      <span className={`px-1.5 py-0.5 rounded ${es === "approved" ? "bg-emerald-100 text-emerald-700" : es === "rejected" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>執行長 {es === null ? "—" : (STATUS_LABEL[es] ?? "—")}</span>
                    </div>
                    {isLeaderOrAbove && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive w-full" onClick={() => setConfirmModal({ message: "確定要撤回此申請？", onConfirm: () => adminWithdraw(r.id) })}>撤回</Button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 桌機表格版（審核完成） */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">員工</th>
                <th className="py-2 pr-4 font-medium">類型</th>
                <th className="py-2 pr-4 font-medium">期間</th>
                <th className="py-2 pr-4 font-medium">折抵</th>
                <th className="py-2 pr-4 font-medium">原因／附件</th>
                <th className="py-2 pr-3 font-medium">組長</th>
                <th className="py-2 pr-3 font-medium">秘書長</th>
                <th className="py-2 pr-4 font-medium">執行長</th>
                <th className="py-2 font-medium">最終狀態</th>
              </tr></thead>
              <tbody>
                {completedLeaves.map((r) => {
                  const ls = r.leader_status;
                  const ss = r.secretary_status;
                  const es = r.exec_status;
                  const dot = (s: string | null) => {
                    if (s === "approved") return <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 shadow-sm" />;
                    if (s === "rejected") return <span className="inline-block h-3 w-3 rounded-full bg-destructive shadow-sm" />;
                    if (s === "pending") return <span className="inline-block h-3 w-3 rounded-full bg-muted-foreground/20 border border-muted-foreground/30" />;
                    return <span className="text-[11px] text-muted-foreground leading-none">—</span>;
                  };
                  return (
                    <tr key={r.id} className="border-b last:border-0 opacity-70">
                      <td className="py-3 pr-4">{name(r.user_id)}</td>
                      <td className="py-3 pr-4">{leaveLabel(r.leave_type)}</td>
                      <td className="py-3 pr-4 tabular-nums text-xs">
                        {new Date(r.start_at).toLocaleString("zh-TW", { hour12: false })}<br />
                        → {new Date(r.end_at).toLocaleString("zh-TW", { hour12: false })}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{r.use_overtime_hours > 0 ? `${r.use_overtime_hours}h` : "—"}</td>
                      <td className="py-3 pr-4 max-w-[160px]">
                        <div className="truncate text-xs">{r.reason || "—"}</div>
                        {r.attachment_url && (() => {
                          const isImg = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(r.attachment_url);
                          return isImg ? (
                            <a href={r.attachment_url} target="_blank" rel="noopener noreferrer">
                              <img src={r.attachment_url} alt="附件" className="mt-1 h-14 w-20 object-cover rounded border hover:opacity-80 transition-opacity" />
                            </a>
                          ) : (
                            <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-xs text-primary underline underline-offset-2">
                              <CloudDownload className="h-3.5 w-3.5" /> 附件
                            </a>
                          );
                        })()}
                      </td>
                      <td className="py-3 pr-3">{dot(ls)}</td>
                      <td className="py-3 pr-3">{dot(ss)}</td>
                      <td className="py-3 pr-4">{dot(es)}</td>
                      <td className="py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${r.status === "approved" ? "bg-success/20 text-success" : r.status === "rejected" ? "bg-destructive/20 text-destructive" : "bg-secondary text-muted-foreground"}`}>{STATUS_LABEL[r.status]}</span>
                        {r.review_note && <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[140px] truncate" title={r.review_note}>{r.review_note}</div>}
                        {isLeaderOrAbove && (
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-destructive mt-1" onClick={() => setConfirmModal({ message: "確定要撤回此申請？", onConfirm: () => adminWithdraw(r.id) })}>撤回</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {completedLeaves.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground text-sm">本月無審核紀錄</td></tr>}
              </tbody>
            </table>
            </div>
            </div>{/* end 審核完成 section */}

            {/* ── 已撤回申請 ── */}
            {withdrawnLeaves.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">已撤回申請（本月）</h3>
              {/* 手機卡片版 */}
              <div className="md:hidden space-y-3">
                {withdrawnLeaves.map(r => (
                  <div key={r.id} className="rounded-xl border p-4 space-y-2 text-sm opacity-60">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-semibold">{name(r.user_id)}</span>
                      <span className="px-2 py-0.5 rounded text-xs bg-secondary text-muted-foreground">已撤回</span>
                    </div>
                    <div className="text-muted-foreground text-xs">{leaveLabel(r.leave_type)} · {new Date(r.start_at).toLocaleDateString("zh-TW")} → {new Date(r.end_at).toLocaleDateString("zh-TW")}</div>
                    {r.reason && <div className="text-xs text-muted-foreground truncate">{r.reason}</div>}
                  </div>
                ))}
              </div>
              {/* 桌機表格版 */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm opacity-60">
                <thead><tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-medium">員工</th>
                  <th className="py-2 pr-4 font-medium">類型</th>
                  <th className="py-2 pr-4 font-medium">期間</th>
                  <th className="py-2 pr-4 font-medium">原因</th>
                  <th className="py-2 font-medium">撤回時間</th>
                </tr></thead>
                <tbody>
                  {withdrawnLeaves.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{name(r.user_id)}</td>
                      <td className="py-2 pr-4">{leaveLabel(r.leave_type)}</td>
                      <td className="py-2 pr-4 tabular-nums text-xs">
                        {new Date(r.start_at).toLocaleString("zh-TW", { hour12: false })}<br />
                        → {new Date(r.end_at).toLocaleString("zh-TW", { hour12: false })}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground max-w-[160px] truncate">{r.reason || "—"}</td>
                      <td className="py-2 tabular-nums text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("zh-TW", { hour12: false })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="summary" className="mt-6">
          <div className="rounded-2xl bg-card border p-6 overflow-x-auto" style={{ boxShadow: "var(--shadow-soft)" }}>
            <div className="flex items-center gap-3 mb-4">
              <Label className="text-xs">篩選員工</Label>
              <Select value={summaryFilter} onValueChange={setSummaryFilter}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {allProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground mb-3">正職標準工時 {STANDARD_DAILY_HOURS}h/日;加班須透過正式申請並經審核</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">日期</th>
                <th className="py-2 pr-4 font-medium">員工</th>
                <th className="py-2 pr-4 font-medium">假日</th>
                <th className="py-2 pr-4 font-medium">上班</th>
                <th className="py-2 pr-4 font-medium">下班</th>
                <th className="py-2 font-medium">工時</th>
              </tr></thead>
              <tbody>
                {filteredSummary.map((r, i) => {
                  const worked = calcWorkedHours(r.clock_in, r.clock_out);
                  const rest = isRestDay(r.date, holidays);
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4 tabular-nums">{r.date}</td>
                      <td className="py-2 pr-4">{name(r.user_id)}</td>
                      <td className="py-2 pr-4 text-xs">{rest.name && <span className={rest.rest ? "text-destructive" : "text-muted-foreground"}>{rest.name}</span>}</td>
                      <td className="py-2 pr-4 tabular-nums" style={{ color: r.clock_in ? "var(--clock-in)" : undefined }}>{r.clock_in ? new Date(r.clock_in).toLocaleTimeString("zh-TW", { hour12: false }) : "—"}</td>
                      <td className="py-2 pr-4 tabular-nums" style={{ color: r.clock_out ? "var(--clock-out)" : undefined }}>{r.clock_out ? new Date(r.clock_out).toLocaleTimeString("zh-TW", { hour12: false }) : "—"}</td>
                      <td className="py-2 tabular-nums">{worked || "—"}</td>
                    </tr>
                  );
                })}
                {filteredSummary.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">本月無打卡紀錄</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          <div className="rounded-2xl bg-card border p-6 overflow-x-auto" style={{ boxShadow: "var(--shadow-soft)" }}>
            <div className="mb-4">
              <Input
                placeholder="搜尋姓名或 Email…"
                value={employeeSearch}
                onChange={e => setEmployeeSearch(e.target.value)}
                className="max-w-xs h-9 text-sm"
              />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">姓名</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">顏色</th>
                <th className="py-2 pr-4 font-medium">到職日</th>
                <th className="py-2 pr-4 font-medium">在職時間</th>
                <th className="py-2 pr-4 font-medium">員工類型</th>
                <th className="py-2 font-medium">職稱/權限</th>
              </tr></thead>
              <tbody>
                {allProfiles.filter(p => {
                  if (!employeeSearch.trim()) return true;
                  const q = employeeSearch.toLowerCase();
                  return (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
                }).map((p) => (
                  <EmployeeRow
                    key={p.id}
                    profile={p}
                    role={displayedRoleOf(p.id)}
                    isSuperadmin={isSuperadmin}
                    canSetAdmin={isAdminOrAbove}
                    onSaveName={(n) => updateName(p.id, n)}
                    onChangeType={(t) => updateEmployeeType(p.id, t)}
                    onChangeRole={(r) => updateRole(p.id, r)}
                    onChangeColor={(c) => updateColor(p.id, c)}
                    onChangeHireDate={(d) => updateHireDate(p.id, d)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="holidays" className="mt-6">
          <HolidayManager holidays={holidays} onChange={load} />
        </TabsContent>

        <TabsContent value="overtime" className="mt-6">
          <OvertimeManager profiles={profiles} otTx={otTx} onChange={load} adminId={user.id} />
        </TabsContent>

        <TabsContent value="announcement" className="mt-6 space-y-6">
          <div className="rounded-2xl bg-card border p-6 max-w-2xl" style={{ boxShadow: "var(--shadow-soft)" }}>
            <h2 className="font-semibold mb-1">系統起始日</h2>
            <p className="text-xs text-muted-foreground mb-4">差勤異常偵測的起算日期，系統上線前的日期不會被列為異常。</p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label className="text-xs">起始日期</Label>
                <Input type="date" value={systemStartDraft} onChange={e => setSystemStartDraft(e.target.value)} className="w-44 mt-1" />
              </div>
              <Button onClick={saveSystemStart} disabled={systemStartDraft === systemStartDate} className="mb-0.5">儲存</Button>
              {systemStartDraft !== systemStartDate && (
                <Button variant="ghost" size="sm" onClick={() => setSystemStartDraft(systemStartDate)} className="mb-0.5">取消</Button>
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-card border p-6 max-w-2xl" style={{ boxShadow: "var(--shadow-soft)" }}>
            <h2 className="font-semibold mb-1">上下班時間設定</h2>
            <p className="text-xs text-muted-foreground mb-4">用於員工「差勤申請」頁的遲到/早退偵測。</p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label className="text-xs">上班時間 (整點)</Label>
                <Input type="number" min={0} max={23} value={workStartDraft} onChange={e => setWorkStartDraft(Number(e.target.value))} className="w-24 mt-1" />
              </div>
              <div>
                <Label className="text-xs">下班時間 (整點)</Label>
                <Input type="number" min={0} max={23} value={workEndDraft} onChange={e => setWorkEndDraft(Number(e.target.value))} className="w-24 mt-1" />
              </div>
              <Button onClick={saveWorkHours} disabled={workStartDraft === workStartHour && workEndDraft === workEndHour} className="mb-0.5">儲存</Button>
              {(workStartDraft !== workStartHour || workEndDraft !== workEndHour) && (
                <Button variant="ghost" size="sm" onClick={() => { setWorkStartDraft(workStartHour); setWorkEndDraft(workEndHour); }} className="mb-0.5">取消</Button>
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-card border p-6 max-w-2xl" style={{ boxShadow: "var(--shadow-soft)" }}>
            <h2 className="font-semibold mb-1">公告欄設定</h2>
            <p className="text-xs text-muted-foreground mb-4">此文字會顯示在員工的打卡頁面底部「打卡系統使用說明及規定」區塊中。每行前加 · 即會自動顯示為條列項目。</p>
            <Textarea
              value={announcementDraft}
              onChange={e => setAnnouncementDraft(e.target.value)}
              rows={8}
              placeholder=""
              className="font-mono text-sm"
            />
            <div className="flex items-center gap-3 mt-3">
              <Button onClick={saveAnnouncement} disabled={announcementDraft === announcement}>儲存公告</Button>
              {announcementDraft !== announcement && (
                <Button variant="ghost" size="sm" onClick={() => setAnnouncementDraft(announcement)}>取消</Button>
              )}
            </div>
          </div>
        </TabsContent>

        {isSuperadmin && (
          <TabsContent value="edit-att" className="mt-6">
            <AttendanceEditor att={att} profiles={profiles} onDone={load} />
          </TabsContent>
        )}

      </Tabs>

      {/* 確認操作 Dialog */}
      <Dialog open={!!confirmModal} onOpenChange={o => { if (!o) setConfirmModal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>確認操作</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmModal?.message}</p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" size="sm" onClick={() => setConfirmModal(null)}>取消</Button>
            <Button variant="destructive" size="sm" onClick={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}>確定</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 審核備註 Dialog */}
      <Dialog open={!!noteModal} onOpenChange={(o) => { if (!o) { setNoteModal(null); setNoteText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{noteModal?.title ?? "備註"}</DialogTitle></DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="說明原因…（可留空）"
            className="mt-1"
          />
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="ghost" size="sm" onClick={() => { setNoteModal(null); setNoteText(""); }}>取消</Button>
            <Button
              size="sm"
              variant={noteModal?.destructive ? "destructive" : "default"}
              onClick={() => { noteModal?.fn(noteText); setNoteModal(null); setNoteText(""); }}
            >確認</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmployeeRow({ profile, role, isSuperadmin, canSetAdmin, onSaveName, onChangeType, onChangeRole, onChangeColor, onChangeHireDate }: {
  profile: ProfileRow;
  role: ManageableRole;
  isSuperadmin: boolean;
  canSetAdmin: boolean;
  onSaveName: (n: string) => void;
  onChangeType: (t: "monthly" | "hourly") => void;
  onChangeRole: (r: ManageableRole) => void;
  onChangeColor: (c: string) => void;
  onChangeHireDate: (d: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nm, setNm] = useState(profile.full_name || "");
  const [editingHire, setEditingHire] = useState(false);
  const [hireDate, setHireDate] = useState(profile.hire_date || "");
  const roleBadge: Record<string, { label: string; cls: string }> = {
    admin:              { label: "管理員",  cls: "bg-primary/15 text-primary border border-primary/30" },
    leader:             { label: "組長",    cls: "bg-blue-500/15 text-blue-700 border border-blue-400/30" },
    secretary_general:  { label: "秘書長",  cls: "bg-violet-500/15 text-violet-700 border border-violet-400/30" },
    executive_director: { label: "執行長",  cls: "bg-amber-500/15 text-amber-700 border border-amber-400/30" },
  };
  const badge = roleBadge[role];
  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4">
        {editing ? (
          <div className="flex gap-1">
            <Input value={nm} onChange={(e) => setNm(e.target.value)} className="h-8 w-40" />
            <Button size="sm" variant="ghost" onClick={() => { onSaveName(nm); setEditing(false); }}><Save className="h-3.5 w-3.5" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {badge && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${badge.cls}`}>
                {badge.label}
              </span>
            )}
            <span className={badge ? "font-semibold" : ""}>{profile.full_name || "—"}</span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
          </div>
        )}
      </td>
      <td className="py-3 pr-4">{profile.email}</td>
      <td className="py-3 pr-4">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-7 w-7 rounded border-2 border-border hover:border-primary transition-colors shrink-0"
              style={{ background: profile.display_color || "#2563eb" }}
              title="選擇顏色"
            />
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3 space-y-3" align="start">
            <input
              type="color"
              value={profile.display_color || "#2563eb"}
              onChange={(e) => onChangeColor(e.target.value)}
              className="h-8 w-full rounded border cursor-pointer bg-transparent"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {DEFAULT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => onChangeColor(c)}
                  className="h-7 w-full rounded border border-border hover:scale-110 transition-transform"
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </td>
      {/* 到職日 */}
      <td className="py-3 pr-4">
        {editingHire ? (
          <div className="flex gap-1 items-center">
            <Input
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
              className="h-8 w-36"
            />
            <Button size="sm" variant="ghost" onClick={() => { onChangeHireDate(hireDate); setEditingHire(false); }}><Save className="h-3.5 w-3.5" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-sm tabular-nums">{profile.hire_date || "—"}</span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setHireDate(profile.hire_date || ""); setEditingHire(true); }}><Pencil className="h-3 w-3" /></Button>
          </div>
        )}
      </td>
      {/* 在職時間 */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{tenureLabel(profile.hire_date)}</span>
        </div>
      </td>
      <td className="py-3 pr-4">
        <Select value={profile.employee_type} onValueChange={(v) => onChangeType(v as "monthly" | "hourly")}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">正職</SelectItem>
            <SelectItem value="hourly">兼職</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="py-3">
        <Select value={role} onValueChange={(v) => onChangeRole(v as ManageableRole)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="employee">一般員工</SelectItem>
            <SelectItem value="leader">組長</SelectItem>
            <SelectItem value="secretary_general">秘書長</SelectItem>
            <SelectItem value="executive_director">執行長</SelectItem>
            {canSetAdmin && <SelectItem value="admin">管理員</SelectItem>}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
}

function AttendanceEditor({ att, profiles, onDone }: {
  att: AttRow[];
  profiles: Record<string, ProfileRow>;
  onDone: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const [delId, setDelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toLocal = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const startEdit = (r: AttRow) => { setEditId(r.id); setEditTime(toLocal(r.clocked_at)); };

  const saveEdit = async () => {
    if (!editId || !editTime) return;
    setSaving(true);
    const { error } = await supabase.from("attendance").update({ clocked_at: new Date(editTime).toISOString() }).eq("id", editId);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("已修改"); setEditId(null); onDone(); }
  };

  const confirmDelete = async () => {
    if (!delId) return;
    const { error } = await supabase.from("attendance").delete().eq("id", delId);
    setDelId(null);
    if (error) toast.error(error.message);
    else { toast.success("已刪除"); onDone(); }
  };

  const sorted = [...att].sort((a, b) => b.clocked_at.localeCompare(a.clocked_at));

  return (
    <div className="rounded-2xl bg-card border p-6 overflow-x-auto" style={{ boxShadow: "var(--shadow-soft)" }}>
      <p className="text-sm text-muted-foreground mb-4">可直接修改或刪除任何打卡紀錄，操作無法還原，請謹慎使用。</p>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b">
          <th className="py-2 pr-4 font-medium">員工</th>
          <th className="py-2 pr-4 font-medium">類型</th>
          <th className="py-2 pr-4 font-medium">時間</th>
          <th className="py-2 font-medium">操作</th>
        </tr></thead>
        <tbody>
          {sorted.map(r => {
            const p = profiles[r.user_id];
            return (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{p?.full_name || p?.email || r.user_id.slice(0,8)}</td>
                <td className="py-2 pr-4">
                  <span style={{ color: r.type === "clock_in" ? "var(--clock-in)" : "var(--clock-out)" }}>
                    {r.type === "clock_in" ? "上班" : "下班"}
                  </span>
                </td>
                <td className="py-2 pr-4 tabular-nums text-xs">
                  {editId === r.id ? (
                    <div className="flex items-center gap-2">
                      <Input type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} className="h-7 text-xs w-48" />
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={saveEdit} disabled={saving}>儲存</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditId(null)}>取消</Button>
                    </div>
                  ) : new Date(r.clocked_at).toLocaleString("zh-TW", { hour12: false })}
                </td>
                <td className="py-2">
                  {editId !== r.id && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => startEdit(r)}>修改</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive" onClick={() => setDelId(r.id)}>刪除</Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">目前無打卡紀錄</td></tr>}
        </tbody>
      </table>

      <Dialog open={!!delId} onOpenChange={o => { if (!o) setDelId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">確定要刪除此筆打卡紀錄？此操作無法還原。</p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDelId(null)}>取消</Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>確定刪除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HolidayManager({ holidays, onChange }: { holidays: Holiday[]; onChange: () => void }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [isWorkday, setIsWorkday] = useState("0");
  const [importing, setImporting] = useState(false);
  const importYear = new Date().getFullYear();
  const importNextYear = importYear + 1;

  const add = async () => {
    if (!date || !name) return toast.error("請填寫日期與名稱");
    const { error } = await supabase.from("holidays").insert({ holiday_date: date, name, is_workday: isWorkday === "1" });
    if (error) toast.error(error.message);
    else { toast.success("已新增"); setDate(""); setName(""); setIsWorkday("0"); onChange(); }
  };
  const del = async (d: string) => {
    const { error } = await supabase.from("holidays").delete().eq("holiday_date", d);
    if (error) toast.error(error.message); else { toast.success("已刪除"); onChange(); }
  };

  const importGovCalendar = async () => {
    setImporting(true);
    try {
      const [itemsThis, itemsNext] = await Promise.all([
        fetchTaiwanHolidays(importYear),
        fetchTaiwanHolidays(importNextYear).catch(() => []),
      ]);
      const items = [...itemsThis, ...itemsNext];
      if (!items.length) { toast.error("未取得任何資料"); return; }
      const existingDates = new Set(holidays.map(h => h.holiday_date));
      const toInsert = items.filter(i => !existingDates.has(i.holiday_date));
      if (!toInsert.length) { toast.success(`${importYear}–${importNextYear} 年行事曆已是最新，無需重複匯入`); return; }
      const { error } = await supabase.from("holidays").insert(toInsert);
      if (error) toast.error(error.message);
      else { toast.success(`已匯入 ${toInsert.length} 筆（${importYear}–${importNextYear} 年政府行事曆）`); onChange(); }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "匯入失敗");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card border p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground">設定國定假日(見紅休)與補班日。週六、週日已自動視為休息日</p>
        <Button
          variant="outline"
          className="gap-2 shrink-0"
          onClick={importGovCalendar}
          disabled={importing}
        >
          <CloudDownload className="h-4 w-4" />
          {importing ? "匯入中…" : `一鍵匯入 ${importYear}–${importNextYear} 年政府行事曆`}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-6 pb-6 border-b">
        <div><Label className="text-xs">日期</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44 mt-1.5" /></div>
        <div className="flex-1 min-w-40"><Label className="text-xs">名稱</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="例:春節、補班" className="mt-1.5" /></div>
        <div>
          <Label className="text-xs">類型</Label>
          <Select value={isWorkday} onValueChange={setIsWorkday}>
            <SelectTrigger className="w-32 mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">放假日</SelectItem>
              <SelectItem value="1">補班日</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={add} className="gap-1"><Plus className="h-4 w-4" /> 新增</Button>
      </div>

      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b">
          <th className="py-2 pr-4 font-medium">日期</th>
          <th className="py-2 pr-4 font-medium">名稱</th>
          <th className="py-2 pr-4 font-medium">類型</th>
          <th className="py-2 font-medium"></th>
        </tr></thead>
        <tbody>
          {holidays.map((h) => (
            <tr key={h.holiday_date} className="border-b last:border-0">
              <td className="py-3 pr-4 tabular-nums">{h.holiday_date}</td>
              <td className="py-3 pr-4">{h.name}</td>
              <td className="py-3 pr-4">
                <span className={`text-xs px-2 py-0.5 rounded ${h.is_workday ? "bg-warning/20 text-warning-foreground" : "bg-destructive/15 text-destructive"}`}>
                  {h.is_workday ? "補班日" : "放假日"}
                </span>
              </td>
              <td className="py-3"><Button size="sm" variant="ghost" onClick={() => del(h.holiday_date)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
            </tr>
          ))}
          {holidays.length === 0 && <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">尚未設定假日</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function OvertimeManager({ profiles, otTx, onChange, adminId }: { profiles: Record<string, ProfileRow>; otTx: OtRow[]; onChange: () => void; adminId: string }) {
  const [uid, setUid] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");

  const add = async () => {
    const h = Number(hours);
    if (!uid || !h) return toast.error("請選擇員工並填寫時數");
    const { error } = await supabase.from("overtime_transactions").insert({
      user_id: uid, hours: h, source: "overtime", reason: reason || "管理員調整", created_by: adminId,
    });
    if (error) toast.error(error.message);
    else { toast.success("已新增"); setHours(""); setReason(""); onChange(); }
  };

  const balances = useMemo(() => {
    const b: Record<string, number> = {};
    otTx.forEach(t => { b[t.user_id] = (b[t.user_id] || 0) + Number(t.hours); });
    return b;
  }, [otTx]);

  const monthlyProfiles = Object.values(profiles).filter(p => p.employee_type === "monthly");

  return (
    <div className="rounded-2xl bg-card border p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
      <p className="text-sm text-muted-foreground mb-4">手動為正職員工增加加班時數(正數)或扣除(負數)。請假折抵會自動扣除</p>

      <div className="grid md:grid-cols-2 gap-6 pb-6 border-b mb-6">
        <div>
          <h3 className="font-semibold mb-3 text-sm">員工加班餘額</h3>
          <div className="space-y-2">
            {monthlyProfiles.map(p => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded bg-secondary text-sm">
                <span>{p.full_name || p.email}</span>
                <span className="tabular-nums font-bold text-primary">{(Math.round((balances[p.id] || 0) * 100) / 100).toFixed(2)} h</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-3 text-sm">手動調整</h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">員工</Label>
              <Select value={uid} onValueChange={setUid}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="選擇員工" /></SelectTrigger>
                <SelectContent>
                  {monthlyProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">時數 (可為負數)</Label><Input type="number" step="0.5" value={hours} onChange={e => setHours(e.target.value)} className="mt-1.5" /></div>
            <div><Label className="text-xs">原因</Label><Input value={reason} onChange={e => setReason(e.target.value)} className="mt-1.5" /></div>
            <Button onClick={add} className="w-full">送出</Button>
          </div>
        </div>
      </div>

      <h3 className="font-semibold mb-3 text-sm">最近異動紀錄</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-4 font-medium">時間</th>
            <th className="py-2 pr-4 font-medium">員工</th>
            <th className="py-2 pr-4 font-medium">時數</th>
            <th className="py-2 pr-4 font-medium">類別</th>
            <th className="py-2 font-medium">原因</th>
          </tr></thead>
          <tbody>
            {otTx.slice(0, 30).map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-4 tabular-nums text-xs">{new Date(r.created_at).toLocaleString("zh-TW", { hour12: false })}</td>
                <td className="py-2 pr-4">{profiles[r.user_id]?.full_name || profiles[r.user_id]?.email || r.user_id.slice(0, 8)}</td>
                <td className={`py-2 pr-4 tabular-nums font-medium ${Number(r.hours) >= 0 ? "text-success" : "text-destructive"}`}>{Number(r.hours) > 0 ? "+" : ""}{r.hours}</td>
                <td className="py-2 pr-4 text-xs">{r.source === "leave_offset" ? "請假折抵" : r.source === "overtime" ? "加班累積" : "手動"}</td>
                <td className="py-2 text-muted-foreground">{r.reason || "—"}</td>
              </tr>
            ))}
            {otTx.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">尚無異動</td></tr>}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function EditAttendance({ att, profiles, onChange }: { att: AttRow[]; profiles: Record<string, ProfileRow>; onChange: () => void }) {
  const [editing, setEditing] = useState<AttRow | null>(null);
  const [newDt, setNewDt] = useState("");
  const [delConfirmId, setDelConfirmId] = useState<string | null>(null);

  const startEdit = (r: AttRow) => {
    setEditing(r);
    const d = new Date(r.clocked_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    setNewDt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const save = async () => {
    if (!editing || !newDt) return;
    const iso = new Date(newDt).toISOString();
    const { error } = await supabase.from("attendance").update({ clocked_at: iso }).eq("id", editing.id);
    if (error) toast.error(error.message);
    else { toast.success("打卡時間已更新"); setEditing(null); onChange(); }
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("attendance").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("已刪除"); onChange(); }
  };

  const name = (uid: string) => profiles[uid]?.full_name || profiles[uid]?.email || uid.slice(0, 8);

  return (
    <div className="rounded-2xl bg-card border p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
      <p className="text-sm text-muted-foreground mb-4">可修改或刪除員工打卡時間(本月)</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-4 font-medium">員工</th>
            <th className="py-2 pr-4 font-medium">類型</th>
            <th className="py-2 pr-4 font-medium">時間</th>
            <th className="py-2 font-medium">操作</th>
          </tr></thead>
          <tbody>
            {att.slice(0, 200).map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{name(r.user_id)}</td>
                <td className="py-2 pr-4" style={{ color: r.type === "clock_in" ? "var(--clock-in)" : "var(--clock-out)" }}>{r.type === "clock_in" ? "上班" : "下班"}</td>
                <td className="py-2 pr-4 tabular-nums text-xs">{new Date(r.clocked_at).toLocaleString("zh-TW", { hour12: false })}</td>
                <td className="py-2 flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => startEdit(r)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setDelConfirmId(r.id)}><Trash2 className="h-3 w-3" /></Button>
                </td>
              </tr>
            ))}
            {att.length === 0 && <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">本月無打卡紀錄</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogTrigger className="hidden" />
        <DialogContent>
          <DialogHeader><DialogTitle>修改打卡時間</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">員工:{name(editing.user_id)} · {editing.type === "clock_in" ? "上班" : "下班"}</div>
              <Input type="datetime-local" value={newDt} onChange={(e) => setNewDt(e.target.value)} />
              <Button onClick={save} className="w-full">儲存</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 刪除確認 Dialog */}
      <Dialog open={!!delConfirmId} onOpenChange={o => { if (!o) setDelConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">確定刪除這筆打卡紀錄？此操作無法復原。</p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDelConfirmId(null)}>取消</Button>
            <Button variant="destructive" size="sm" onClick={async () => {
              const id = delConfirmId;
              setDelConfirmId(null);
              if (id) await del(id);
            }}>確定刪除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MakeupApproval({ items, profiles, adminId, onChange }: { items: MakeupRow[]; profiles: Record<string, ProfileRow>; adminId: string; onChange: () => void }) {
  const name = (uid: string) => profiles[uid]?.full_name || profiles[uid]?.email || uid.slice(0, 8);
  const review = async (id: string, status: "approved" | "rejected") => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const { error } = await supabase.from("makeup_requests")
      .update({ status, reviewed_by: adminId, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (status === "approved") {
      const { error: attErr } = await supabase.from("attendance").insert({
        user_id: item.user_id,
        type: item.type,
        clocked_at: item.target_time,
        note: "補打卡（審核通過）",
      });
      if (attErr) { toast.error("打卡補登失敗：" + attErr.message); return; }
    }
    toast.success(status === "approved" ? "已核准並補上打卡" : "已拒絕");
    onChange();
  };
  return (
    <div className="rounded-2xl bg-card border p-6 overflow-x-auto" style={{ boxShadow: "var(--shadow-soft)" }}>
      <p className="text-sm text-muted-foreground mb-4">員工提交的補打卡申請。核准後將自動寫入打卡紀錄</p>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b">
          <th className="py-2 pr-4 font-medium">員工</th>
          <th className="py-2 pr-4 font-medium">類型</th>
          <th className="py-2 pr-4 font-medium">補登時間</th>
          <th className="py-2 pr-4 font-medium">原因</th>
          <th className="py-2 pr-4 font-medium">狀態</th>
          <th className="py-2 font-medium">操作</th>
        </tr></thead>
        <tbody>
          {items.map(r => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-3 pr-4">{name(r.user_id)}</td>
              <td className="py-3 pr-4" style={{ color: r.type === "clock_in" ? "var(--clock-in)" : "var(--clock-out)" }}>{r.type === "clock_in" ? "上班" : "下班"}</td>
              <td className="py-3 pr-4 tabular-nums text-xs">{new Date(r.target_time).toLocaleString("zh-TW", { hour12: false })}</td>
              <td className="py-3 pr-4 max-w-xs truncate">{r.reason || "—"}</td>
              <td className="py-3 pr-4"><span className={`inline-block px-2 py-0.5 rounded text-xs ${
                r.status === "approved" ? "bg-success/20 text-success" :
                r.status === "rejected" ? "bg-destructive/20 text-destructive" :
                "bg-warning/20 text-warning-foreground"
              }`}>{r.status === "approved" ? "已核准" : r.status === "rejected" ? "已拒絕" : "待審核"}</span></td>
              <td className="py-3">
                {r.status === "pending" && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => review(r.id, "approved")}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => review(r.id, "rejected")}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">尚無申請</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// keep for type compat / future use
