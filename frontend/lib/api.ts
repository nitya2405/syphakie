import { getApiKey } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const key = getApiKey();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "X-API-Key": key } : {}),
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = body?.detail;
    const code = detail?.code ?? "ERROR";
    const message = detail?.message ?? body?.message ?? res.statusText;
    throw new ApiError(res.status, code, message);
  }

  return body as T;
}

// ── Types mirroring backend Pydantic schemas ──────────────────────────────

export interface ModelOption {
  model_id: string;
  display_name: string;
  provider: string;
  modality: string;
  task_type: string | null;
  task_types: string[];
  vendor: string | null;
  cost_per_unit: number;
  unit_type: string;
}

export interface GenerateResponse {
  success: boolean;
  request_id: string;
  modality: string;
  provider: string;
  model: string;
  output: {
    type: string;
    content: string | null;
    url: string | null;
    mime_type: string | null;
  };
  meta: {
    latency_ms: number;
    credits_used: number;
    credits_remaining: number;
    units_used: number;
    unit_type: string;
    routing_mode: string;
    fallback_provider?: string | null;
  };
}

export interface ModelFull extends ModelOption {
  is_active: boolean;
  avg_latency_ms: number | null;
  quality_score: number | null;
}

export interface UsageSummary {
  total_requests: number;
  total_credits_used: number;
  by_modality: Record<string, number>;
  by_provider: Record<string, number>;
}

export interface UsageDay {
  date: string;
  requests: number;
  credits: number;
}

export async function fetchModels(modality?: string): Promise<ModelOption[]> {
  const qs = modality ? `?modality=${modality}` : "";
  const data = await apiFetch<{ models: ModelOption[] }>(
    `/api/v1/models/list${qs}`,
  );
  return data.models;
}

export async function fetchAllModels(modality?: string): Promise<ModelFull[]> {
  const qs = modality ? `?modality=${modality}` : "";
  const data = await apiFetch<{ models: ModelFull[] }>(`/api/v1/models${qs}`);
  return data.models;
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  return apiFetch<UsageSummary>("/api/v1/usage/summary");
}

export async function fetchUsageDaily(days = 30): Promise<UsageDay[]> {
  const data = await apiFetch<{ days: UsageDay[] }>(
    `/api/v1/usage/daily?days=${days}`,
  );
  return data.days;
}

export async function generate(body: {
  modality: string;
  mode: string;
  prompt: string;
  image_url?: string;
  file_url?: string;
  model?: string;
  use_org_credits?: boolean;
}): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>("/api/v1/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface JobQueued {
  job_id: string;
  status: "queued";
}

export interface JobResult {
  id: string;
  status: string;
  modality: string | null;
  model_id: string | null;
  provider: string | null;
  output_url: string | null;
  output_content: string | null;
  error_message: string | null;
  credits_used: number | null;
  request_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function generateAsync(body: {
  modality: string;
  mode: string;
  prompt: string;
  image_url?: string;
  file_url?: string;
  model?: string;
  task_type?: string;
  use_org_credits?: boolean;
}): Promise<JobQueued> {
  return apiFetch<JobQueued>("/api/v1/generate", {
    method: "POST",
    body: JSON.stringify({ ...body, async_job: true }),
  });
}

export async function uploadFile(file: File): Promise<{ url: string; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);
  
  const key = getApiKey();
  const res = await fetch(`${BASE}/api/v1/outputs/upload`, {
    method: "POST",
    headers: {
      ...(key ? { "X-API-Key": key } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.detail?.code ?? "UPLOAD_ERROR", body?.detail?.message ?? res.statusText);
  }

  return res.json();
}

export async function fetchJobStatus(jobId: string): Promise<{ status: string; error_message?: string | null }> {
  return apiFetch(`/api/v1/jobs/${jobId}/status`);
}

export async function fetchJob(jobId: string): Promise<JobResult> {
  const d = await apiFetch<{ job: JobResult }>(`/api/v1/jobs/${jobId}`);
  return d.job;
}

export async function allotOrgCredits(userId: string, amount: number, orgId?: string): Promise<{ ok: boolean; org_balance: number; member_balance: number }> {
  return apiFetch("/api/v1/orgs/credits/allot", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, amount, org_id: orgId }),
  });
}

// ── Multi-org ─────────────────────────────────────────────────────────────────

export interface OrgListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  owner_id: string;
  credits_balance: number;
  created_at: string;
  my_role: string;
  is_active: boolean;
}

export interface OrgMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  joined_at: string;
  credits_balance: number;
}

export interface OrgDetail {
  org: OrgListItem;
  members: OrgMember[];
}

export async function fetchMyOrgs(): Promise<{ active_org_id: string | null; orgs: OrgListItem[] }> {
  return apiFetch("/api/v1/orgs/mine");
}

export async function fetchOrgDetail(orgId: string): Promise<OrgDetail> {
  return apiFetch(`/api/v1/orgs/${orgId}`);
}

export async function switchActiveOrg(orgId: string): Promise<{ ok: boolean; active_org_id: string; org: OrgListItem }> {
  return apiFetch(`/api/v1/orgs/switch/${orgId}`, { method: "POST" });
}

export async function createOrg(name: string, description?: string): Promise<{ org: OrgListItem }> {
  return apiFetch("/api/v1/orgs/create", { method: "POST", body: JSON.stringify({ name, description }) });
}

export async function updateOrg(orgId: string, data: { name?: string; description?: string }): Promise<{ org: OrgListItem }> {
  return apiFetch(`/api/v1/orgs/${orgId}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deleteOrg(orgId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/v1/orgs/${orgId}`, { method: "DELETE" });
}

export async function addCreditsToOrg(orgId: string, amount: number): Promise<{ ok: boolean; org_balance: number; personal_balance: number }> {
  return apiFetch(`/api/v1/orgs/${orgId}/credits/add`, { method: "POST", body: JSON.stringify({ amount }) });
}

export async function leaveOrg(orgId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/v1/orgs/${orgId}/leave`, { method: "POST" });
}

export async function transferOwnership(orgId: string, newOwnerId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/v1/orgs/${orgId}/transfer-owner`, { method: "PATCH", body: JSON.stringify({ new_owner_id: newOwnerId }) });
}

export async function updateMemberRole(userId: string, role: string, orgId?: string): Promise<{ ok: boolean }> {
  return apiFetch("/api/v1/orgs/member-role", { method: "PATCH", body: JSON.stringify({ user_id: userId, role, org_id: orgId }) });
}

export async function removeMember(userId: string, orgId?: string): Promise<{ ok: boolean }> {
  const qs = orgId ? `?org_id=${orgId}` : "";
  return apiFetch(`/api/v1/orgs/member/${userId}${qs}`, { method: "DELETE" });
}

export async function inviteMember(email: string, role: string, orgId?: string): Promise<{ ok: boolean; member: OrgMember }> {
  return apiFetch("/api/v1/orgs/invite", { method: "POST", body: JSON.stringify({ email, role, org_id: orgId }) });
}

export interface HistoryRecord {
  request_id: string;
  modality: string;
  provider: string | null;
  model: string | null;
  status: string;
  credits_deducted: number;
  latency_ms: number | null;
  error_message: string | null;
  prompt: string | null;
  created_at: string;
}

export interface OutputData {
  request_id: string;
  modality: string;
  output: {
    type: string;
    content: string | null;
    url: string | null;
  };
}

export async function fetchBalance(): Promise<number> {
  const data = await apiFetch<{ balance: number }>("/api/v1/credits");
  return data.balance;
}

export async function fetchHistory(limit = 10): Promise<HistoryRecord[]> {
  const data = await apiFetch<{ items: HistoryRecord[] }>(
    `/api/v1/usage?limit=${limit}`,
  );
  return data.items;
}

export async function fetchOutput(requestId: string): Promise<OutputData> {
  return apiFetch<OutputData>(`/api/v1/outputs/${requestId}`);
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone_number: string | null;
  role: string;
  api_key: string | null;
  api_key_prefix: string | null;
}

export async function signup(body: {
  email: string;
  password: string;
  full_name?: string;
}): Promise<{ api_key: string; user_id: string; email: string }> {
  return apiFetch("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function loginWithPassword(body: {
  email: string;
  password: string;
}): Promise<{ api_key: string; user_id: string; email: string; name: string | null }> {
  return apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/me");
}

export async function updateProfile(body: {
  name?: string;
  phone_number?: string;
}): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export async function fetchNotifications(unreadOnly = false): Promise<{ unread_count: number; notifications: NotificationItem[] }> {
  return apiFetch(`/api/v1/notifications${unreadOnly ? "?unread_only=true" : ""}`);
}

// ── Billing ───────────────────────────────────────────────────────────────────

export interface CreditPack {
  id: string;
  credits: number;
  price_usd: number;
  label: string;
}

export async function fetchCreditPacks(): Promise<CreditPack[]> {
  const d = await apiFetch<{ packs: CreditPack[] }>("/api/v1/billing/packs");
  return d.packs;
}

export async function createCheckoutSession(pack_id: string): Promise<{ checkout_url: string; session_id: string }> {
  return apiFetch("/api/v1/billing/checkout", { method: "POST", body: JSON.stringify({ pack_id }) });
}

// ── Prompt Templates ──────────────────────────────────────────────────────────

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  modality: string | null;
  model_id: string | null;
  params: Record<string, unknown> | null;
  created_at: string;
}

export async function fetchTemplates(): Promise<PromptTemplate[]> {
  const d = await apiFetch<{ templates: PromptTemplate[] }>("/api/v1/templates");
  return d.templates;
}

export async function saveTemplate(body: { name: string; prompt: string; modality?: string; model_id?: string }): Promise<PromptTemplate> {
  const d = await apiFetch<{ template: PromptTemplate }>("/api/v1/templates", { method: "POST", body: JSON.stringify(body) });
  return d.template;
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch(`/api/v1/templates/${id}`, { method: "DELETE" });
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scope: string | null;
  last_used: string | null;
  expires_at: string | null;
  created_at: string;
}

export async function fetchApiKeys(): Promise<ApiKeyRecord[]> {
  const d = await apiFetch<{ keys: ApiKeyRecord[] }>("/api/v1/auth/keys");
  return d.keys;
}

export async function createApiKey(body: { name: string; scope?: string; expires_days?: number }): Promise<{ key: string; id: string; prefix: string }> {
  return apiFetch("/api/v1/auth/keys", { method: "POST", body: JSON.stringify(body) });
}

export async function rotateApiKey(keyId: string): Promise<{ key: string; id: string; prefix: string }> {
  return apiFetch(`/api/v1/auth/keys/${keyId}/rotate`, { method: "POST" });
}

export async function revokeApiKey(keyId: string): Promise<void> {
  await apiFetch(`/api/v1/auth/keys/${keyId}`, { method: "DELETE" });
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  status: string;
  attempts: number;
  last_response_code: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
}

export async function fetchWebhooks(): Promise<WebhookRecord[]> {
  const d = await apiFetch<{ webhooks: WebhookRecord[] }>("/api/v1/webhooks");
  return d.webhooks;
}

export async function createWebhook(body: { url: string; events: string[]; secret?: string }): Promise<WebhookRecord> {
  const d = await apiFetch<{ webhook: WebhookRecord }>("/api/v1/webhooks", { method: "POST", body: JSON.stringify(body) });
  return d.webhook;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  model_id: string;
  display_name: string;
  provider: string;
  modality: string;
  cost_per_unit: number;
  unit_type: string;
  avg_latency_ms: number | null;
  quality_score: number | null;
  rating_count: number;
  avg_rating: number | null;
  thumbs_up: number;
  thumbs_down: number;
}

export async function fetchLeaderboard(modality?: string): Promise<LeaderboardEntry[]> {
  const qs = modality ? `?modality=${modality}` : "";
  const d = await apiFetch<{ leaderboard: LeaderboardEntry[] }>(`/api/v1/leaderboard${qs}`);
  return d.leaderboard;
}

export async function rateModel(body: { request_id: string; rating: number; comment?: string }): Promise<void> {
  await apiFetch("/api/v1/leaderboard/rate", { method: "POST", body: JSON.stringify(body) });
}

// ── Pipelines ─────────────────────────────────────────────────────────────────

export interface PipelineRecord {
  id: string;
  name: string;
  description: string | null;
  steps: unknown[];
  is_public: boolean;
  created_at: string;
}

export async function fetchPipelines(): Promise<PipelineRecord[]> {
  const d = await apiFetch<{ pipelines: PipelineRecord[] }>("/api/v1/pipelines");
  return d.pipelines;
}

export async function deletePipeline(id: string): Promise<void> {
  await apiFetch(`/api/v1/pipelines/${id}`, { method: "DELETE" });
}

// ── Experiments ───────────────────────────────────────────────────────────────

export interface ExperimentRecord {
  id: string;
  name: string;
  modality: string;
  variants: unknown[];
  status: string;
  winner_model_id: string | null;
  created_at: string;
}

export async function fetchExperiments(): Promise<ExperimentRecord[]> {
  const d = await apiFetch<{ experiments: ExperimentRecord[] }>("/api/v1/experiments");
  return d.experiments;
}

// ── Telegram ──────────────────────────────────────────────────────────────────

export interface TelegramStatus {
  connected: boolean;
  username?: string | null;
  connected_at?: string | null;
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  return apiFetch("/api/v1/telegram/status");
}

export async function getTelegramToken(): Promise<{ token: string; deep_link: string; bot_url: string; expires_in: number }> {
  return apiFetch("/api/v1/telegram/token", { method: "POST" });
}

export async function disconnectTelegram(): Promise<{ ok: boolean }> {
  return apiFetch("/api/v1/telegram/connection", { method: "DELETE" });
}

// ── Fine-tune ─────────────────────────────────────────────────────────────────

export interface FinetuneJobRecord {
  id: string;
  provider: string;
  base_model_id: string;
  display_name: string | null;
  status: string;
  result_model_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function fetchFinetuneJobs(): Promise<FinetuneJobRecord[]> {
  const d = await apiFetch<{ jobs: FinetuneJobRecord[] }>("/api/v1/finetune");
  return d.jobs;
}
