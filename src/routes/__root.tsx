import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">找不到頁面</h2>
        <p className="mt-2 text-sm text-muted-foreground">您要找的頁面不存在。</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            回首頁
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "中華民國擊劍協會 — 差勤打卡系統" },
      { name: "description", content: "中華民國擊劍協會員工差勤打卡與管理平台" },
      { property: "og:title", content: "中華民國擊劍協會 — 差勤打卡系統" },
      { name: "twitter:title", content: "中華民國擊劍協會 — 差勤打卡系統" },
      { property: "og:description", content: "中華民國擊劍協會員工差勤打卡與管理平台" },
      { name: "twitter:description", content: "中華民國擊劍協會員工差勤打卡與管理平台" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/adc0ff6c-f607-42ce-ab17-568e5db3972f/id-preview-44257935--dc826678-4919-45ce-83dc-b456b6227ebe.lovable.app-1778059597060.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/adc0ff6c-f607-42ce-ab17-568e5db3972f/id-preview-44257935--dc826678-4919-45ce-83dc-b456b6227ebe.lovable.app-1778059597060.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#1d4ed8" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "擊劍差勤" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        <AppHeader />
        <main className="flex-1"><Outlet /></main>
        <Toaster />
      </div>
    </AuthProvider>
  );
}
