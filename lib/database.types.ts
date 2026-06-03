export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
