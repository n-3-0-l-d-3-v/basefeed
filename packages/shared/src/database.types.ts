
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity": {
                  Row: {
                    "action": string,"actor_name": string,"actor_user_id": string | null,"comment_id": string | null,"created_at": string,"id": number,"meta": NonNullable<Json>,"project_id": string
                  }
                  Insert: {
                    "action": string,"actor_name": string,"actor_user_id"?: string | null,"comment_id"?: string | null,"created_at"?: string,"id"?: never,"meta"?: NonNullable<Json>,"project_id": string
                  }
                  Update: {
                    "action"?: string,"actor_name"?: string,"actor_user_id"?: string | null,"comment_id"?: string | null,"created_at"?: string,"id"?: never,"meta"?: NonNullable<Json>,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_comment_id_fkey"
      columns: ["comment_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "anchor": Json | null,"anchor_state": string,"assignee_id": string | null,"author_guest_id": string | null,"author_name": string,"author_user_id": string | null,"body": string,"category": string | null,"change_summary": Json | null,"checked_at": string | null,"context": NonNullable<Json>,"created_at": string,"id": string,"number": number,"page_id": string,"pin": Json | null,"priority": Database["public"]['Enums']["comment_priority"],"project_id": string,"resolved_at": string | null,"screenshot_path": string | null,"snapshot": Json | null,"status": Database["public"]['Enums']["comment_status"],"title": string | null,"triage": Json | null,"triage_state": string,"updated_at": string
                  }
                  Insert: {
                    "anchor"?: Json | null,"anchor_state"?: string,"assignee_id"?: string | null,"author_guest_id"?: string | null,"author_name": string,"author_user_id"?: string | null,"body": string,"category"?: string | null,"change_summary"?: Json | null,"checked_at"?: string | null,"context"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"number"?: number,"page_id": string,"pin"?: Json | null,"priority"?: Database["public"]['Enums']["comment_priority"],"project_id": string,"resolved_at"?: string | null,"screenshot_path"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["comment_status"],"title"?: string | null,"triage"?: Json | null,"triage_state"?: string,"updated_at"?: string
                  }
                  Update: {
                    "anchor"?: Json | null,"anchor_state"?: string,"assignee_id"?: string | null,"author_guest_id"?: string | null,"author_name"?: string,"author_user_id"?: string | null,"body"?: string,"category"?: string | null,"change_summary"?: Json | null,"checked_at"?: string | null,"context"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"number"?: number,"page_id"?: string,"pin"?: Json | null,"priority"?: Database["public"]['Enums']["comment_priority"],"project_id"?: string,"resolved_at"?: string | null,"screenshot_path"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["comment_status"],"title"?: string | null,"triage"?: Json | null,"triage_state"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_guest_id_fkey"
      columns: ["author_guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_page_id_fkey"
      columns: ["page_id"]
isOneToOne: false
      referencedRelation: "pages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"guests": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"name": string,"project_id": string
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"id"?: string,"name": string,"project_id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"name"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guests_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "attempts": number,"created_at": string,"id": number,"idempotency_key": string | null,"kind": string,"last_error": string | null,"locked_at": string | null,"max_attempts": number,"payload": NonNullable<Json>,"run_after": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"id"?: never,"idempotency_key"?: string | null,"kind": string,"last_error"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"run_after"?: string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"id"?: never,"idempotency_key"?: string | null,"kind"?: string,"last_error"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"run_after"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pages": {
                  Row: {
                    "created_at": string,"id": string,"image_path": string | null,"kind": string,"project_id": string,"title": string,"url": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"image_path"?: string | null,"kind"?: string,"project_id": string,"title"?: string,"url": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"image_path"?: string | null,"kind"?: string,"project_id"?: string,"title"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pages_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"name": string
                  }
                  Insert: {
                    "created_at"?: string,"email"?: string,"id": string,"name"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"projects": {
                  Row: {
                    "allowed_origins": (string)[],"archived_at": string | null,"comment_seq": number,"created_at": string,"created_by": string | null,"figma_url": string | null,"id": string,"name": string,"public_key": string,"site_url": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "allowed_origins"?: (string)[],"archived_at"?: string | null,"comment_seq"?: number,"created_at"?: string,"created_by"?: string | null,"figma_url"?: string | null,"id"?: string,"name": string,"public_key"?: string,"site_url"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "allowed_origins"?: (string)[],"archived_at"?: string | null,"comment_seq"?: number,"created_at"?: string,"created_by"?: string | null,"figma_url"?: string | null,"id"?: string,"name"?: string,"public_key"?: string,"site_url"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "bucket": string,"hits": number,"window_start": string
                  }
                  Insert: {
                    "bucket": string,"hits"?: number,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"hits"?: number,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"replies": {
                  Row: {
                    "author_guest_id": string | null,"author_name": string,"author_user_id": string | null,"body": string,"comment_id": string,"created_at": string,"id": string,"project_id": string
                  }
                  Insert: {
                    "author_guest_id"?: string | null,"author_name": string,"author_user_id"?: string | null,"body": string,"comment_id": string,"created_at"?: string,"id"?: string,"project_id": string
                  }
                  Update: {
                    "author_guest_id"?: string | null,"author_name"?: string,"author_user_id"?: string | null,"body"?: string,"comment_id"?: string,"created_at"?: string,"id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "replies_author_guest_id_fkey"
      columns: ["author_guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replies_comment_id_fkey"
      columns: ["comment_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replies_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"share_links": {
                  Row: {
                    "created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"label": string,"project_id": string,"revoked_at": string | null,"token_hash": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"label"?: string,"project_id": string,"revoked_at"?: string | null,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"label"?: string,"project_id"?: string,"revoked_at"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_links_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_invites": {
                  Row: {
                    "created_at": string,"created_by": string | null,"expires_at": string,"id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["member_role"],"token_hash": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"token_hash": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"token_hash"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_invites_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["member_role"],"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "can_access_project":
{ Args: { "p": string }; Returns: boolean
                           },
"claim_jobs":
{ Args: { "p_kind": string,"p_limit"?: number }; Returns: {
              "attempts": number,
"created_at": string,
"id": number,
"idempotency_key": string | null,
"kind": string,
"last_error": string | null,
"locked_at": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"run_after": string,
"status": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"finish_job":
{ Args: { "p_error"?: string,"p_id": number }; Returns: undefined
                           },
"has_role":
{ Args: { "roles": (Database["public"]['Enums']["member_role"])[],"ws": string }; Returns: boolean
                           },
"hit_rate_limit":
{ Args: { "p_bucket": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"is_member":
{ Args: { "ws": string }; Returns: boolean
                           },
"update_comment_as":
{ Args: { "p_actor": string,"p_actor_name": string,"p_comment": string,"p_patch": Json,"p_project": string }; Returns: undefined
                           }
          }
          Enums: {
            "comment_priority": "low"|"medium"|"high"|"urgent","comment_status": "open"|"in_progress"|"resolved","member_role": "owner"|"admin"|"member"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "comment_priority": ["low", "medium", "high", "urgent"],"comment_status": ["open", "in_progress", "resolved"],"member_role": ["owner", "admin", "member"]
          }
        }
} as const
