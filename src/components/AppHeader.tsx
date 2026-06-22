import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, LayoutDashboard, FileText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import logo from "@/assets/logo.png";

export function AppHeader() {
  const { user, isLeaderOrAbove, signOut } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setDisplayName(data.full_name); });
  }, [user]);

  useEffect(() => {
    if (!isLeaderOrAbove || !user) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("leave_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingCount(count ?? 0);
    };
    fetchCount();
    const channel = supabase
      .channel("pending_leave_badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isLeaderOrAbove, user]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const initials = displayName
    ? displayName.slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <>
    <Dialog open={logoutConfirm} onOpenChange={setLogoutConfirm}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>確認登出</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">確定要登出系統嗎？</p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={() => setLogoutConfirm(false)}>取消</Button>
          <Button variant="destructive" size="sm" onClick={() => { setLogoutConfirm(false); handleSignOut(); }}>登出</Button>
        </div>
      </DialogContent>
    </Dialog>
    <header className="border-b bg-card/95 backdrop-blur-md sticky top-0 z-50" style={{ boxShadow: "0 1px 0 oklch(0.28 0.09 255 / 0.07), 0 2px 8px -2px oklch(0.28 0.09 255 / 0.04)" }}>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 font-bold text-primary shrink-0">
          <img src={logo} alt="中華民國擊劍協會" className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain" />
          <span className="leading-tight text-xs sm:text-sm font-semibold tracking-tight">
            <span className="hidden sm:inline">中華民國擊劍協會</span>
            <span className="sm:hidden">擊劍協會</span>
            <span className="hidden md:inline text-muted-foreground font-normal"> · 差勤系統</span>
          </span>
        </Link>

        {user && (
          <nav className="flex items-center h-full overflow-x-auto">
            {[
              { to: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" />, label: "打卡" },
              { to: "/requests", icon: <FileText className="h-4 w-4" />, label: "申請" },
              ...(isLeaderOrAbove ? [{ to: "/admin", icon: <ShieldCheck className="h-4 w-4" />, label: "後台", badge: pendingCount }] : []),
            ].map(({ to, icon, label, badge }) => (
              <Link
                key={to}
                to={to}
                className="relative px-3 sm:px-4 h-full flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground font-medium hover:text-foreground transition-colors whitespace-nowrap border-b-2 border-transparent"
                activeProps={{ className: "text-primary font-semibold border-primary" }}
              >
                {icon} {label}
                {(badge ?? 0) > 0 && (
                  <span className="ml-0.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {(badge ?? 0) > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2.5 shrink-0">
          {user ? (
            <>
              <div className="hidden md:flex items-center gap-2">
                <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-primary-foreground shrink-0 select-none"
                  style={{ background: "var(--gradient-hero)" }}>
                  {initials}
                </div>
                <span className="text-sm text-muted-foreground max-w-[130px] truncate">
                  {displayName || user.email}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLogoutConfirm(true)} className="text-muted-foreground hover:text-foreground h-8 w-8 p-0 rounded-full">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Link to="/login">
              <Button size="sm">登入</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
    </>
  );
}
