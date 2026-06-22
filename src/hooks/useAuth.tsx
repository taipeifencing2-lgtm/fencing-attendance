import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role =
  | "admin"
  | "employee"
  | "superadmin"
  | "leader"
  | "secretary_general"
  | "executive_director"
  | null;
export type EmployeeType = "monthly" | "hourly";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
  employeeType: EmployeeType;
  isSuperadmin: boolean;
  isAdminOrAbove: boolean;              // admin / superadmin
  isLeaderOrAbove: boolean;             // 組長以上(可進後台、可審核第一階)
  isSecretaryOrAbove: boolean;          // 秘書長以上(可審核第二階)
  isExecutiveDirectorOrAbove: boolean;  // 執行長以上(可審核第三階)
  isExecOrAbove: boolean;               // 同 isSecretaryOrAbove (向下相容)
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  role: null,
  employeeType: "monthly",
  isSuperadmin: false,
  isAdminOrAbove: false,
  isLeaderOrAbove: false,
  isSecretaryOrAbove: false,
  isExecutiveDirectorOrAbove: false,
  isExecOrAbove: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [employeeType, setEmployeeType] = useState<EmployeeType>("monthly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      const { data } = await supabase.rpc("get_my_role");
      setRole((data as Role) ?? "employee");
    };

    // 監聽登入/登出等後續 auth 狀態變化
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        fetchRole();
        supabase.from("profiles").select("employee_type").eq("id", sess.user.id).maybeSingle()
          .then(({ data: p }) => setEmployeeType((p?.employee_type as EmployeeType) ?? "monthly"));
      } else {
        setRole(null);
        setEmployeeType("monthly");
      }
    });

    // 初始載入：等 role 取回後才結束 loading，避免 race condition
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const [roleResult, { data: p }] = await Promise.all([
          supabase.rpc("get_my_role"),
          supabase.from("profiles").select("employee_type").eq("id", s.user.id).maybeSingle(),
        ]);
        setRole((roleResult.data as Role) ?? "employee");
        setEmployeeType((p?.employee_type as EmployeeType) ?? "monthly");
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isSuperadmin = role === "superadmin";
  const isAdminOrAbove = role === "admin" || role === "superadmin";
  const isExecutiveDirectorOrAbove = role === "executive_director" || isAdminOrAbove;
  const isSecretaryOrAbove = role === "secretary_general" || isExecutiveDirectorOrAbove;
  const isExecOrAbove = isSecretaryOrAbove; // 向下相容
  const isLeaderOrAbove = role === "leader" || isExecOrAbove;

  return (
    <Ctx.Provider
      value={{
        user, session, role, employeeType,
        isSuperadmin, isAdminOrAbove, isLeaderOrAbove,
        isSecretaryOrAbove, isExecutiveDirectorOrAbove, isExecOrAbove,
        loading, signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
