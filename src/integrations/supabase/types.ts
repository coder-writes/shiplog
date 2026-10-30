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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          reconnect_required: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          raw_note: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          raw_note?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          raw_note?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_activity: {
        Row: {
          activity_date: string
          additions: number | null
          body_excerpt: string | null
          created_at: string
          deletions: number | null
          external_id: string
          id: string
          occurred_at: string
          repo: string
          sha: string | null
          state: string | null
          title: string
          type: string
          url: string | null
          user_id: string
        }
        Insert: {
          activity_date: string
          additions?: number | null
          body_excerpt?: string | null
          created_at?: string
          deletions?: number | null
          external_id: string
          id?: string
          occurred_at: string
          repo: string
          sha?: string | null
          state?: string | null
          title?: string
          type: string
          url?: string | null
          user_id?: string
        }
        Update: {
          activity_date?: string
          additions?: number | null
          body_excerpt?: string | null
          created_at?: string
          deletions?: number | null
          external_id?: string
          id?: string
          occurred_at?: string
          repo?: string
          sha?: string | null
          state?: string | null
          title?: string
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      github_connections: {
        Row: {
          created_at: string
          github_username: string
          id: string
          last_synced_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          github_username: string
          id?: string
          last_synced_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          github_username?: string
          id?: string
          last_synced_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          category: string
          created_at: string
          entry_id: string | null
          from_note: boolean
          id: string
          impact_note: string | null
          item_date: string
          source_activity_ids: string[]
          status: string
          text: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          entry_id?: string | null
          from_note?: boolean
          id?: string
          impact_note?: string | null
          item_date: string
          source_activity_ids?: string[]
          status?: string
          text: string
          user_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          entry_id?: string | null
          from_note?: boolean
          id?: string
          impact_note?: string | null
          item_date?: string
          source_activity_ids?: string[]
          status?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "daily_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          timezone: string
          week_starts_on: string
          weekly_email_enabled: boolean
          weekly_email_last_period: string | null
        }
        Insert: {
          created_at?: string
          id: string
          timezone?: string
          week_starts_on?: string
          weekly_email_enabled?: boolean
          weekly_email_last_period?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          timezone?: string
          week_starts_on?: string
          weekly_email_enabled?: boolean
          weekly_email_last_period?: string | null
        }
        Relationships: []
      }
      report_shares: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          report_id: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          report_id: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          report_id?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          markdown: string
          period_end: string
          period_start: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          markdown: string
          period_end: string
          period_start: string
          type: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          markdown?: string
          period_end?: string
          period_start?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      connection_status: {
        Args: never
        Returns: {
          connected: boolean
          github_username: string
          last_synced_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
