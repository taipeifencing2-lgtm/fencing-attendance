import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Clock, MapPin, FileCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  return (
    <div>
      <section
        className="relative overflow-hidden text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="container mx-auto px-4 py-24 md:py-32 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs mb-6">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> 中華民國擊劍協會
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              協會差勤<br />打卡系統
            </h1>
            <p className="mt-6 text-lg md:text-xl text-primary-foreground/80 max-w-xl">
              一鍵打卡、即時記錄、差勤申請、月報表匯出——讓協會行政管理零負擔。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login">
                <Button size="lg" variant="secondary" className="font-semibold">立即開始使用</Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-accent/30 blur-3xl" />
      </section>

      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Clock, title: "上下班打卡", desc: "一鍵記錄上班與下班時間,清晰呈現每日出勤。" },
            { icon: FileCheck, title: "請假與加班申請", desc: "員工線上送出申請,主管即時審核回覆。" },
            { icon: Users, title: "管理員後台", desc: "查看全公司打卡紀錄與申請,管理高效不出錯。" },
          ].map((f) => (
            <div key={f.title} className="p-6 rounded-xl border bg-card" style={{ boxShadow: "var(--shadow-soft)" }}>
              <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
