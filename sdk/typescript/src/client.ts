import { SyphaKieError, AuthError, CreditError, ModelNotFoundError } from "./errors";
import type { GenerateOptions, GenerateResponse, ModelOption, StreamOptions, WebhookOptions, PipelineStep } from "./types";

const DEFAULT_BASE = "https://api.syphakie.com";

export class SyphaKie {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(options: { apiKey?: string; baseUrl?: string; timeout?: number } = {}) {
    this.apiKey = options.apiKey ?? process.env.SYPHAKIE_API_KEY ?? "";
    this.baseUrl = (options.baseUrl ?? process.env.SYPHAKIE_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
    this.timeout = options.timeout ?? 120_000;
  }

  // ── Core generation ──────────────────────────────────────────────────────

  async generate(modality: string, prompt: string, options: GenerateOptions = {}): Promise<GenerateResponse> {
    const body: Record<string, unknown> = {
      modality,
      prompt,
      mode: options.mode ?? "auto",
      use_cache: options.useCache ?? true,
    };
    if (options.model) body.model = options.model;
    if (options.taskType) body.task_type = options.taskType;
    if (options.maxCost != null) body.max_cost = options.maxCost;
    if (options.params) body.params = options.params;
    return this.post<GenerateResponse>("/api/v1/generate", body);
  }

  /** Submit generation as an async job. Returns job_id immediately. */
  async generateAsync(modality: string, prompt: string, options: GenerateOptions = {}): Promise<{ job_id: string; status: string }> {
    const body: Record<string, unknown> = {
      modality,
      prompt,
      mode: options.mode ?? "auto",
      use_cache: options.useCache ?? true,
      async_job: true,
    };
    if (options.model) body.model = options.model;
    if (options.taskType) body.task_type = options.taskType;
    if (options.maxCost != null) body.max_cost = options.maxCost;
    if (options.params) body.params = options.params;
    return this.post<{ job_id: string; status: string }>("/api/v1/generate", body);
  }

  async getJob(jobId: string): Promise<unknown> {
    const data = await this.get<{ job: unknown }>(`/api/v1/jobs/${jobId}`);
    return data.job;
  }

  async getJobStatus(jobId: string): Promise<{ status: string; error_message?: string | null }> {
    return this.get<{ status: string; error_message?: string | null }>(`/api/v1/jobs/${jobId}/status`);
  }

  /** Submit async job and poll until complete. Returns the finished job. */
  async generateAndWait(modality: string, prompt: string, options: GenerateOptions & { intervalMs?: number; maxMs?: number } = {}): Promise<unknown> {
    const { job_id } = await this.generateAsync(modality, prompt, options);
    const intervalMs = options.intervalMs ?? 2000;
    const maxMs = options.maxMs ?? 300_000;
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const s = await this.getJobStatus(job_id);
      if (s.status === "success") return this.getJob(job_id);
      if (s.status === "failed") throw new SyphaKieError(s.error_message ?? "Job failed");
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new SyphaKieError(`Job ${job_id} timed out`);
  }

  /** Stream text tokens from the OpenAI-compatible proxy. Returns an AsyncGenerator. */
  async *stream(model: string, messages: Array<{ role: string; content: string }>, options: StreamOptions = {}): AsyncGenerator<string> {
    const body: Record<string, unknown> = { model, messages, stream: true };
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.maxTokens != null) body.max_tokens = options.maxTokens;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    const resp = await fetch(`${this.baseUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) await this.throwError(resp);
    if (!resp.body) return;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const chunk = JSON.parse(data);
          const token: string = chunk.choices?.[0]?.delta?.content ?? "";
          if (token) yield token;
        } catch {
          // skip malformed chunk
        }
      }
    }
  }

  // ── Models ───────────────────────────────────────────────────────────────

  async listModels(modality?: string): Promise<ModelOption[]> {
    const qs = modality ? `?modality=${modality}` : "";
    const data = await this.get<{ models: ModelOption[] }>(`/api/v1/models/list${qs}`);
    return data.models;
  }

  async leaderboard(modality?: string): Promise<unknown[]> {
    const qs = modality ? `?modality=${modality}` : "";
    const data = await this.get<{ leaderboard: unknown[] }>(`/api/v1/leaderboard${qs}`);
    return data.leaderboard;
  }

  async providerStatus(): Promise<unknown[]> {
    const data = await this.get<{ providers: unknown[] }>("/api/v1/leaderboard/providers");
    return data.providers;
  }

  // ── Credits ──────────────────────────────────────────────────────────────

  async balance(): Promise<number> {
    const data = await this.get<{ balance: number }>("/api/v1/credits");
    return data.balance;
  }

  // ── History ──────────────────────────────────────────────────────────────

  async history(limit = 20): Promise<unknown[]> {
    const data = await this.get<{ items: unknown[] }>(`/api/v1/usage?limit=${limit}`);
    return data.items;
  }

  // ── Rating ───────────────────────────────────────────────────────────────

  async rate(requestId: string, rating: 1 | 5, comment?: string): Promise<void> {
    await this.post("/api/v1/leaderboard/rate", { request_id: requestId, rating, comment });
  }

  // ── Pipelines ────────────────────────────────────────────────────────────

  async createPipeline(name: string, steps: PipelineStep[], description?: string): Promise<unknown> {
    const data = await this.post<{ pipeline: unknown }>("/api/v1/pipelines", { name, steps, description });
    return data.pipeline;
  }

  async runPipeline(pipelineId: string, inputPrompt: string, params?: Record<string, unknown>): Promise<{ run_id: string }> {
    return this.post(`/api/v1/pipelines/${pipelineId}/run`, { input_prompt: inputPrompt, params: params ?? {} });
  }

  async getPipelineRun(runId: string): Promise<unknown> {
    const data = await this.get<{ run: unknown }>(`/api/v1/pipelines/runs/${runId}`);
    return data.run;
  }

  /** Poll until run is completed or failed. */
  async waitForPipelineRun(runId: string, intervalMs = 2000, maxMs = 300_000): Promise<unknown> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const run = await this.getPipelineRun(runId) as { status: string };
      if (run.status === "completed" || run.status === "failed") return run;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new SyphaKieError("Pipeline run timed out");
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────

  async createWebhook(url: string, events: string[], options: WebhookOptions = {}): Promise<unknown> {
    const data = await this.post<{ webhook: unknown }>("/api/v1/webhooks", { url, events, secret: options.secret });
    return data.webhook;
  }

  async listWebhooks(): Promise<unknown[]> {
    const data = await this.get<{ webhooks: unknown[] }>("/api/v1/webhooks");
    return data.webhooks;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", "X-API-Key": this.apiKey };
  }

  private async get<T>(path: string): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
    if (!resp.ok) await this.throwError(resp);
    return resp.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) await this.throwError(resp);
    return resp.json() as Promise<T>;
  }

  private async throwError(resp: Response): Promise<never> {
    let code = "ERROR";
    let message = resp.statusText;
    try {
      const body = await resp.json();
      const detail = body?.detail;
      code = (typeof detail === "object" ? detail?.code : null) ?? "ERROR";
      message = (typeof detail === "object" ? detail?.message : detail) ?? message;
    } catch {}
    if (resp.status === 401) throw new AuthError(message, resp.status, code);
    if (resp.status === 402) throw new CreditError(message, resp.status, code);
    if (resp.status === 404 && code === "MODEL_NOT_FOUND") throw new ModelNotFoundError(message, resp.status, code);
    throw new SyphaKieError(message, resp.status, code);
  }
}
