export interface GenerateOptions {
  model?: string;
  mode?: "manual" | "auto" | "best" | "budget";
  taskType?: string;
  maxCost?: number;
  useCache?: boolean;
  params?: Record<string, unknown>;
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

export interface ModelOption {
  model_id: string;
  display_name: string;
  provider: string;
  modality: string;
  task_type: string | null;
  task_types: string[];
  cost_per_unit: number;
  unit_type: string;
  quality_score: number | null;
  avg_latency_ms: number | null;
}

export interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface WebhookOptions {
  secret?: string;
}

export interface PipelineStep {
  step: number;
  modality: string;
  model_id: string;
  provider: string;
  prompt_template: string;
  params?: Record<string, unknown>;
}
