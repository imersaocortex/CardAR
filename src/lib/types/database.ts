export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          email: string
          avatar_url: string | null
          role: string
          phone: string | null
          cpf_cnpj: string | null
          address: string | null
          address_number: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_city: string | null
          address_state: string | null
          address_zipcode: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          email: string
          avatar_url?: string | null
          role?: string
          phone?: string | null
          cpf_cnpj?: string | null
          address?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zipcode?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          avatar_url?: string | null
          role?: string
          phone?: string | null
          cpf_cnpj?: string | null
          address?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zipcode?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
          updated_at?: string
        }
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role: string
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
      }
      plans: {
        Row: {
          id: string
          name: string
          slug: string
          price: number
          projects_limit: number
          assets_limit_bytes: number
          assets_limit_label: string
          features: string[]
          active: boolean
          billing_cycle: string
          trial_days: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          price: number
          projects_limit: number
          assets_limit_bytes: number
          assets_limit_label: string
          features?: string[]
          active?: boolean
          billing_cycle?: string
          trial_days?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          price?: number
          projects_limit?: number
          assets_limit_bytes?: number
          assets_limit_label?: string
          features?: string[]
          active?: boolean
          billing_cycle?: string
          trial_days?: number
          created_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          organization_id: string
          plan_id: string
          asaas_subscription_id: string | null
          status: string
          current_period_start: string
          current_period_end: string
          trial_ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          plan_id: string
          asaas_subscription_id?: string | null
          status?: string
          current_period_start?: string
          current_period_end?: string
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          plan_id?: string
          asaas_subscription_id?: string | null
          status?: string
          current_period_start?: string
          current_period_end?: string
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      asaas_checkouts: {
        Row: {
          id: string
          organization_id: string
          subscription_id: string | null
          plan_id: string
          asaas_checkout_id: string | null
          checkout_url: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          subscription_id?: string | null
          plan_id: string
          asaas_checkout_id?: string | null
          checkout_url?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          subscription_id?: string | null
          plan_id?: string
          asaas_checkout_id?: string | null
          checkout_url?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      asaas_customers: {
        Row: {
          id: string
          organization_id: string
          asaas_customer_id: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          asaas_customer_id: string
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          asaas_customer_id?: string
          created_at?: string
        }
      }
      asaas_payments: {
        Row: {
          id: string
          organization_id: string
          subscription_id: string | null
          asaas_payment_id: string
          status: string
          value: number
          due_date: string
          paid_date: string | null
          invoice_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          subscription_id?: string | null
          asaas_payment_id: string
          status: string
          value: number
          due_date: string
          paid_date?: string | null
          invoice_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          subscription_id?: string | null
          asaas_payment_id?: string
          status?: string
          value?: number
          due_date?: string
          paid_date?: string | null
          invoice_url?: string | null
          created_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          organization_id: string
          name: string
          type: string
          status: string
          slug: string
          marker_image_url: string | null
          thumbnail_url: string | null
          views: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          type: string
          status?: string
          slug: string
          marker_image_url?: string | null
          thumbnail_url?: string | null
          views?: number
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          type?: string
          status?: string
          slug?: string
          marker_image_url?: string | null
          thumbnail_url?: string | null
          views?: number
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      project_markers: {
        Row: {
          id: string
          project_id: string
          image_url: string
          target_url: string | null
          width: number
          height: number
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          image_url: string
          target_url?: string | null
          width: number
          height: number
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          image_url?: string
          target_url?: string | null
          width?: number
          height?: number
          created_at?: string
        }
      }
      scenes: {
        Row: {
          id: string
          project_id: string
          name: string
          background_color: string
          lighting_config: Json
          camera_config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          background_color?: string
          lighting_config?: Json
          camera_config?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          background_color?: string
          lighting_config?: Json
          camera_config?: Json
          created_at?: string
          updated_at?: string
        }
      }
      scene_objects: {
        Row: {
          id: string
          scene_id: string
          type: string
          name: string
          position_x: number
          position_y: number
          position_z: number
          rotation_x: number
          rotation_y: number
          rotation_z: number
          scale_x: number
          scale_y: number
          scale_z: number
          opacity: number
          visible: boolean
          layer_order: number
          animation_type: string | null
          action: string | null
          asset_url: string | null
          asset_thumbnail: string | null
          show_caption: boolean | null
          chroma_key_color: string | null
          chroma_key_tolerance: number | null
          chroma_key_smoothness: number | null
          duration: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scene_id: string
          type: string
          name: string
          position_x?: number
          position_y?: number
          position_z?: number
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale_x?: number
          scale_y?: number
          scale_z?: number
          opacity?: number
          visible?: boolean
          layer_order?: number
          animation_type?: string | null
          action?: string | null
          asset_url?: string | null
          asset_thumbnail?: string | null
          show_caption?: boolean | null
          chroma_key_color?: string | null
          chroma_key_tolerance?: number | null
          chroma_key_smoothness?: number | null
          duration?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          scene_id?: string
          type?: string
          name?: string
          position_x?: number
          position_y?: number
          position_z?: number
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale_x?: number
          scale_y?: number
          scale_z?: number
          opacity?: number
          visible?: boolean
          layer_order?: number
          animation_type?: string | null
          action?: string | null
          asset_url?: string | null
          asset_thumbnail?: string | null
          show_caption?: boolean | null
          chroma_key_color?: string | null
          chroma_key_tolerance?: number | null
          chroma_key_smoothness?: number | null
          duration?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      scene_buttons: {
        Row: {
          id: string
          scene_object_id: string
          label: string
          icon: string | null
          action_type: string
          action_value: string
          created_at: string
        }
        Insert: {
          id?: string
          scene_object_id: string
          label: string
          icon?: string | null
          action_type: string
          action_value: string
          created_at?: string
        }
        Update: {
          id?: string
          scene_object_id?: string
          label?: string
          icon?: string | null
          action_type?: string
          action_value?: string
          created_at?: string
        }
      }
      assets: {
        Row: {
          id: string
          organization_id: string
          name: string
          category: string
          mime_type: string
          size_bytes: number
          storage_path: string
          public_url: string
          thumbnail_url: string | null
          uploaded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          category: string
          mime_type: string
          size_bytes: number
          storage_path: string
          public_url: string
          thumbnail_url?: string | null
          uploaded_by: string
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          category?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          public_url?: string
          thumbnail_url?: string | null
          uploaded_by?: string
          created_at?: string
        }
      }
      qr_codes: {
        Row: {
          id: string
          project_id: string
          image_url: string
          target_url: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          image_url: string
          target_url: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          image_url?: string
          target_url?: string
          created_at?: string
        }
      }
      usage_limits: {
        Row: {
          id: string
          organization_id: string
          projects_limit: number
          assets_limit_bytes: number
          projects_used: number
          assets_used_bytes: number
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          projects_limit: number
          assets_limit_bytes: number
          projects_used?: number
          assets_used_bytes?: number
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          projects_limit?: number
          assets_limit_bytes?: number
          projects_used?: number
          assets_used_bytes?: number
          updated_at?: string
        }
      }
      usage_events: {
        Row: {
          id: string
          organization_id: string
          event_type: string
          resource_id: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          event_type: string
          resource_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          event_type?: string
          resource_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      webhook_events: {
        Row: {
          id: string
          source: string
          event_id: string
          event_type: string
          raw_body: Json
          processed: boolean
          processing_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          source: string
          event_id: string
          event_type: string
          raw_body: Json
          processed?: boolean
          processing_error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          source?: string
          event_id?: string
          event_type?: string
          raw_body?: Json
          processed?: boolean
          processing_error?: string | null
          created_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          organization_id: string | null
          user_id: string | null
          action: string
          resource_type: string
          resource_id: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          user_id?: string | null
          action: string
          resource_type: string
          resource_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          user_id?: string | null
          action?: string
          resource_type?: string
          resource_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      system_settings: {
        Row: {
          id: number
          branding: Json
          asaas: Json
          general: Json
          created_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          branding?: Json
          asaas?: Json
          general?: Json
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          branding?: Json
          asaas?: Json
          general?: Json
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
      }
      project_analytics: {
        Row: {
          id: string
          project_id: string
          organization_id: string
          session_id: string | null
          event_type: string
          metadata: Json
          ip_address: string | null
          country: string | null
          city: string | null
          region: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          organization_id: string
          session_id?: string | null
          event_type?: string
          metadata?: Json
          ip_address?: string | null
          country?: string | null
          city?: string | null
          region?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          organization_id?: string
          session_id?: string | null
          event_type?: string
          metadata?: Json
          ip_address?: string | null
          country?: string | null
          city?: string | null
          region?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      subscription_status_history: {
        Row: {
          id: string
          subscription_id: string
          organization_id: string
          old_status: string | null
          new_status: string
          changed_by: string | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          subscription_id: string
          organization_id: string
          old_status?: string | null
          new_status: string
          changed_by?: string | null
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          subscription_id?: string
          organization_id?: string
          old_status?: string | null
          new_status?: string
          changed_by?: string | null
          reason?: string | null
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      check_project_limit: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      check_asset_limit: {
        Args: { p_organization_id: string; p_file_size_bytes: number }
        Returns: boolean
      }
      get_organization_role: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: string
      }
      increment_project_views: {
        Args: { p_project_id: string }
        Returns: void
      }
    }
    Enums: Record<string, never>
  }
}
