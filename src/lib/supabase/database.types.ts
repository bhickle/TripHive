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
      activity_likes: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          trip_id: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          trip_id: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_likes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_votes: {
        Row: {
          activity_id: string
          created_at: string | null
          id: string
          trip_id: string
          updated_at: string | null
          user_id: string
          vote: string
        }
        Insert: {
          activity_id: string
          created_at?: string | null
          id?: string
          trip_id: string
          updated_at?: string | null
          user_id: string
          vote: string
        }
        Update: {
          activity_id?: string
          created_at?: string | null
          id?: string
          trip_id?: string
          updated_at?: string | null
          user_id?: string
          vote?: string
        }
        Relationships: []
      }
      city_geocache: {
        Row: {
          cached_at: string
          city_key: string
          country_key: string
          display_city: string
          display_country: string | null
          id: string
          lat: number
          lon: number
          source: string
        }
        Insert: {
          cached_at?: string
          city_key: string
          country_key?: string
          display_city: string
          display_country?: string | null
          id?: string
          lat: number
          lon: number
          source?: string
        }
        Update: {
          cached_at?: string
          city_key?: string
          country_key?: string
          display_city?: string
          display_country?: string | null
          id?: string
          lat?: number
          lon?: number
          source?: string
        }
        Relationships: []
      }
      destination_events: {
        Row: {
          created_at: string
          destination: string
          event_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          destination: string
          event_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          destination?: string
          event_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
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
      discover_wishlist: {
        Row: {
          created_at: string
          id: string
          item_data: Json
          item_id: string
          saved: boolean
          trip_id: string
          updated_at: string
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_data?: Json
          item_id: string
          saved?: boolean
          trip_id: string
          updated_at?: string
          user_id: string
          vote: string
        }
        Update: {
          created_at?: string
          id?: string
          item_data?: Json
          item_id?: string
          saved?: boolean
          trip_id?: string
          updated_at?: string
          user_id?: string
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "discover_wishlist_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
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
      featured_itineraries: {
        Row: {
          affiliate_links: Json | null
          avg_cost_per_day: number | null
          country: string
          created_at: string | null
          destination: string
          duration_days: number
          editor_pick: boolean | null
          hero_image: string | null
          id: string
          itinerary: Json
          persona_tags: string[] | null
          published: boolean | null
          season_tags: string[] | null
          slug: string
          sort_order: number | null
          tagline: string | null
          title: string
          vibes: string[] | null
        }
        Insert: {
          affiliate_links?: Json | null
          avg_cost_per_day?: number | null
          country: string
          created_at?: string | null
          destination: string
          duration_days?: number
          editor_pick?: boolean | null
          hero_image?: string | null
          id?: string
          itinerary?: Json
          persona_tags?: string[] | null
          published?: boolean | null
          season_tags?: string[] | null
          slug: string
          sort_order?: number | null
          tagline?: string | null
          title: string
          vibes?: string[] | null
        }
        Update: {
          affiliate_links?: Json | null
          avg_cost_per_day?: number | null
          country?: string
          created_at?: string | null
          destination?: string
          duration_days?: number
          editor_pick?: boolean | null
          hero_image?: string | null
          id?: string
          itinerary?: Json
          persona_tags?: string[] | null
          published?: boolean | null
          season_tags?: string[] | null
          slug?: string
          sort_order?: number | null
          tagline?: string | null
          title?: string
          vibes?: string[] | null
        }
        Relationships: []
      }
      flight_bookings: {
        Row: {
          airline: string | null
          arrival_at: string | null
          confirmation_number: string | null
          created_at: string
          departure_at: string | null
          destination: string | null
          details: Json
          email_link: string | null
          flight_number: string | null
          id: string
          notes: string | null
          origin: string | null
          seat: string | null
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          airline?: string | null
          arrival_at?: string | null
          confirmation_number?: string | null
          created_at?: string
          departure_at?: string | null
          destination?: string | null
          details?: Json
          email_link?: string | null
          flight_number?: string | null
          id?: string
          notes?: string | null
          origin?: string | null
          seat?: string | null
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          airline?: string | null
          arrival_at?: string | null
          confirmation_number?: string | null
          created_at?: string
          departure_at?: string | null
          destination?: string | null
          details?: Json
          email_link?: string | null
          flight_number?: string | null
          id?: string
          notes?: string | null
          origin?: string | null
          seat?: string | null
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_bookings_trip_id_fkey"
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
          reactions: Json | null
          sender_id: string | null
          sender_name: string
          trip_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          reactions?: Json | null
          sender_id?: string | null
          sender_name: string
          trip_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          reactions?: Json | null
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
          max_picks: number | null
          result: string | null
          status: string
          title: string
          trip_id: string
          vote_type: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          created_by_name?: string
          id?: string
          max_picks?: number | null
          result?: string | null
          status?: string
          title: string
          trip_id: string
          vote_type?: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          created_by_name?: string
          id?: string
          max_picks?: number | null
          result?: string | null
          status?: string
          title?: string
          trip_id?: string
          vote_type?: string
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
          original_days: Json | null
          source: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          days?: Json
          generated_at?: string
          id?: string
          meta?: Json
          original_days?: Json | null
          source?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          days?: Json
          generated_at?: string
          id?: string
          meta?: Json
          original_days?: Json | null
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
      itinerary_likes: {
        Row: {
          created_at: string
          id: string
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_likes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      layover_plans: {
        Row: {
          airport_code: string
          airport_name: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          items: Json
          layover_hours: number | null
          suggestions: Json | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          airport_code: string
          airport_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          items?: Json
          layover_hours?: number | null
          suggestions?: Json | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          airport_code?: string
          airport_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          items?: Json
          layover_hours?: number | null
          suggestions?: Json | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lifecycle_emails_sent: {
        Row: {
          email_type: string
          id: string
          sent_at: string
          trip_id: string | null
          user_id: string
        }
        Insert: {
          email_type: string
          id?: string
          sent_at?: string
          trip_id?: string | null
          user_id: string
        }
        Update: {
          email_type?: string
          id?: string
          sent_at?: string
          trip_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_emails_sent_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_emails_sent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          inviter_name: string | null
          message: string | null
          read: boolean
          trip_id: string | null
          trip_name: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inviter_name?: string | null
          message?: string | null
          read?: boolean
          trip_id?: string | null
          trip_name?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inviter_name?: string | null
          message?: string | null
          read?: boolean
          trip_id?: string | null
          trip_name?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
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
      photo_comments: {
        Row: {
          author_name: string | null
          body: string
          created_at: string
          id: string
          photo_id: string
          trip_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          photo_id: string
          trip_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          photo_id?: string
          trip_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_comments_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "trip_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_comments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_likes: {
        Row: {
          created_at: string
          id: string
          photo_id: string
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_id: string
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_id?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_likes_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "trip_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_likes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_likes_user_id_fkey"
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
          ai_credits_total: number
          ai_credits_used: number
          avatar_url: string | null
          created_at: string
          default_partner_id: string | null
          email: string | null
          home_country: string | null
          id: string
          name: string | null
          notification_preferences: Json | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_cancel_at: string | null
          subscription_tier: string
          travel_persona: Json | null
          updated_at: string
        }
        Insert: {
          ai_credits_reset_at?: string | null
          ai_credits_total?: number
          ai_credits_used?: number
          avatar_url?: string | null
          created_at?: string
          default_partner_id?: string | null
          email?: string | null
          home_country?: string | null
          id: string
          name?: string | null
          notification_preferences?: Json | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at?: string | null
          subscription_tier?: string
          travel_persona?: Json | null
          updated_at?: string
        }
        Update: {
          ai_credits_reset_at?: string | null
          ai_credits_total?: number
          ai_credits_used?: number
          avatar_url?: string | null
          created_at?: string
          default_partner_id?: string | null
          email?: string | null
          home_country?: string | null
          id?: string
          name?: string | null
          notification_preferences?: Json | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at?: string | null
          subscription_tier?: string
          travel_persona?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_partner_id_fkey"
            columns: ["default_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          attempts: number
          key: string
          window_start: string
        }
        Insert: {
          attempts?: number
          key: string
          window_start?: string
        }
        Update: {
          attempts?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      seasonal_collections: {
        Row: {
          accent_color: string | null
          created_at: string | null
          description: string | null
          destination_names: string[] | null
          hero_image: string | null
          id: string
          published: boolean | null
          season: string
          slug: string
          sort_order: number | null
          title: string
        }
        Insert: {
          accent_color?: string | null
          created_at?: string | null
          description?: string | null
          destination_names?: string[] | null
          hero_image?: string | null
          id?: string
          published?: boolean | null
          season: string
          slug: string
          sort_order?: number | null
          title: string
        }
        Update: {
          accent_color?: string | null
          created_at?: string | null
          description?: string | null
          destination_names?: string[] | null
          hero_image?: string | null
          id?: string
          published?: boolean | null
          season?: string
          slug?: string
          sort_order?: number | null
          title?: string
        }
        Relationships: []
      }
      souvenir_items: {
        Row: {
          created_at: string
          display_order: number
          id: string
          idea: string
          person: string
          purchased: boolean
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          idea?: string
          person: string
          purchased?: boolean
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          idea?: string
          person?: string
          purchased?: boolean
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "souvenir_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
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
          preferences: Json | null
          role: string
          trip_id: string
          user_id: string | null
        }
        Insert: {
          email?: string | null
          id?: string
          joined_at?: string
          name?: string | null
          preferences?: Json | null
          role?: string
          trip_id: string
          user_id?: string | null
        }
        Update: {
          email?: string | null
          id?: string
          joined_at?: string
          name?: string | null
          preferences?: Json | null
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
      trip_passes: {
        Row: {
          ai_credits_total: number
          ai_credits_used: number
          created_at: string
          expires_at: string
          extra_people: number
          id: string
          purchased_at: string
          trip_id: string
          user_id: string
        }
        Insert: {
          ai_credits_total?: number
          ai_credits_used?: number
          created_at?: string
          expires_at: string
          extra_people?: number
          id?: string
          purchased_at?: string
          trip_id: string
          user_id: string
        }
        Update: {
          ai_credits_total?: number
          ai_credits_used?: number
          created_at?: string
          expires_at?: string
          extra_people?: number
          id?: string
          purchased_at?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_passes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_passes_user_id_fkey"
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
          build_credits_charged_at: string | null
          cover_image: string | null
          cover_image_meta: Json | null
          created_at: string
          destination: string
          end_date: string | null
          fork_source_id: string | null
          group_size: number
          group_type: string | null
          id: string
          is_founder_featured: boolean
          is_private: boolean
          is_public_template: boolean
          itinerary_generated_at: string | null
          organizer_id: string | null
          preferences: Json
          start_date: string | null
          status: string
          title: string
          trip_length: number
          updated_at: string
          visited_cities: string[]
        }
        Insert: {
          booked_flight?: Json | null
          booked_hotels?: Json
          budget_breakdown?: Json
          budget_total?: number
          build_credits_charged_at?: string | null
          cover_image?: string | null
          cover_image_meta?: Json | null
          created_at?: string
          destination: string
          end_date?: string | null
          fork_source_id?: string | null
          group_size?: number
          group_type?: string | null
          id?: string
          is_founder_featured?: boolean
          is_private?: boolean
          is_public_template?: boolean
          itinerary_generated_at?: string | null
          organizer_id?: string | null
          preferences?: Json
          start_date?: string | null
          status?: string
          title?: string
          trip_length?: number
          updated_at?: string
          visited_cities?: string[]
        }
        Update: {
          booked_flight?: Json | null
          booked_hotels?: Json
          budget_breakdown?: Json
          budget_total?: number
          build_credits_charged_at?: string | null
          cover_image?: string | null
          cover_image_meta?: Json | null
          created_at?: string
          destination?: string
          end_date?: string | null
          fork_source_id?: string | null
          group_size?: number
          group_type?: string | null
          id?: string
          is_founder_featured?: boolean
          is_private?: boolean
          is_public_template?: boolean
          itinerary_generated_at?: string | null
          organizer_id?: string | null
          preferences?: Json
          start_date?: string | null
          status?: string
          title?: string
          trip_length?: number
          updated_at?: string
          visited_cities?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "trips_fork_source_id_fkey"
            columns: ["fork_source_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_verification_cache: {
        Row: {
          cache_key: string
          checked_at: string
          city: string
          matched_name: string | null
          status: string
          venue_name: string
        }
        Insert: {
          cache_key: string
          checked_at?: string
          city: string
          matched_name?: string | null
          status: string
          venue_name: string
        }
        Update: {
          cache_key?: string
          checked_at?: string
          city?: string
          matched_name?: string | null
          status?: string
          venue_name?: string
        }
        Relationships: []
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
          links: Json
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
          links?: Json
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
          links?: Json
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
      cast_single_pick_vote: {
        Args: {
          p_option_id: string
          p_user_id: string
          p_vote_id: string
          p_voter_name: string
        }
        Returns: undefined
      }
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      increment_trip_pass_credits: {
        Args: { p_amount: number; p_pass_id: string }
        Returns: number
      }
      increment_user_ai_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
      trip_cities: {
        Args: { trip_ids: string[] }
        Returns: {
          cities: string[]
          trip_id: string
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
