import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [signing, setSigning] = useState(false);
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  const handleGoogle = async () => {
    setSigning(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) {
      toast.error("Google 登入失敗：" + error.message);
      setSigning(false);
    }
  };

  const handleSendOtp = async () => {
    if (!email.trim()) return toast.error("請輸入 Email");
    setSigning(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setSigning(false);
    if (error) {
      toast.error("寄送失敗：" + error.message);
    } else {
      setOtpSent(true);
      toast.success("驗證碼已寄出，請檢查信箱");
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) return toast.error("請輸入驗證碼");
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    });
    setVerifying(false);
    if (error) {
      toast.error("驗證失敗：" + error.message);
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const inApp = /Line|FBAN|FBAV|Instagram|MicroMessenger|Twitter/i.test(ua);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: "var(--gradient-hero)" }}>
      {/* Decorative background shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.75 0.15 245), transparent 70%)" }} />
        <div className="absolute -bottom-48 -left-24 h-96 w-96 rounded-full opacity-8"
          style={{ background: "radial-gradient(circle, oklch(0.6 0.12 255), transparent 70%)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, oklch(0.8 0.1 240), transparent 60%)" }} />
      </div>

      <div className="w-full max-w-md relative animate-fade-in">
        {/* Branding above card */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full blur-xl opacity-40"
              style={{ background: "oklch(0.7 0.13 245)", transform: "scale(1.4)" }} />
            <img src={logo} alt="中華民國擊劍協會" className="relative h-20 w-20 object-contain drop-shadow-2xl" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">中華民國擊劍協會</h1>
          <p className="text-sm text-white/60 mt-1.5 tracking-wide">差勤管理系統</p>
        </div>

      <div className="bg-card rounded-2xl p-8 md:p-10 animate-scale-in" style={{ boxShadow: "0 20px 60px -12px oklch(0.1 0.06 255 / 0.5), 0 4px 16px -4px oklch(0.1 0.06 255 / 0.3)" }}>
        <h2 className="text-lg font-semibold text-center mb-6 text-foreground">登入帳號</h2>

        {inApp && (
          <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
            <p className="font-medium text-warning-foreground mb-1">⚠ 偵測到 App 內建瀏覽器</p>
            <p className="text-xs text-muted-foreground">Google 不允許在 LINE / Facebook 內建瀏覽器登入。請點右上角「⋯」選擇「在 Safari / Chrome 中開啟」，或改用 Email 驗證碼登入。</p>
          </div>
        )}

        {/* Google 登入 */}
        <Button onClick={handleGoogle} disabled={signing} className="w-full" size="lg" variant="outline">
          <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {signing ? "登入中..." : "使用 Google 登入"}
        </Button>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs text-muted-foreground"><span className="bg-card px-2">或使用 Email 驗證碼</span></div>
        </div>

        {/* Email OTP 登入 */}
        {!otpSent ? (
          <div className="space-y-3">
            <Input
              type="email"
              placeholder="輸入您的 Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
            />
            <Button onClick={handleSendOtp} disabled={signing} className="w-full gap-2" variant="secondary">
              <Mail className="h-4 w-4" />
              {signing ? "寄送中..." : "寄送驗證碼"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">僅限已加入系統的員工信箱</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-center text-muted-foreground">已寄送至 <span className="font-medium text-foreground">{email}</span></p>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="輸入 6 位驗證碼"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
              maxLength={6}
              className="text-center tracking-widest text-lg"
            />
            <Button onClick={handleVerifyOtp} disabled={verifying} className="w-full">
              {verifying ? "驗證中..." : "確認登入"}
            </Button>
            <Button variant="ghost" className="w-full text-xs" onClick={() => { setOtpSent(false); setOtp(""); }}>
              重新寄送 / 更換 Email
            </Button>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground mt-6">
          建議使用 Chrome、Safari、Edge 等瀏覽器
        </p>
      </div>
      </div>
    </div>
  );
}

