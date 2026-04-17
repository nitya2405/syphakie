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
  requires_user_key: boolean;
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
  };
}

export async function fetchModels(modality?: string): Promise<ModelOption[]> {
  const qs = modality ? `?modality=${modality}` : "";
  const data = await apiFetch<{ models: ModelOption[] }>(
    `/api/v1/models/list${qs}`,
  );
  return data.models;
}

export async function generate(body: {
  modality: string;
  mode: string;
  prompt: string;
  model?: string;
}): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>("/api/v1/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchBalance(): Promise<number> {
  const data = await apiFetch<{ balance: number }>("/api/v1/credits");
  return data.balance;
}

export async function verifyKey(): Promise<{ email: string; role: string }> {
  return apiFetch("/api/v1/me");
}
