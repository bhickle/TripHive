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
      discover_destinations: {
        Row: {
          affiliate_links: Json
          avg_cost: number
          best_months: string
          continent: string
          country: string
          created_at: string
          description: string
          editor_pick: boolean
          flight_hours: number
          id: string
          image: string
          name: string
          tagline: string
          trending: boolean
          vibes: string[]
        }
        Insert: {
          affiliate_links?: Json
          avg_cost?: number
          best_months: string
          continent: string
          country: string
          created_at?: string
          description: string
          editor_pick?: boolean
          flight_hours?: number
          id: string
          image: string
          name: string
          tagline: string
          trending?: boolean
          vibes?: string[]
        }
        Update: {
          affiliate_links?: Json
          avg_cost?: number
          best_months?: string
          continent?: string
          country?: string
          created_at?: string
          description?: string
          editor_pick?: boolean
          flight_hours?: number
          id?: string
          image?: string
          name?: string
          tagline?: string
          trending?: boolean
          vibes?: string[]
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string | null
          custom_amounts: Json | null
          description: string
          id: string
          line_items: Json | null
          paid_by_name: string
          paid_by_user_id: string | null
          receipt_url: string | null
          settled: boolean | null
          split_type: string | null
          trip_id: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string | null
          custom_amounts?: Json | null
          description: string
          id?: string
          line_items?: Json | null
          paid_by_name: string
          paid_by_user_id?: string | null
          receipt_url?: string | null
          settled?: boolean | null
          split_type?: string | null
          trip_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          custom_amounts?: Json | null
          description?: string
          id?: string
          line_items?: Json | null
          paid_by_name?: string
          paid_by_user_id?: string | null
          receipt_url?: string | null
          settled?: boolean | null
          split_type?: string | null
          trip_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_paid_by_user_id_fkey"
            columns: ["paid_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender_id: string | null
          sender_name: string
          trip_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_name: string
          trip_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_name?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      group_votes: {
        Row: {
          closes_at: string | null
          created_at: string
          created_by_name: string
          id: string
          result: string | null
          status: string
          title: string
          trip_id: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          created_by_name?: string
          id?: string
          result?: string | null
          status?: string
          title: string
          trip_id: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          created_by_name?: string
          id?: string
          result?: string | null
          status?: string
          title?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_votes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itineraries: {
        Row: {
          days: Json
          generated_at: string
          id: string
          meta: Json
          source: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          days?: Json
          generated_at?: string
          id?: string
          meta?: Json
          source?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          days?: Json
          generated_at?: string
          id?: string
          meta?: Json
          source?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itineraries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_items: {
        Row: {
          category: string
          created_at: string
          display_order: number
          id: string
          name: string
          packed: boolean
          trip_id: string
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          packed?: boolean
          trip_id: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          packed?: boolean
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_tasks: {
        Row: {
          category: string
          completed: boolean
          created_at: string
          display_order: number
          due_date: string | null
          id: string
          title: string
          trip_id: string
          urgent: boolean
        }
        Insert: {
          category?: string
          completed?: boolean
          created_at?: string
          display_order?: number
          due_date?: string | null
          id?: string
          title: string
          trip_id: string
          urgent?: boolean
        }
        Update: {
          category?: string
          completed?: boolean
          created_at?: string
          display_order?: number
          due_date?: string | null
          id?: string
          title?: string
          trip_id?: string
          urgent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "prep_tasks_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_credits_reset_at: string | null
          ai_credits_used: number
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          notification_preferences: Json | null
          subscription_tier: string
          updated_at: string
        }
        Insert: {
          ai_credits_reset_at?: string | null
          ai_credits_used?: number
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          notification_preferences?: Json | null
          subscription_tier?: string
          updated_at?: string
        }
        Update: {
          ai_credits_reset_at?: string | null
          ai_credits_used?: number
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          notification_preferences?: Json | null
          subscription_tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      trip_invites: {
        Row: {
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string
          invited_by: string | null
          phone: string | null
          status: string | null
          token: string
          trip_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          phone?: string | null
          status?: string | null
          token?: string
          trip_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          phone?: string | null
          status?: string | null
          token?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invites_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          email: string | null
          id: string
          joined_at: string
          name: string | null
          role: string
          trip_id: string
          user_id: string | null
        }
        Insert: {
          email?: string | null
          id?: string
          joined_at?: string
          name?: string | null
          role?: string
          trip_id: string
          user_id?: string | null
        }
        Update: {
          email?: string | null
          id?: string
          joined_at?: string
          name?: string | null
          role?: string
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          day_number: number | null
          id: string
          public_url: string | null
          storage_path: string
          taken_at: string | null
          trip_id: string
          uploaded_by: string | null
          uploader_name: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          day_number?: number | null
          id?: string
          public_url?: string | null
          storage_path: string
          taken_at?: string | null
          trip_id: string
          uploaded_by?: string | null
          uploader_name?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          day_number?: number | null
          id?: string
          public_url?: string | null
          storage_path?: string
          taken_at?: string | null
          trip_id?: string
          uploaded_by?: string | null
          uploader_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_photos_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          booked_flight: Json | null
          booked_hotels: Json
          budget_breakdown: Json
          budget_total: number
          cover_image: string | null
          created_at: string
          destination: string
          end_date: string | null
          group_size: number
          group_type: string | null
          id: string
          organizer_id: string | null
          preferences: Json
          start_date: string | null
          status: string
          title: string
          trip_length: number
          updated_at: string
        }
        Insert: {
          booked_flight?: Json | null
          booked_hotels?: Json
          budget_breakdown?: Json
          budget_total?: number
          cover_image?: string | null
          created_at?: string
          destination: string
          end_date?: string | null
          group_size?: number
          group_type?: string | null
          id?: string
          organizer_id?: string | null
          preferences?: Json
          start_date?: string | null
          status?: string
          title?: string
          trip_length?: number
          updated_at?: string
        }
        Update: {
          booked_flight?: Json | null
          booked_hotels?: Json
          budget_breakdown?: Json
          budget_total?: number
          cover_image?: string | null
          created_at?: string
          destination?: string
          end_date?: string | null
          group_size?: number
          group_type?: string | null
          id?: string
          organizer_id?: string | null
          preferences?: Json
          start_date?: string | null
          status?: string
          title?: string
          trip_length?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_options: {
        Row: {
          display_order: number
          id: string
          label: string
          vote_id: string
        }
        Insert: {
          display_order?: number
          id?: string
          label: string
          vote_id: string
        }
        Update: {
          display_order?: number
          id?: string
          label?: string
          vote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_options_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "group_votes"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_responses: {
        Row: {
          created_at: string
          id: string
          option_id: string
          user_id: string | null
          vote_id: string
          voter_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_id: string
          user_id?: string | null
          vote_id: string
          voter_name: string
        }
        Update: {
          created_at?: string
          id?: string
          option_id?: string
          user_id?: string | null
          vote_id?: string
          voter_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_responses_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "vote_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_responses_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "group_votes"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          best_season: string | null
          country: string | null
          cover_image: string | null
          created_at: string
          destination: string
          estimated_cost: number | null
          id: string
          notes: string | null
          tags: string[] | null
          user_id: string
        }
        Insert: {
          best_season?: string | null
          country?: string | null
          cover_image?: string | null
          created_at?: string
          destination: string
          estimated_cost?: number | null
          id?: string
          notes?: string | null
          tags?: string[] | null
          user_id: string
        }
        Update: {
          best_season?: string | null
          country?: string | null
          cover_image?: string | null
          created_at?: string
          destination?: string
          estimated_cost?: number | null
          id?: string
          notes?: string | null
          tags?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
