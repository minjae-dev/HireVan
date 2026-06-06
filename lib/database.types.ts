export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * 비자 상태 (Postgres enum `visa_status_enum`).
 * DB → 클라이언트는 `string`으로 직렬화되지만 코드 안정성을 위해 union으로 표현.
 */
export type VisaStatus =
  | 'working_holiday'
  | 'co_op'
  | 'student'
  | 'post_grad_work'
  | 'permanent_resident'
  | 'citizen'
  | 'other'

/**
 * 구직자 자가 진단 영어 레벨.
 */
export type EnglishLevel = 'beginner' | 'intermediate' | 'advanced' | 'native'

/**
 * 가용 시간 (availability) JSON shape.
 * 예: { monday: ['morning', 'evening'], sunday: ['night'] }
 */
export type ShiftSlot = 'morning' | 'afternoon' | 'evening' | 'night'
export type Weekday = keyof AvailabilityMatrix

export type AvailabilityMatrix = Partial<{
  monday: ShiftSlot[]
  tuesday: ShiftSlot[]
  wednesday: ShiftSlot[]
  thursday: ShiftSlot[]
  friday: ShiftSlot[]
  saturday: ShiftSlot[]
  sunday: ShiftSlot[]
}>

/**
 * 구직자의 희망 구직 조건 (seeker_preferences 테이블)
 */
export interface SeekerPreferences {
  id: string
  seeker_id: string
  desired_categories: string[]
  desired_locations: string[]
  desired_salary_min: number | null
  desired_salary_max: number | null
  desired_visa_types: string[]
  desired_certificates: string[]
  notifications_enabled: boolean
  created_at: string
  updated_at: string
}



/**
 * match_jobs_to_seeker RPC 반환 결과
 */
export interface JobMatchResult {
  job_id: string
  title: string
  location: string
  category: string
  salary: string
  employer_name: string
  match_score: number
  matched_reasons: string[]
}

/**
 * employer 대시보드에서 사용하는 billing 상태 객체 (RPC `get_employer_billing_status` 반환값).
 */
export interface EmployerBillingStatus {
  ok: boolean
  reason?: 'unauthenticated' | 'not_employer'
  plan?: 'free' | 'pro'
  pro_subscriber?: boolean
  credit_count?: number
  subscription_ends_at?: string | null
  cancel_at_period_end?: boolean
  grace_period_active?: boolean
  grace_period_ends_at?: string | null
  last_payment_failed_at?: string | null
  has_stripe_customer?: boolean
}

/**
 * `view_seeker_profile` RPC의 반환값.
 * 성공 시 reason ∈ 'pro' | 'granted' | 'already_viewed', 실패 시 'no_credit' | 'unauthenticated' | ...
 */
export interface ViewSeekerProfileResult {
  ok: boolean
  reason:
    | 'pro'
    | 'granted'
    | 'already_viewed'
    | 'no_credit'
    | 'unauthenticated'
    | 'seeker_not_found'
    | 'not_a_seeker'
  profile?: PublicProfile
  credits_remaining: number
}

/**
 * `profiles_public` 뷰 / `view_seeker_profile` RPC 안의 `profile` 필드.
 * premium 필드는 viewer 권한에 따라 NULL일 수 있음.
 *
 * NOTE: `type` (interface 가 아닌 것) 이어야 Supabase generated types 의
 *       Record<string, unknown> 제약을 만족하여 never 로 붕괴되지 않는다.
 */
export type PublicProfile = {
  id: string
  role: 'employer' | 'seeker'
  name: string
  avatar_url: string | null
  bio: string | null
  no_show_count: number
  created_at: string
  visa_status: VisaStatus | string | null
  visa_type: string | null
  visa_expiry: string | null
  visa_expiry_date: string | null
  availability: AvailabilityMatrix | null
  neighborhood: string | null
  has_sir: boolean | null
  has_foodsafe: boolean | null
  english_level: EnglishLevel | null
  // ── 구직자 경쟁력 필드 (2026-06-05 추가) ──
  /** 캐나다 내 근무 경력 (개월). 0 이상. */
  local_experience_months: number | null
  /** 보유 스킬 태그. 예: ['POS', '캐셔', '서빙']. */
  skills: string[] | null
  /** 가능 근무 시간대. 예: ['마감조', '주말 전체']. */
  available_shifts: string[] | null
  /** 희망 근무지 캐나다 우편번호 3자리 (영문+숫자+영문). 예: 'V6B'. */
  postal_code_prefix: string | null
}

/**
 * 매칭 결과 (RPC `match_seekers_to_job`).
 *
 * v2 시그니처:
 *   - spec 컬럼: seeker_id, name, match_score, neighborhood, certificates
 *   - backward-compat: matched_days, matched_certs, reason
 */
export interface SeekerMatch {
  seeker_id: string
  name: string
  match_score: number
  /** spec v2: 구직자 거주 구역 (PRO employer 만 노출) */
  neighborhood: string | null
  /** spec v2: 매칭된 자격증 라벨 배열 */
  certificates: string[] | null
  // ---- backward-compat (기존 클라이언트가 참조하던 필드) ----
  matched_days: string[]
  matched_certs: string[]
  reason: string
}

/**
 * 알림 (notifications 테이블 + Realtime 페이로드).
 */
export interface AppNotification {
  id: string
  user_id: string
  type:
    | 'job_match'
    | 'seeker_match'
    | 'payment_failed'
    | 'subscription_canceled'
    | 'subscription_recovered'
    | 'grace_period_started'
    | 'grace_period_ended'
    | 'welcome_credit'
  title: string
  body: string | null
  link: string | null
  metadata: Json
  read_at: string | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: 'employer' | 'seeker'
          plan: 'free' | 'pro'
          name: string
          bio: string
          visa_type: string
          avatar_url: string
          no_show_count: number
          // Stripe / billing
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          // Credits & PRO
          credit_count: number
          // Seeker credit reward system
          credits: number
          is_verified: boolean
          pro_subscriber: boolean
          subscription_ends_at: string | null
          // Grace period
          grace_period_active: boolean
          grace_period_ends_at: string | null
          last_payment_failed_at: string | null
          welcome_credit_granted: boolean
          // Seeker premium metadata
          visa_status: VisaStatus | null
          visa_expiry: string | null
          visa_expiry_date: string | null
          neighborhood: string | null
          has_sir: boolean
          has_foodsafe: boolean
          availability: Json
          english_level: EnglishLevel | null
          // ── 구직자 경쟁력 필드 (2026-06-05 추가) ──
          local_experience_months: number
          skills: string[]
          available_shifts: string[]
          postal_code_prefix: string | null
          created_at: string
        }
        Insert: {
          id: string
          role: 'employer' | 'seeker'
          plan?: 'free' | 'pro'
          name?: string
          bio?: string
          visa_type?: string
          avatar_url?: string
          no_show_count?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          credit_count?: number
          // Seeker credit reward system
          credits?: number
          is_verified?: boolean
          pro_subscriber?: boolean
          subscription_ends_at?: string | null
          grace_period_active?: boolean
          grace_period_ends_at?: string | null
          last_payment_failed_at?: string | null
          welcome_credit_granted?: boolean
          visa_status?: VisaStatus | null
          visa_expiry?: string | null
          visa_expiry_date?: string | null
          neighborhood?: string | null
          has_sir?: boolean
          has_foodsafe?: boolean
          availability?: Json
          english_level?: EnglishLevel | null
          // ── 구직자 경쟁력 필드 (2026-06-05 추가) ──
          local_experience_months?: number
          skills?: string[]
          available_shifts?: string[]
          postal_code_prefix?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          role?: 'employer' | 'seeker'
          plan?: 'free' | 'pro'
          name?: string
          bio?: string
          visa_type?: string
          avatar_url?: string
          no_show_count?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          credit_count?: number
          // Seeker credit reward system
          credits?: number
          is_verified?: boolean
          pro_subscriber?: boolean
          subscription_ends_at?: string | null
          grace_period_active?: boolean
          grace_period_ends_at?: string | null
          last_payment_failed_at?: string | null
          welcome_credit_granted?: boolean
          visa_status?: VisaStatus | null
          visa_expiry?: string | null
          visa_expiry_date?: string | null
          neighborhood?: string | null
          has_sir?: boolean
          has_foodsafe?: boolean
          availability?: Json
          english_level?: EnglishLevel | null
          // ── 구직자 경쟁력 필드 (2026-06-05 추가) ──
          local_experience_months?: number
          skills?: string[]
          available_shifts?: string[]
          postal_code_prefix?: string | null
          created_at?: string
        }
        Relationships: []
      }
      job_posts: {
        Row: {
          id: string
          employer_id: string
          title: string
          location: string
          category: string
          salary: string
          work_hours: string
          description: string
          status: 'open' | 'closed'
          require_resume: boolean
          custom_questions: Json
          deadline: string | null
          created_at: string
        }
        Insert: {
          id?: string
          employer_id: string
          title: string
          location: string
          category?: string
          salary?: string
          work_hours?: string
          description?: string
          status?: 'open' | 'closed'
          require_resume?: boolean
          custom_questions?: Json
          deadline?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          employer_id?: string
          title?: string
          location?: string
          category?: string
          salary?: string
          work_hours?: string
          description?: string
          status?: 'open' | 'closed'
          require_resume?: boolean
          custom_questions?: Json
          deadline?: string | null
          created_at?: string
        }
        Relationships: []
      }
      job_post_requirements: {
        Row: {
          job_id: string
          preferred_days: string[]
          preferred_shifts: string[]
          required_certificate_ids: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          job_id: string
          preferred_days?: string[]
          preferred_shifts?: string[]
          required_certificate_ids?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          job_id?: string
          preferred_days?: string[]
          preferred_shifts?: string[]
          required_certificate_ids?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          id: string
          job_post_id: string
          seeker_id: string
          status: 'pending' | 'accepted' | 'rejected'
          resume_url: string | null
          custom_answers: Json
          created_at: string
        }
        Insert: {
          id?: string
          job_post_id: string
          seeker_id: string
          status?: 'pending' | 'accepted' | 'rejected'
          resume_url?: string | null
          custom_answers?: Json
          created_at?: string
        }
        Update: {
          id?: string
          job_post_id?: string
          seeker_id?: string
          status?: 'pending' | 'accepted' | 'rejected'
          resume_url?: string | null
          custom_answers?: Json
          created_at?: string
        }
        Relationships: []
      }
      resumes: {
        Row: {
          id: string
          seeker_id: string
          file_url: string
          updated_at: string
        }
        Insert: {
          id?: string
          seeker_id: string
          file_url: string
          updated_at?: string
        }
        Update: {
          id?: string
          seeker_id?: string
          file_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      interviews: {
        Row: {
          id: string
          application_id: string
          employer_id: string
          seeker_id: string
          proposed_dates: Json
          confirmed_date: string | null
          status: 'pending' | 'confirmed' | 'completed'
          created_at: string
        }
        Insert: {
          id?: string
          application_id: string
          employer_id: string
          seeker_id: string
          proposed_dates?: Json
          confirmed_date?: string | null
          status?: 'pending' | 'confirmed' | 'completed'
          created_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          employer_id?: string
          seeker_id?: string
          proposed_dates?: Json
          confirmed_date?: string | null
          status?: 'pending' | 'confirmed' | 'completed'
          created_at?: string
        }
        Relationships: []
      }
      chat_rooms: {
        Row: {
          id: string
          job_post_id: string
          employer_id: string
          seeker_id: string
          interview_completed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          job_post_id: string
          employer_id: string
          seeker_id: string
          interview_completed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          job_post_id?: string
          employer_id?: string
          seeker_id?: string
          interview_completed?: boolean
          created_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          chat_room_id: string
          sender_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          chat_room_id: string
          sender_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          chat_room_id?: string
          sender_id?: string
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          chat_room_id: string
          application_id: string | null
          reviewer_id: string
          reviewee_id: string
          rating: number
          comment: string
          created_at: string
        }
        Insert: {
          id?: string
          chat_room_id: string
          application_id?: string | null
          reviewer_id: string
          reviewee_id: string
          rating: number
          comment?: string
          created_at?: string
        }
        Update: {
          id?: string
          chat_room_id?: string
          application_id?: string | null
          reviewer_id?: string
          reviewee_id?: string
          rating?: number
          comment?: string
          created_at?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          id: string
          code: string
          label_ko: string
          label_en: string
          category: string
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          label_ko: string
          label_en: string
          category?: string
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          label_ko?: string
          label_en?: string
          category?: string
          created_at?: string
        }
        Relationships: []
      }
      seeker_certificates: {
        Row: {
          seeker_id: string
          certificate_id: string
          issued_at: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          seeker_id: string
          certificate_id: string
          issued_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          seeker_id?: string
          certificate_id?: string
          issued_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      seeker_preferences: {
        Row: {
          id: string
          seeker_id: string
          desired_categories: string[]
          desired_locations: string[]
          desired_salary_min: number | null
          desired_salary_max: number | null
          desired_visa_types: string[]
          desired_certificates: string[]
          notifications_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          seeker_id: string
          desired_categories?: string[]
          desired_locations?: string[]
          desired_salary_min?: number | null
          desired_salary_max?: number | null
          desired_visa_types?: string[]
          desired_certificates?: string[]
          notifications_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          seeker_id?: string
          desired_categories?: string[]
          desired_locations?: string[]
          desired_salary_min?: number | null
          desired_salary_max?: number | null
          desired_visa_types?: string[]
          desired_certificates?: string[]
          notifications_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          body: string | null
          link: string | null
          metadata: Json
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          body?: string | null
          link?: string | null
          metadata?: Json
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          body?: string | null
          link?: string | null
          metadata?: Json
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      employer_seeker_views: {
        Row: {
          employer_id: string
          seeker_id: string
          first_viewed_at: string
          last_viewed_at: string
          view_count: number
        }
        Insert: {
          employer_id: string
          seeker_id: string
          first_viewed_at?: string
          last_viewed_at?: string
          view_count?: number
        }
        Update: {
          employer_id?: string
          seeker_id?: string
          first_viewed_at?: string
          last_viewed_at?: string
          view_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: PublicProfile
        Relationships: []
      }
    }
    Functions: {
      grant_welcome_credit: {
        Args: { p_user_id: string }
        Returns: number
      }
      view_seeker_profile: {
        Args: { p_seeker_id: string }
        Returns: ViewSeekerProfileResult
      }
      match_seekers_to_job: {
        Args: { p_job_id: string }
        Returns: SeekerMatch[]
      }
      match_jobs_to_seeker: {
        Args: { p_seeker_id: string; p_limit?: number }
        Returns: JobMatchResult[]
      }
      notify_new_job_matches: {
        Args: { p_job_id: string }
        Returns: number
      }
      expire_grace_periods: {
        Args: Record<string, never>
        Returns: number
      }
      get_employer_billing_status: {
        Args: Record<string, never>
        Returns: EmployerBillingStatus
      }
      is_pro_employer: {
        Args: { p_viewer_id: string }
        Returns: boolean
      }
      has_employer_viewed_seeker: {
        Args: { p_employer_id: string; p_seeker_id: string }
        Returns: boolean
      }
    }
    Enums: {
      visa_status_enum: VisaStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
