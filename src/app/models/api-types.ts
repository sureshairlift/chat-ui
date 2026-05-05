/**
 * api-types.ts — Wire types for chat-service.
 *
 * Mirrors `apps/chat-service/internal/models/*.go` field-for-field. These
 * are the shapes the REST endpoints emit and accept. Components that
 * previously consumed the mock `Conversation` / `Message` types (in
 * types.ts) should migrate to these as the real backend wiring lands.
 *
 * Naming convention: every API field is snake_case to match the JSON
 * payloads exactly — no client-side renaming. Components still using
 * camelCase from the mock layer can keep their own adapter helpers.
 *
 * The legacy types in types.ts are kept around during migration so the
 * existing mock-data demo continues to render. Once Phase 9 finishes,
 * types.ts becomes a thin re-export of api-types.ts.
 */

// ── Identity ─────────────────────────────────────────────────────────

/** Namespaced principal reference. Format: `<kind>:<id>`.
 *  Examples: `op:42`, `ext:3`, `bot:ai`. Derived at the Go boundary; the
 *  raw int user_id never leaves the JWT verification step. */
export type UserRef = string;

export type PrincipalKind = 'op' | 'ext' | 'bot';

// ── Channels ─────────────────────────────────────────────────────────

export type ChannelType =
  | 'direct'
  | 'group_dm'
  | 'space'
  | 'ai_direct'
  | 'ai_assisted'
  | 'support_direct'
  | 'bot_channel';

export type AIPhase =
  | 'ai_only'
  | 'handoff_pending'
  | 'human_active'
  | 'ai_assist'
  | 'resolved'
  | 'reopened';

export type AIMode = 'primary' | 'assist' | 'off';
export type AIPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationPref = 'all' | 'mentions' | 'none';

export interface ChannelSettings {
  allow_threads: boolean;
  history_visible_to_new_members: boolean;
  default_notification: NotificationPref;
  allow_external_users: boolean;
  retention_days?: number | null;
}

export interface MembersSummary {
  count: number;
  recent_refs: UserRef[];
  /** Display names parallel to recent_refs (same index → same user).
   *  Backend backfills this on member-list reads so direct-channel
   *  headers + avatar piles render real names without a follow-up
   *  /users/lookup round-trip. Optional — older docs may not have it. */
  recent_names?: string[];
}

export interface HandoffMeta {
  opened_at: string;
  reason?: string;
  summary?: string;
  assigned_team?: string;
  assigned_agent_ref?: UserRef;
  claimed_at?: string;
  resolved_at?: string;
  resolved_by_ref?: UserRef;
  first_response_due_at?: string;
  resolution_due_at?: string;
}

export interface AISessionState {
  title?: string;
  phase: AIPhase;
  ai_mode: AIMode;
  priority?: AIPriority;
  handoff?: HandoffMeta;
  intent_tags?: string[];
}

export interface LastMessagePreview {
  message_id: string;
  sender: UserRef;
  snippet: string;
  type: MessageType;
  created_on: string;
}

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  description?: string;
  icon?: string;
  is_private?: boolean;
  dm_key?: string;

  created_by: UserRef;
  created_on: string;
  last_modified: string;
  last_activity_at: string;

  last_message?: LastMessagePreview;
  members_summary: MembersSummary;
  settings: ChannelSettings;
  ai_session_state?: AISessionState;

  archived?: boolean;
  archived_at?: string;
  archived_by?: UserRef;
}

// ── Channel members ──────────────────────────────────────────────────

export type MemberRole =
  | 'owner'
  | 'admin'
  | 'member'
  | 'customer'
  | 'agent'
  | 'ai'
  | 'observer'
  | 'guest';

export type JoinedReason =
  | 'manual'
  | 'self'
  | 'handoff_assign'
  | 'system'
  | 'dm_create'
  | 'reassigned';

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_ref: UserRef;
  role: MemberRole;
  /** Denormalised display name + email — populated on insert (channel
   *  create / invite / migration) and lazily backfilled by the server's
   *  ListMembers from MySQL. Lets the frontend render real names
   *  without a /users/lookup round-trip. */
  user_name?: string;
  email?: string;
  joined_at: string;
  joined_reason?: JoinedReason;
  left_at?: string;
  can_see_history_from?: string;
  last_read_message_id?: string;
  unread_count: number;
  unread_mention_count: number;
  is_pinned?: boolean;
  is_starred?: boolean;
  is_muted?: boolean;
  is_archived?: boolean;
  notification_pref?: NotificationPref;
}

// ── Messages ─────────────────────────────────────────────────────────

export type MessageType =
  | 'message'
  | 'ai'
  | 'ai_suggestion'
  | 'system'
  | 'handoff'
  | 'tool_call';

export type Visibility = 'all' | 'agents_only';

export type ContentFormat = 'text' | 'markdown' | 'blocks';

export type MessageStatus = 'complete' | 'streaming' | 'failed';

export interface MessageSender {
  ref: UserRef;
  user_name?: string;
  email?: string;
  avatar_url?: string;
}

export type AttachmentKind = 'file' | 'image' | 'video' | 'audio';

export interface ApiAttachment {
  kind: AttachmentKind;
  url: string;
  filename?: string;
  size?: number;
  mime?: string;
  thumb_url?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface ApiMentions {
  users?: UserRef[];
  everyone?: boolean;
  here?: boolean;
}

export interface ApiReaction {
  emoji: string;
  user_refs: UserRef[];
  count: number;
}

export interface ApiQuoted {
  message_id: string;
  sender: UserRef;
  snippet: string;
}

export interface ApiAIMeta {
  model?: string;
  provider?: string;
  intent?: string;
  confidence?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
  source_message_ids?: string[];
  rag_sources?: string[];
  requires_approval?: boolean;
}

export interface ApiEditEntry {
  edited_at: string;
  edited_by: UserRef;
  content: string;
}

export interface ApiThreadMeta {
  reply_count: number;
  last_reply_at?: string;
  reply_user_refs?: UserRef[];
  last_reply_preview?: string;
}

export interface ApiMessage {
  id: string;
  channel_id: string;
  thread_root_id?: string;
  broadcast_to_channel?: boolean;

  sender?: MessageSender;
  type: MessageType;
  visibility: Visibility;
  status: MessageStatus;

  content: string;
  content_format: ContentFormat;
  blocks?: Block[];
  block_schema_version?: number;

  attachments?: ApiAttachment[];
  mentions: ApiMentions;
  reactions?: ApiReaction[];

  quoted?: ApiQuoted;
  ai_meta?: ApiAIMeta;
  handoff_meta?: HandoffMeta;

  edited_at?: string;
  edit_count?: number;
  edit_history?: ApiEditEntry[];
  deleted_at?: string;
  deleted_by?: UserRef;

  /** Per-user save (a.k.a. "star"). Array of user_refs. */
  starred_by?: UserRef[];
  /** Per-user view tracking with timestamps — drives the read-receipt
   *  panel ("X · viewed at 10:42 AM"). Replaces the legacy `viewed_by`
   *  string-array (which is still emitted as a compatibility shim). */
  views?: { user_ref: UserRef; viewed_on: string }[];
  /** @deprecated — kept for older clients; readers should prefer `views`. */
  viewed_by?: UserRef[];

  thread_meta?: ApiThreadMeta;
  client_message_id?: string;

  created_on: string;
  last_modified: string;
}

// ── Blocks ───────────────────────────────────────────────────────────

export type BlockKind =
  | 'text'
  | 'markdown'
  | 'code'
  | 'quote'
  | 'divider'
  | 'table'
  | 'chart'
  | 'tool_call'
  | 'citations'
  | 'handoff'
  | 'image'
  | 'file'
  | 'actions'
  | 'form'
  | 'link_preview'
  | 'error';

export interface BlockBase<K extends BlockKind = BlockKind> {
  id: string;
  kind: K;
}

export interface TextBlock extends BlockBase<'text'> {
  text: string;
}

export interface MarkdownBlock extends BlockBase<'markdown'> {
  markdown: string;
}

export interface CodeBlock extends BlockBase<'code'> {
  code: string;
  language?: string;
  filename?: string;
}

export interface QuoteBlock extends BlockBase<'quote'> {
  markdown: string;
  cite?: string;
}

export interface DividerBlock extends BlockBase<'divider'> {}

export interface TableColumn {
  key: string;
  label: string;
  type?: 'string' | 'number' | 'currency' | 'date' | 'datetime' | 'bool';
  align?: 'left' | 'right' | 'center';
}

export interface TableBlock extends BlockBase<'table'> {
  title?: string;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  total_rows?: number;
  sql_executed?: string;
}

export type ChartType =
  | 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter'
  | 'stacked_bar' | 'stacked_area' | 'table_only';

export interface ChartSeries {
  name: string;
  values: (number | null)[];
  color?: string;
}

export interface ChartBlock extends BlockBase<'chart'> {
  title?: string;
  subtitle?: string;
  chart_type: ChartType;
  x_label?: string;
  y_label?: string;
  data: {
    labels: (string | number)[];
    series: ChartSeries[];
  };
}

export interface ToolCallBlock extends BlockBase<'tool_call'> {
  tool: string;
  arguments?: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  duration_ms?: number;
  result_summary?: string;
  error_message?: string;
  requires_approval?: boolean;
}

export interface CitationSource {
  title: string;
  url?: string;
  doc_id?: string;
  snippet?: string;
  score?: number;
}

export interface CitationsBlock extends BlockBase<'citations'> {
  sources: CitationSource[];
}

export interface HandoffBlock extends BlockBase<'handoff'> {
  reason: string;
  summary: string;
  default_team?: UserRef[];
  priority?: AIPriority;
}

export interface ImageBlock extends BlockBase<'image'> {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  caption?: string;
}

export interface FileBlock extends BlockBase<'file'> {
  url: string;
  filename: string;
  size?: number;
  mime?: string;
}

export interface ActionsBlock extends BlockBase<'actions'> {
  actions: Array<{
    id: string;
    label: string;
    kind: 'primary' | 'secondary' | 'danger' | 'link';
    intent?: string;
    args?: Record<string, unknown>;
  }>;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  default?: unknown;
  options?: Array<{ value: string | number; label: string }>;
}

export interface FormBlock extends BlockBase<'form'> {
  title?: string;
  submit_label?: string;
  fields: FormField[];
}

export interface LinkPreviewBlock extends BlockBase<'link_preview'> {
  url: string;
  site_name?: string;
  title?: string;
  description?: string;
  image_url?: string;
}

export interface ErrorBlock extends BlockBase<'error'> {
  code: string;
  message: string;
  retryable?: boolean;
}

export type Block =
  | TextBlock | MarkdownBlock | CodeBlock | QuoteBlock | DividerBlock
  | TableBlock | ChartBlock | ToolCallBlock | CitationsBlock | HandoffBlock
  | ImageBlock | FileBlock | ActionsBlock | FormBlock | LinkPreviewBlock | ErrorBlock;

// ── Channel info envelope (rich, for the conversation header) ──────

export interface ChannelInfoCounts {
  messages: number;
  pinned_messages: number;
  shared_files: number;
  shared_images: number;
  tasks: number;
}

export interface ChannelInfo {
  channel: Channel;
  members: ChannelMember[];
  my_member?: ChannelMember;
  active_handoff?: HandoffRequest;
  counts: ChannelInfoCounts;
}

// ── Handoff queue ────────────────────────────────────────────────────

export type HandoffStatus =
  | 'pending'
  | 'claimed'
  | 'resolved'
  | 'dismissed'
  | 'cancelled';

export interface HandoffRequest {
  id: string;
  channel_id: string;
  opened_by: UserRef;
  opened_on: string;
  ai_summary?: string;
  reason?: string;
  intent_tags?: string[];
  priority: AIPriority;
  assigned_team?: string;
  status: HandoffStatus;
  claimed_by?: UserRef;
  claimed_on?: string;
  assigned_by?: UserRef;
  assigned_agent_ref?: UserRef;
  assigned_on?: string;
  resolved_by?: UserRef;
  resolved_on?: string;
  dismissed_by?: UserRef;
  dismissed_on?: string;
  dismissal_reason?: string;
  wait_minutes?: number;
}

// ── SSE event envelopes (AI streaming) ───────────────────────────────

export interface AIMessageStartData {
  channel_id: string;
  message_id: string;
  sender: UserRef;
  type: 'ai' | 'ai_suggestion';
  visibility: Visibility;
}

export interface AIMessageEndData extends AIMessageStartData {
  blocks: Block[];
  content: string;
  ai_meta?: ApiAIMeta;
}

export interface AIBlockEventData {
  channel_id: string;
  message_id: string;
  block_id: string;
  block_index: number;
  block?: Partial<Block>;
  delta?: { text?: string };
}

export type AISSEEvent =
  | { event: 'ai.message.start'; data: AIMessageStartData }
  | { event: 'ai.message.end'; data: AIMessageEndData }
  | { event: 'ai.block.start'; data: AIBlockEventData }
  | { event: 'ai.block.delta'; data: AIBlockEventData }
  | { event: 'ai.block.update'; data: AIBlockEventData }
  | { event: 'ai.block.end'; data: AIBlockEventData }
  | { event: 'error'; data: { code: string; message: string } };

// ── Transition responses ─────────────────────────────────────────────

export type SideEffectKind =
  | 'set_phase'
  | 'add_member'
  | 'post_system_message'
  | 'soft_delete_message';

export interface SideEffect {
  kind: SideEffectKind;
  phase?: AIPhase;
  user_refs?: UserRef[];
  role?: MemberRole;
  joined_reason?: JoinedReason;
  event_kind?: string;
  detail?: Record<string, unknown>;
  message_id?: string;
}

export interface AppliedEffect {
  kind: SideEffectKind;
  detail?: Record<string, unknown>;
  error?: string;
}

export interface TransitionResult {
  ok: boolean;
  phase?: AIPhase;
  skipped?: boolean;
  applied: AppliedEffect[];
  failed?: AppliedEffect[];
}
