"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiKey } from "@/lib/auth";
import SidebarLayout from "@/components/SidebarLayout";
import { fetchAllModels, generate, apiFetch, ModelFull, ApiError } from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", google: "Google", xai: "xAI",
  qwen: "Qwen", elevenlabs: "ElevenLabs", stability: "Stability AI",
  fal: "Fal.ai", kling: "Kling", luma: "Luma", hailuo: "Hailuo",
  wan: "Wan", bytedance: "ByteDance", runway: "Runway",
  midjourney: "Midjourney", suno: "Suno", veed: "Veed", topaz: "Topaz", kie: "Kie",
};

const MODALITY_THEME: Record<string, { stripe: string; badge: string; text: string; dot: string; faint: string }> = {
  text:  { stripe: "bg-violet-600",  badge: "bg-violet-500/10 text-violet-400 border-violet-500/20",  text: "text-violet-400",  dot: "bg-violet-500",  faint: "bg-violet-500/5" },
  image: { stripe: "bg-pink-600",    badge: "bg-pink-500/10 text-pink-400 border-pink-500/20",        text: "text-pink-400",    dot: "bg-pink-500",    faint: "bg-pink-500/5" },
  video: { stripe: "bg-orange-500",  badge: "bg-orange-500/10 text-orange-400 border-orange-500/20",  text: "text-orange-400",  dot: "bg-orange-500",  faint: "bg-orange-500/5" },
  audio: { stripe: "bg-emerald-600", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-500", faint: "bg-emerald-500/5" },
};

const TASK_CATEGORIES = [
  { label: "Video",   tasks: ["text_to_video","image_to_video","video_to_video","video_editing","speech_to_video","lip_sync"] },
  { label: "Image",   tasks: ["text_to_image","image_to_image","image_editing"] },
  { label: "Audio",   tasks: ["text_to_speech","speech_to_text","text_to_music","audio_to_audio"] },
  { label: "Chat",    tasks: ["chat","summarization","translation"] },
];

const ALL_TASKS = [
  { id: "text_to_video",   label: "Text → Video" },
  { id: "image_to_video",  label: "Image → Video" },
  { id: "video_to_video",  label: "Video → Video" },
  { id: "video_editing",   label: "Video Editing" },
  { id: "speech_to_video", label: "Speech → Video" },
  { id: "lip_sync",        label: "Lip Sync" },
  { id: "text_to_image",   label: "Text → Image" },
  { id: "image_to_image",  label: "Image → Image" },
  { id: "image_editing",   label: "Image Editing" },
  { id: "text_to_speech",  label: "Text to Speech" },
  { id: "speech_to_text",  label: "Speech to Text" },
  { id: "text_to_music",   label: "Text to Music" },
  { id: "audio_to_audio",  label: "Audio → Audio" },
  { id: "chat",            label: "Chat" },
  { id: "summarization",   label: "Summarization" },
  { id: "translation",     label: "Translation" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderStat { provider: string; total_requests: number; success_count: number; error_rate: number; avg_latency_ms: number | null; uptime_pct: number; }
interface LeaderboardEntry { model_id: string; display_name: string; provider: string; modality: string; cost_per_unit: number; unit_type: string; avg_latency_ms: number | null; quality_score: number | null; rating_count: number; avg_rating: number | null; thumbs_up: number; thumbs_down: number; }
interface CompareSlot { modelId: string; provider: string; result: string | null; url: string | null; latency: number | null; credits: number | null; error: string | null; loading: boolean; }
type ActiveTab = "browse" | "compare" | "status";

// ── Helpers ───────────────────────────────────────────────────────────────────

const _MODALITY_TASK: Record<string, string> = { text: "chat", image: "text_to_image", video: "text_to_video", audio: "text_to_speech" };

function effectiveTaskTypes(m: ModelFull): string[] {
  if (m.task_types?.length) return m.task_types;
  const fb = m.task_type ?? _MODALITY_TASK[m.modality];
  return fb ? [fb] : [];
}

function taskLabel(t: string) { return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function providerLabel(p: string) { return PROVIDER_LABELS[p] ?? p; }
function fmtMs(ms: number | null) { if (!ms) return "—"; return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`; }
const emptySlot = (): CompareSlot => ({ modelId: "", provider: "", result: null, url: null, latency: null, credits: null, error: null, loading: false });

function fmtCost(m: ModelFull): string {
  const units: Record<string, string> = {
    token: "cr / 1k tok", image: "cr / img", second: "cr / sec",
    minute: "cr / min", character: "cr / 1k chr", word: "cr / 1k wrd",
  };
  return `${m.cost_per_unit} ${units[m.unit_type] ?? `cr / ${m.unit_type}`}`;
}

function getModelDescription(m: ModelFull): string {
  const n = m.model_id.toLowerCase();
  if (n.includes("gpt-4o-mini")) return "Affordable, fast GPT-4o variant — good for simple tasks";
  if (n.includes("gpt-4o")) return "OpenAI's flagship multimodal model — fast and capable";
  if (n.includes("o1") || n.includes("o3")) return "OpenAI's advanced reasoning model for complex problems";
  if (n.includes("gpt-4")) return "OpenAI's highly capable reasoning and instruction model";
  if (n.includes("gpt-3.5")) return "Fast, cost-effective chat model from OpenAI";
  if (n.includes("claude") && n.includes("opus")) return "Anthropic's most capable model — nuanced and thorough";
  if (n.includes("claude") && n.includes("sonnet")) return "Best balance of speed and intelligence from Anthropic";
  if (n.includes("claude") && n.includes("haiku")) return "Anthropic's fastest and most compact model";
  if (n.includes("claude")) return "Thoughtful, accurate responses from Anthropic";
  if (n.includes("gemini") && n.includes("ultra")) return "Google's most powerful multimodal model";
  if (n.includes("gemini") && n.includes("pro")) return "Google's capable model with very large context window";
  if (n.includes("gemini") && n.includes("flash")) return "Google's fastest model for high-throughput tasks";
  if (n.includes("gemini")) return "Google's multimodal reasoning and generation model";
  if (n.includes("grok")) return "xAI's model with real-time knowledge and sharp reasoning";
  if (n.includes("qwen")) return "Alibaba's open multilingual chat and analysis model";
  if (n.includes("flux") && n.includes("schnell")) return "Fastest FLUX variant — great for quick iteration";
  if (n.includes("flux") && n.includes("pro")) return "FLUX Pro — state-of-the-art image quality and detail";
  if (n.includes("flux") && n.includes("dev")) return "High-quality FLUX model with detailed prompt following";
  if (n.includes("flux")) return "Fast, high-quality open image generation";
  if (n.includes("stable-diffusion") || n.includes("sdxl")) return "Open-source image generation with fine-grained control";
  if (n.includes("ideogram")) return "Excellent at placing readable text inside generated images";
  if (n.includes("recraft")) return "Vector-quality creative and design-focused image generation";
  if (n.includes("kling")) return "Cinematic-quality video generation from text or image";
  if (n.includes("wan")) return "Consistent motion video generation with fine control";
  if (n.includes("runway")) return "Creative AI video generation — motion brush and editing";
  if (n.includes("luma")) return "Photorealistic video generation with smooth, natural motion";
  if (n.includes("hailuo")) return "Fast video generation with coherent natural motion";
  if (n.includes("sora")) return "OpenAI's high-fidelity video generation model";
  if (m.provider === "elevenlabs" || n.includes("eleven")) return "Ultra-realistic voice synthesis in many languages";
  if (n.includes("suno")) return "Generate full songs with vocals from a simple text prompt";
  const defaults: Record<string, string> = {
    text: `${providerLabel(m.provider)} language model for chat and reasoning`,
    image: `${providerLabel(m.provider)} image generation model`,
    video: `${providerLabel(m.provider)} video generation model`,
    audio: `${providerLabel(m.provider)} audio synthesis model`,
  };
  return defaults[m.modality] ?? `AI model by ${providerLabel(m.provider)}`;
}

function getModelStrengths(m: ModelFull): string[] {
  const n = m.model_id.toLowerCase();
  if (n.includes("gpt-4o") && !n.includes("mini")) return ["Strong at multimodal understanding", "Fast response with low latency", "Code, math, and structured output"];
  if (n.includes("gpt-4")) return ["Complex multi-step reasoning", "Code generation and debugging", "Following nuanced instructions"];
  if (n.includes("gpt-3.5")) return ["Very fast responses", "Lowest cost in GPT family", "Good for simple chat and Q&A"];
  if (n.includes("claude") && n.includes("opus")) return ["Nuanced long-form writing", "Deep analysis and research tasks", "Handling very complex instructions"];
  if (n.includes("claude") && n.includes("sonnet")) return ["Balanced speed and intelligence", "Code, technical writing, analysis", "Thoughtful and careful responses"];
  if (n.includes("claude") && n.includes("haiku")) return ["Extremely fast inference", "Lowest cost in Claude family", "Simple tasks and classification"];
  if (n.includes("gemini") && n.includes("pro")) return ["Massive 1M+ token context", "Strong multimodal reasoning", "Document and code understanding"];
  if (n.includes("gemini") && n.includes("flash")) return ["Very high throughput", "Cost-effective at scale", "Good general-purpose tasks"];
  if (n.includes("flux")) return ["High prompt adherence", "Wide artistic style range", "Detailed, coherent compositions"];
  if (n.includes("stable-diffusion") || n.includes("sdxl")) return ["Fine-grained style control", "Large community of fine-tunes", "Open-source flexibility"];
  if (n.includes("kling")) return ["Cinematic motion quality", "Long clip duration support", "Realistic camera movement"];
  if (n.includes("runway")) return ["Creative and expressive output", "Motion brush control", "Professional video quality"];
  if (m.provider === "elevenlabs") return ["Extremely natural-sounding voice", "Voice cloning from short clips", "Wide multi-language support"];
  const fallbacks: Record<string, string[]> = {
    text:  ["Natural conversation", "Instruction following", "Knowledge-based Q&A"],
    image: ["High visual quality", "Prompt-faithful generation", "Diverse artistic styles"],
    video: ["Coherent motion generation", "High output resolution", "Creative scene composition"],
    audio: ["Natural-sounding synthesis", "Multiple voice styles", "Clear pronunciation"],
  };
  return fallbacks[m.modality] ?? ["General AI capabilities"];
}

function getModelWeaknesses(m: ModelFull): string[] {
  const n = m.model_id.toLowerCase();
  if (n.includes("gpt-4o-mini") || n.includes("gpt-3.5")) return ["Less capable than larger models", "May miss subtle reasoning steps"];
  if (n.includes("gpt-4")) return ["Higher cost per token", "Knowledge has a training cutoff"];
  if (n.includes("claude") && n.includes("haiku")) return ["Less capable for complex tasks", "Limited depth on hard problems"];
  if (n.includes("claude") && n.includes("opus")) return ["Slower than Sonnet", "Highest cost in Claude family"];
  if (n.includes("gemini") && n.includes("flash")) return ["Less capable than Pro variant", "May miss subtle nuances"];
  if (n.includes("flux") && n.includes("schnell")) return ["Lower quality vs Pro", "Less detail in complex scenes"];
  if (n.includes("stable-diffusion")) return ["Inconsistent hands and faces", "Needs prompt engineering for best results"];
  if (n.includes("kling") || n.includes("runway") || n.includes("luma")) return ["Slow generation (1–3 min)", "High credit cost per clip"];
  if (m.provider === "elevenlabs") return ["Higher cost per character", "Latency scales with text length"];
  const fallbacks: Record<string, string[]> = {
    text:  ["May hallucinate facts", "Training knowledge cutoff"],
    image: ["Struggles with text in images", "Inconsistent with multiple faces"],
    video: ["High cost per generation", "Limited video duration"],
    audio: ["May mispronounce rare words", "Limited language support on some models"],
  };
  return fallbacks[m.modality] ?? ["Standard AI limitations apply"];
}

// ── Hero Carousel ─────────────────────────────────────────────────────────────

function HeroCarousel({ models, onSelect }: { models: ModelFull[]; onSelect: (m: ModelFull) => void }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const router = useRouter();

  const featured = models.filter(m => m.is_active).slice(0, 5);
  if (!featured.length) return null;

  useEffect(() => {
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % featured.length), 4000);
    return () => clearInterval(timerRef.current);
  }, [featured.length]);

  const m = featured[idx];
  const theme = MODALITY_THEME[m.modality] ?? MODALITY_THEME.text;

  return (
    <div className="relative h-[180px] rounded-lg overflow-hidden bg-surface border border-border mb-6">
      {/* Left modality stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${theme.stripe}`} />

      {/* Content */}
      <div className="pl-6 pr-6 h-full flex flex-col justify-between py-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
            <span className="text-xs text-muted font-medium">{providerLabel(m.provider)}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${theme.badge} capitalize ml-1`}>{m.modality}</span>
          </div>
          <h2 className="text-xl font-bold text-primary leading-snug mb-1">{m.display_name}</h2>
          <p className="text-sm text-muted">{getModelDescription(m)}</p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/generate?model=${encodeURIComponent(m.model_id)}&modality=${m.modality}&mode=manual`)}
              className="px-4 py-1.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-white/90 transition-colors"
            >
              Use model →
            </button>
            <button
              onClick={() => onSelect(m)}
              className="px-4 py-1.5 bg-hover border border-border-2 text-[#aaa] text-xs rounded-lg hover:text-primary hover:border-[#444] transition-colors"
            >
              Details
            </button>
          </div>
          <div className="flex gap-1.5">
            {featured.map((_, i) => (
              <button
                key={i}
                onClick={() => { setIdx(i); clearInterval(timerRef.current); }}
                className={`h-1 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1 bg-[#333]"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Model Card ────────────────────────────────────────────────────────────────

function ModelCard({ m, onSelect }: { m: ModelFull; onSelect: (m: ModelFull) => void }) {
  const router = useRouter();
  const theme = MODALITY_THEME[m.modality] ?? MODALITY_THEME.text;
  const tasks = effectiveTaskTypes(m).slice(0, 2);

  return (
    <div
      onClick={() => onSelect(m)}
      className="group relative bg-surface border border-border rounded-lg overflow-hidden cursor-pointer hover:border-border-2 hover:bg-hover transition-all duration-150 flex flex-col font-inter"
    >
      {/* Left accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${theme.stripe}`} />

      {/* Card body */}
      <div className="pl-4 pr-3.5 pt-3.5 pb-3 flex flex-col flex-1">
        {/* Name — wraps naturally, no truncation */}
        <h3 className="text-[13px] font-semibold text-primary leading-snug mb-1.5 break-words">
          {m.display_name}
        </h3>

        {/* Provider */}
        <div className="flex items-center gap-1.5 mb-3">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.dot}`} />
          <span className="text-xs text-secondary">{providerLabel(m.provider)}</span>
          {!m.is_active && <span className="text-[10px] text-faint ml-auto">Inactive</span>}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {tasks.map((t) => (
            <span
              key={t}
              className={`text-[10px] px-1.5 py-0.5 rounded-md border ${theme.badge}`}
            >
              {taskLabel(t)}
            </span>
          ))}
        </div>

        {/* Price */}
        <p className="text-[11px] text-muted font-mono mt-auto">{fmtCost(m)}</p>

        {/* Description — reveals on hover */}
        <div className="overflow-hidden max-h-0 group-hover:max-h-10 transition-all duration-200 ease-in-out">
          <p className="text-[11px] text-muted mt-2 leading-snug line-clamp-2">
            {getModelDescription(m)}
          </p>
        </div>
      </div>

      {/* Use model button — appears on hover */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 px-3.5 pb-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/generate?model=${encodeURIComponent(m.model_id)}&modality=${m.modality}&mode=manual`);
          }}
          className="w-full py-1.5 bg-hover border border-border-2 hover:border-[#3a3a3a] hover:bg-[#252525] text-primary text-[11px] font-medium rounded-lg transition-colors"
        >
          Use model →
        </button>
      </div>
    </div>
  );
}

// ── Model Drawer ──────────────────────────────────────────────────────────────

function ModelDrawer({ m, onClose }: { m: ModelFull; onClose: () => void }) {
  const router = useRouter();
  const theme = MODALITY_THEME[m.modality] ?? MODALITY_THEME.text;
  const tasks = effectiveTaskTypes(m);
  const desc = getModelDescription(m);
  const strengths = getModelStrengths(m);
  const weaknesses = getModelWeaknesses(m);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[360px] bg-surface border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${theme.dot}`} />
            <span className="text-xs text-muted">{providerLabel(m.provider)}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${theme.badge} capitalize ml-1`}>{m.modality}</span>
          </div>
          <button onClick={onClose} className="text-[#444] hover:text-primary transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Modality stripe */}
          <div className={`h-[3px] w-full ${theme.stripe}`} />

          <div className="px-5 py-5 space-y-6">
            {/* Name */}
            <div>
              <h2 className="text-base font-bold text-primary leading-snug break-words">{m.display_name}</h2>
              <p className="text-xs text-muted mt-1 font-mono">{m.model_id}</p>
            </div>

            {/* Description */}
            <p className="text-sm text-muted leading-relaxed">{desc}</p>

            {/* Capabilities */}
            <div>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2.5">Capabilities</p>
              <div className="flex flex-wrap gap-1.5">
                {tasks.map((t) => (
                  <span key={t} className={`text-xs px-2.5 py-1 rounded-lg border ${theme.badge}`}>
                    {taskLabel(t)}
                  </span>
                ))}
              </div>
            </div>

            {/* Good for */}
            <div>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2.5">Good for</p>
              <ul className="space-y-2">
                {strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted">
                    <span className="text-emerald-500 shrink-0 mt-px text-xs">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            {/* Limitations */}
            <div>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2.5">Limitations</p>
              <ul className="space-y-2">
                {weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted">
                    <span className="text-[#333] shrink-0 mt-px">—</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>

            {/* Specs */}
            <div>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2.5">Specs</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-surface-2 border border-[#1e1e1e] rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-secondary mb-1 uppercase tracking-wide">Cost</p>
                  <p className="text-sm font-mono text-primary">{fmtCost(m)}</p>
                </div>
                <div className="bg-surface-2 border border-[#1e1e1e] rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-secondary mb-1 uppercase tracking-wide">Latency</p>
                  <p className="text-sm font-mono text-primary">{fmtMs(m.avg_latency_ms)}</p>
                </div>
                {m.quality_score != null && (
                  <div className="bg-surface-2 border border-[#1e1e1e] rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-secondary mb-1 uppercase tracking-wide">Quality</p>
                    <p className="text-sm font-mono text-primary">{(m.quality_score * 100).toFixed(0)}%</p>
                  </div>
                )}
                <div className="bg-surface-2 border border-[#1e1e1e] rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-secondary mb-1 uppercase tracking-wide">Status</p>
                  <p className={`text-sm font-mono ${m.is_active ? "text-emerald-400" : "text-faint"}`}>
                    {m.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 shrink-0">
          <button
            onClick={() => router.push(`/generate?model=${encodeURIComponent(m.model_id)}&modality=${m.modality}&mode=manual`)}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-primary text-sm font-semibold rounded-lg transition-colors"
          >
            Use model →
          </button>
        </div>
      </div>
    </>
  );
}

// ── Filter Sidebar ────────────────────────────────────────────────────────────

function FilterPanel({
  allProviders, selectedTasks, selectedProviders, onToggleTask, onToggleProvider, onClearAll,
}: {
  allProviders: string[]; selectedTasks: Set<string>; selectedProviders: Set<string>;
  onToggleTask: (id: string) => void; onToggleProvider: (id: string) => void; onClearAll: () => void;
}) {
  const [filterTab, setFilterTab] = useState<"tasks" | "providers">("tasks");
  const total = selectedTasks.size + selectedProviders.size;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden sticky top-4">
      <div className="flex border-b border-border">
        {(["tasks", "providers"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors capitalize ${
              filterTab === t ? "text-primary border-b-2 border-violet-500 bg-violet-500/5" : "text-[#555] hover:text-[#888]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-3 max-h-[calc(100vh-280px)] overflow-y-auto space-y-4">
        {filterTab === "tasks" && TASK_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">{cat.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {cat.tasks.map((id) => {
                const task = ALL_TASKS.find((t) => t.id === id);
                if (!task) return null;
                const active = selectedTasks.has(id);
                return (
                  <button
                    key={id}
                    onClick={() => onToggleTask(id)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                      active ? "bg-violet-500 text-primary border-violet-500" : "bg-surface-2 text-muted border-[#222] hover:border-[#333] hover:text-secondary"
                    }`}
                  >
                    {task.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {filterTab === "providers" && (
          <div className="flex flex-wrap gap-1.5">
            {allProviders.map((p) => {
              const active = selectedProviders.has(p);
              const theme = MODALITY_THEME.text;
              return (
                <button
                  key={p}
                  onClick={() => onToggleProvider(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
                    active ? "bg-violet-500 text-primary border-violet-500" : "bg-surface-2 text-muted border-[#222] hover:border-[#333] hover:text-secondary"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : theme.dot}`} />
                  {providerLabel(p)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="border-t border-border px-3 py-2">
          <button onClick={onClearAll} className="text-xs text-violet-400 hover:text-violet-300">
            Clear all ({total})
          </button>
        </div>
      )}
    </div>
  );
}

// ── Status Tab ────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = { good: "bg-emerald-500", degraded: "bg-yellow-400", down: "bg-red-500" };
function uptimeStatus(pct: number) { return pct >= 98 ? "good" : pct >= 90 ? "degraded" : "down"; }

type SortCol = "rating" | "latency" | "cost" | "provider";

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol | null; sortDir: "asc" | "desc" }) {
  if (sortCol !== col) return <span className="text-faint ml-0.5">↕</span>;
  return <span className="text-violet-400 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

function latencyColor(ms: number | null) {
  if (!ms) return "text-muted";
  if (ms < 1000) return "text-emerald-500";
  if (ms < 3000) return "text-yellow-500";
  return "text-red-400";
}

function StatusTab({ models, onSelectModel }: { models: ModelFull[]; onSelectModel: (m: ModelFull) => void }) {
  const [providers, setProviders] = useState<ProviderStat[]>([]);
  const [lb, setLb] = useState<LeaderboardEntry[]>([]);
  const [mod, setMod] = useState("all");
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    Promise.all([
      apiFetch<{ providers: ProviderStat[] }>("/api/v1/leaderboard/providers"),
      apiFetch<{ leaderboard: LeaderboardEntry[] }>("/api/v1/leaderboard"),
    ]).then(([p, l]) => { setProviders(p.providers); setLb(l.leaderboard); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  function handleRowClick(e: LeaderboardEntry) {
    const m = models.find((m) => m.model_id === e.model_id);
    if (m) onSelectModel(m);
  }

  const filtered = mod === "all" ? lb : lb.filter((e) => e.modality === mod);

  const sorted = sortCol ? [...filtered].sort((a, b) => {
    if (sortCol === "provider") return sortDir === "asc" ? a.provider.localeCompare(b.provider) : b.provider.localeCompare(a.provider);
    const av = sortCol === "rating" ? (a.avg_rating ?? (a.quality_score != null ? a.quality_score * 5 : 0)) : sortCol === "latency" ? (a.avg_latency_ms ?? Infinity) : a.cost_per_unit;
    const bv = sortCol === "rating" ? (b.avg_rating ?? (b.quality_score != null ? b.quality_score * 5 : 0)) : sortCol === "latency" ? (b.avg_latency_ms ?? Infinity) : b.cost_per_unit;
    return sortDir === "asc" ? av - bv : bv - av;
  }) : filtered;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4">Provider Health (24h)</h2>
        {loading ? <p className="text-sm text-muted">Loading…</p> : providers.length === 0 ? (
          <p className="text-sm text-muted">No telemetry yet — run some generations first.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {providers.map((p) => {
              const st = uptimeStatus(p.uptime_pct);
              return (
                <div key={p.provider} className="bg-surface-2 border border-border rounded-xl p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-2 h-2 rounded-full ${STATUS_DOT[st]}`} />
                    <span className="text-sm font-semibold text-primary capitalize">{providerLabel(p.provider)}</span>
                  </div>
                  <p className="text-xs text-muted">{p.uptime_pct.toFixed(1)}% uptime</p>
                  <p className="text-xs text-secondary">{p.avg_latency_ms ? `${p.avg_latency_ms}ms avg` : "—"}</p>
                  <p className="text-xs text-secondary">{p.total_requests} req · {(p.error_rate * 100).toFixed(1)}% err</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-secondary uppercase tracking-widest">Model Leaderboard</h2>
          <select value={mod} onChange={(e) => setMod(e.target.value)} className="text-xs border border-border-2 rounded-lg px-2.5 py-1.5 bg-surface-2 text-muted focus:outline-none focus:border-violet-500">
            {["all", "text", "image", "video", "audio"].map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-secondary uppercase tracking-widest">
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Model</th>
                <th className="px-4 py-3 text-left font-medium cursor-pointer select-none hover:text-primary transition-colors" onClick={() => toggleSort("provider")}>
                  Provider <SortIcon col="provider" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th className="px-4 py-3 text-right font-medium cursor-pointer select-none hover:text-primary transition-colors" onClick={() => toggleSort("rating")}>
                  Rating <SortIcon col="rating" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th className="px-4 py-3 text-right font-medium cursor-pointer select-none hover:text-primary transition-colors" onClick={() => toggleSort("latency")}>
                  Latency <SortIcon col="latency" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th className="px-4 py-3 text-right font-medium cursor-pointer select-none hover:text-primary transition-colors" onClick={() => toggleSort("cost")}>
                  Cost <SortIcon col="cost" sortCol={sortCol} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {sorted.map((e, i) => (
                <tr key={e.model_id} onClick={() => handleRowClick(e)} className="hover:bg-surface-2 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-faint">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-primary">{e.display_name}</td>
                  <td className="px-4 py-3 text-muted capitalize">{providerLabel(e.provider)}</td>
                  <td className="px-4 py-3 text-right">
                    {e.avg_rating ? (
                      <div className="flex flex-col items-end">
                        <span className="text-violet-400 font-medium">{e.avg_rating.toFixed(1)}</span>
                        <span className="text-[10px] text-faint lowercase">{e.rating_count} ratings</span>
                      </div>
                    ) : e.quality_score != null ? (
                      <div className="flex flex-col items-end">
                        <span className="text-secondary font-medium">{(e.quality_score * 5).toFixed(1)}</span>
                        <span className="text-[10px] text-faint lowercase">bench</span>
                      </div>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${latencyColor(e.avg_latency_ms)}`}>
                    {fmtMs(e.avg_latency_ms)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">{e.cost_per_unit}cr/{e.unit_type}</td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-faint">No models for selected modality.</td></tr>}
            </tbody>
          </table>
          {sorted.length > 0 && (
            <p className="px-4 py-2 text-[10px] text-faint border-t border-border">Click any row to view model details · Click column headers to sort</p>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Compare Tab ───────────────────────────────────────────────────────────────

function CompareTab({ models }: { models: ModelFull[] }) {
  const [prompt, setPrompt] = useState("");
  const [modality, setModality] = useState<"text" | "image" | "video" | "audio">("text");
  const [slots, setSlots] = useState<CompareSlot[]>([emptySlot(), emptySlot()]);
  const [running, setRunning] = useState(false);

  function setSlotModel(idx: number, modelId: string) {
    const m = models.find((m) => m.model_id === modelId);
    setSlots((prev) => prev.map((s, i) => i === idx ? { ...s, modelId, provider: m?.provider ?? "" } : s));
  }

  async function run() {
    if (!prompt.trim()) return;
    setRunning(true);
    setSlots((prev) => prev.map((s) => ({ ...s, result: null, url: null, error: null, loading: !!s.modelId })));
    await Promise.all(slots.map(async (slot, idx) => {
      if (!slot.modelId) return;
      try {
        const res = await generate({ modality, mode: "manual", prompt, model: slot.modelId });
        setSlots((prev) => prev.map((s, i) => i !== idx ? s : { ...s, loading: false, result: res.output.content ?? null, url: res.output.url ?? null, latency: res.meta.latency_ms, credits: res.meta.credits_used, error: null }));
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Generation failed";
        setSlots((prev) => prev.map((s, i) => i !== idx ? s : { ...s, loading: false, error: msg }));
      }
    }));
    setRunning(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-start">
        <select value={modality} onChange={(e) => setModality(e.target.value as typeof modality)} className="bg-surface-2 border border-border-2 text-primary text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500">
          <option value="text">Text</option><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option>
        </select>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Enter prompt…" rows={2}
          className="flex-1 min-w-64 bg-surface-2 border border-border-2 text-primary text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-violet-500 placeholder-[#444]" />
        <button onClick={run} disabled={running || !prompt.trim() || slots.every((s) => !s.modelId)}
          className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-primary text-sm font-medium rounded-lg whitespace-nowrap self-start transition-colors">
          {running ? "Running…" : "Run"}
        </button>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
        {slots.map((slot, idx) => (
          <div key={idx} className="bg-surface-2 border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface">
              <select value={slot.modelId} onChange={(e) => setSlotModel(idx, e.target.value)} className="flex-1 text-xs bg-surface-2 border border-border-2 text-primary rounded-lg px-2 py-1.5 focus:outline-none">
                <option value="">— choose model —</option>
                {models.filter((m) => m.modality === modality).map((m) => <option key={m.model_id} value={m.model_id}>{m.display_name} ({m.provider})</option>)}
              </select>
              {slots.length > 2 && <button onClick={() => setSlots((p) => p.filter((_, i) => i !== idx))} className="text-[#444] hover:text-red-400 text-xs">✕</button>}
            </div>
            <div className="flex-1 p-3 min-h-40">
              {slot.loading && <p className="text-xs text-muted animate-pulse">Generating…</p>}
              {slot.error && <p className="text-xs text-red-400">{slot.error}</p>}
              {slot.result && !slot.loading && <p className="text-sm text-secondary whitespace-pre-wrap">{slot.result}</p>}
              {slot.url && !slot.loading && (modality === "image" ? <img src={slot.url} alt="" className="max-w-full rounded" /> : <video src={slot.url} controls className="max-w-full rounded" />)}
              {!slot.modelId && !slot.loading && !slot.result && <p className="text-xs text-faint text-center pt-8">Select a model above</p>}
            </div>
            {(slot.latency != null || slot.credits != null) && (
              <div className="px-3 py-2 border-t border-border flex gap-3 text-xs text-muted">
                {slot.latency != null && <span>{slot.latency >= 1000 ? `${(slot.latency / 1000).toFixed(1)}s` : `${slot.latency}ms`}</span>}
                {slot.credits != null && <span>{slot.credits} cr</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {slots.length < 4 && (
        <button onClick={() => setSlots((p) => [...p, emptySlot()])} className="text-xs px-3 py-1.5 border border-dashed border-[#222] rounded-lg text-muted hover:border-[#333] hover:text-secondary transition-colors">
          + Add model
        </button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ModelsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: ActiveTab = (["browse", "compare", "status"] as ActiveTab[]).includes(tabParam as ActiveTab) ? (tabParam as ActiveTab) : "browse";

  const [models, setModels] = useState<ModelFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [drawerModel, setDrawerModel] = useState<ModelFull | null>(null);

  useEffect(() => {
    if (!getApiKey()) { router.replace("/login"); return; }
    fetchAllModels()
      .then((m) => { setModels(m); setLoading(false); })
      .catch((err) => { if (err instanceof ApiError && err.status === 401) router.replace("/login"); else setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTab(t: ActiveTab) { router.replace(`/models?tab=${t}`); }

  const allProviders = [...new Set(models.map((m) => m.provider))].sort();

  const visible = models.filter((m) => {
    if (selectedTasks.size > 0 && !effectiveTaskTypes(m).some((t) => selectedTasks.has(t))) return false;
    if (selectedProviders.size > 0 && !selectedProviders.has(m.provider)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!m.display_name.toLowerCase().includes(q) && !m.provider.toLowerCase().includes(q) && !m.model_id.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function toggleTask(id: string) { setSelectedTasks((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleProvider(id: string) { setSelectedProviders((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  return (
    <SidebarLayout>
      <div className="p-6">
        {/* Tab bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1 bg-surface border border-border rounded-xl p-1">
            {([
              { id: "browse",  label: "Marketplace" },
              { id: "compare", label: "Compare" },
              { id: "status",  label: "Status" },
            ] as { id: ActiveTab; label: string }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              tab === t.id ? "bg-hover text-primary shadow-sm" : "text-muted hover:text-secondary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "browse" && (
            <span className="text-xs text-muted">
              <span className="text-violet-400 font-semibold">{visible.length}</span> models
            </span>
          )}
        </div>

        {tab === "status" && <StatusTab models={models} onSelectModel={setDrawerModel} />}
        {tab === "compare" && <CompareTab models={models} />}

        {tab === "browse" && (
          <div className="flex gap-5">
            {/* Filter sidebar */}
            <div className="w-48 shrink-0">
              {!loading && (
                <FilterPanel
                  allProviders={allProviders}
                  selectedTasks={selectedTasks}
                  selectedProviders={selectedProviders}
                  onToggleTask={toggleTask}
                  onToggleProvider={toggleProvider}
                  onClearAll={() => { setSelectedTasks(new Set()); setSelectedProviders(new Set()); }}
                />
              )}
            </div>

            {/* Main area */}
            <div className="flex-1 min-w-0">
              {!loading && models.length > 0 && (
                <HeroCarousel models={models} onSelect={setDrawerModel} />
              )}

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-primary">All Models</h2>
                <input
                  type="text"
                  placeholder="Search models…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-52 bg-surface-2 border border-border-2 text-primary text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-500 placeholder-[#444]"
                />
              </div>

              {loading ? (
                <div className="flex items-center gap-3 text-sm text-muted py-12">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading models…
                </div>
              ) : visible.length === 0 ? (
                <p className="text-sm text-muted py-12 text-center">No models match the current filters.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 items-start">
                  {visible.map((m) => (
                    <ModelCard key={`${m.provider}-${m.model_id}`} m={m} onSelect={setDrawerModel} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {drawerModel && (
        <ModelDrawer m={drawerModel} onClose={() => setDrawerModel(null)} />
      )}
    </SidebarLayout>
  );
}

export default function ModelsPage() {
  return (
    <Suspense fallback={null}>
      <ModelsContent />
    </Suspense>
  );
}
