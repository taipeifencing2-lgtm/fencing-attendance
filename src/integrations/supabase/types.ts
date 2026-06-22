export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          clocked_at: string
          created_at: string
          id: string
          note: string | null
          type: Database["public"]["Enums"]["attendance_type"]
          user_id: string
        }
        Insert: {
          clocked_at?: string
          created_at?: string
          id?: string
          note?: string | null
          type: Database["public"]["Enums"]["attendance_type"]
          user_id: string
        }
        Update: {
          clocked_at?: string
          created_at?: string
          id?: string
          note?: string | null
          type?: Database["public"]["Enums"]["attendance_type"]
          user_id?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          is_workday: boolean
          name: string
          note: string | null
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          is_workday?: boolean
          name: string
          note?: string | null
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          is_workday?: boolean
          name?: string
          note?: string | null
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          attachment_url: string | null
          created_at: string
          end_at: string
          exec_reviewed_at: string | null
          exec_reviewed_by: string | null
          exec_status: Database["public"]["Enums"]["request_status"] | null
          id: string
          leader_reviewed_at: string | null
          leader_reviewed_by: string | null
          leader_status: Database["public"]["Enums"]["request_status"] | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          secretary_reviewed_at: string | null
          secretary_reviewed_by: string | null
          secretary_status: Database["public"]["Enums"]["request_status"] | null
          start_at: string
          status: Database["public"]["Enums"]["request_status"]
          use_overtime_hours: number
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          end_at: string
          exec_reviewed_at?: string | null
          exec_reviewed_by?: string | null
          exec_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          leader_reviewed_at?: string | null
          leader_reviewed_by?: string | null
          leader_status?: Database["public"]["Enums"]["request_status"] | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          secretary_reviewed_at?: string | null
          secretary_reviewed_by?: string | null
          secretary_status?: Database["public"]["Enums"]["request_status"] | null
          start_at: string
          status?: Database["public"]["Enums"]["request_status"]
          use_overtime_hours?: number
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          end_at?: string
          exec_reviewed_at?: string | null
          exec_reviewed_by?: string | null
          exec_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          leader_reviewed_at?: string | null
          leader_reviewed_by?: string | null
          leader_status?: Database["public"]["Enums"]["request_status"] | null
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          secretary_reviewed_at?: string | null
          secretary_reviewed_by?: string | null
          secretary_status?: Database["public"]["Enums"]["request_status"] | null
          start_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          use_overtime_hours?: number
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      makeup_requests: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          target_time: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          target_time: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          target_time?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      overtime_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          hours: number
          id: string
          reason: string | null
          related_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hours: number
          id?: string
          reason?: string | null
          related_id?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hours?: number
          id?: string
          reason?: string | null
          related_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_color: string | null
          email: string | null
          employee_type: Database["public"]["Enums"]["employee_type"]
          full_name: string | null
          hire_date: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_color?: string | null
          email?: string | null
          employee_type?: Database["public"]["Enums"]["employee_type"]
          full_name?: string | null
          hire_date?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_color?: string | null
          email?: string | null
          employee_type?: Database["public"]["Enums"]["employee_type"]
          full_name?: string | null
          hire_date?: string | null
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_exec_or_above: { Args: { _uid: string }; Returns: boolean }
      is_leader_or_above: { Args: { _uid: string }; Returns: boolean }
      is_superadmin: { Args: { _uid: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "employee"
        | "superadmin"
        | "leader"
        | "secretary_general"
        | "executive_director"
      attendance_type: "clock_in" | "clock_out"
      employee_type: "monthly" | "hourly"
      leave_type:
        | "annual"
        | "sick"
        | "personal"
        | "overtime"
        | "other"
        | "official"
        | "marriage"
        | "paternity"
        | "bereavement"
        | "military"
        | "indigenous"
        | "occupational_injury"
        | "maternity_sick"
      request_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "employee",
        "superadmin",
        "leader",
        "secretary_general",
        "executive_director",
      ],
      attendance_type: ["clock_in", "clock_out"],
      employee_type: ["monthly", "hourly"],
      leave_type: [
        "annual",
        "sick",
        "personal",
        "overtime",
        "other",
        "official",
        "marriage",
        "paternity",
        "bereavement",
        "military",
        "indigenous",
        "occupational_injury",
        "maternity_sick",
      ],
      request_status: ["pending", "approved", "rejected"],
    },
  },
} as const
