export interface User {
  id: number;
  name: string;
  display_name: string | null;
  email: string;
  is_admin: boolean;
  two_factor_confirmed_at: string | null;
  setup_completed_at: string | null;
  has_passkeys: boolean;
  avatar_url: string | null;
  timezone: string;
  language: string;
  created_at: string;
}

export interface UserSession {
  id: number;
  name: string | null;
  ip_address: string;
  user_agent: string;
  device: string;
  last_activity: string;
  is_current: boolean;
}

export interface LoginHistoryEntry {
  id: number;
  ip_address: string;
  user_agent: string;
  success: boolean;
  method: string;
  created_at: string;
}

export interface AutoReply {
  enabled: boolean;
  subject: string;
  message: string;
  start_date: string | null;
  end_date: string | null;
}

export interface UserPreferences {
  theme: 'dark' | 'light' | 'auto';
  density: 'compact' | 'normal' | 'spacious';
  font_size: 'small' | 'normal' | 'large';
  default_mailbox_id: number | null;
  reply_behavior: 'reply' | 'reply_all';
  conversation_view: boolean;
  mark_as_read_on_view: boolean;
  notification_categories: string[];
  notify_sent: boolean;
}

export interface Mailbox {
  id: number;
  address: string;
  domain: string;
  display_name: string | null;
  avatar_url: string | null;
  full_address: string;
  signature: string | null;
  role: 'owner' | 'member';
  inbox_unread_count?: number;
}

export type EmailCategory = 'primary' | 'promotions' | 'social' | 'updates' | 'forums';

export interface Thread {
  id: number;
  mailbox_id: number;
  subject: string;
  snippet: string | null;
  from_name: string | null;
  from_address: string | null;
  from_avatar_url: string | null;
  is_outbound: boolean;
  to_name: string | null;
  to_address: string | null;
  has_attachments: boolean;
  last_message_at: string;
  message_count: number;
  category: EmailCategory;
  user_state: ThreadUserState | null;
  labels: Label[];
  emails?: Email[];
}

export interface ThreadUserState {
  is_read: boolean;
  is_starred: boolean;
  is_trashed: boolean;
  is_spam: boolean;
}

export interface Email {
  id: number;
  thread_id: number;
  mailbox_id: number;
  message_id: string;
  in_reply_to: string | null;
  references_header: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[] | null;
  bcc_addresses: string[] | null;
  subject: string;
  html_body: string | null;
  text_body: string | null;
  direction: 'inbound' | 'outbound';
  is_draft: boolean;
  sent_at: string | null;
  scheduled_at: string | null;
  spam_score: number | null;
  auth_results: string | null;
  list_unsubscribe: string | null;
  list_id: string | null;
  attachments: Attachment[];
}

export interface EmailAddress {
  address: string;
  name?: string;
}

export interface Attachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  download_url: string;
  inline_url: string | null;
}

export interface Label {
  id: number;
  name: string;
  color: string | null;
  type: 'system' | 'custom';
  sort_order: number;
}

export interface Passkey {
  id: number;
  name: string;
  created_at: string;
}

export interface LoginResponse {
  two_factor_required: boolean;
  setup_required?: boolean;
  methods?: ('totp' | 'passkey')[];
  user?: User;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface AdminUser extends User {
  mailboxes: Mailbox[];
}

export interface AdminMailbox extends Mailbox {
  users: User[];
  labels: Label[];
}
