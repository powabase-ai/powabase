// Shared, provider-agnostic copy for the "Model" field info tooltip.
// Used by both Agent overview and Orchestration settings to keep the
// guidance consistent and avoid OpenAI-only framing.

interface ModelTier {
  label: string
  /** Plain-English description of when to reach for this tier. */
  pitch: string
  /** Representative models per provider. Picked as commonly-recognized
   *  proxies for the tier — the exact list available to a project depends
   *  on which provider keys are configured. Order: commercial first,
   *  open source second. */
  examples: string[]
}

const TIERS: ModelTier[] = [
  {
    label: "Flagship",
    pitch: "Best reasoning, longest context, slowest, most expensive. Reach for it on hard multi-step problems, ambiguous user requests, or tasks where wrong answers are costly to recover from.",
    examples: [
      "OpenAI: gpt-5, gpt-5-pro",
      "Anthropic: Claude Opus 4.x",
      "Google: Gemini 2.5 Pro",
      "Open source: Llama 3.1 405B, Qwen 2.5 72B, DeepSeek V3",
    ],
  },
  {
    label: "Balanced",
    pitch: "The default workhorse for most agents. Good reasoning, broad tool-use ability, low-to-moderate cost. Start here unless you have a specific reason not to.",
    examples: [
      "OpenAI: gpt-4o, gpt-4.1",
      "Anthropic: Claude Sonnet 4.x, Claude 3.7 Sonnet",
      "Google: Gemini 2.5 Flash",
      "Open source: Llama 3.3 70B, Mistral Large, Qwen 2.5 32B",
    ],
  },
  {
    label: "Fast",
    pitch: "Optimized for latency and cost. Good for high-throughput pipelines, simple classification or extraction, and tools-light agent loops. Trade some reasoning depth for sub-second responses.",
    examples: [
      "OpenAI: gpt-5-mini, gpt-4o-mini",
      "Anthropic: Claude Haiku 4.x",
      "Google: Gemini 2.0 Flash",
      "Open source: Llama 3.1 8B, Mistral Nemo, Qwen 2.5 7B, Phi-4",
    ],
  },
  {
    label: "Reasoning",
    pitch: "Models that allocate explicit chain-of-thought tokens before answering. Best for math, coding, multi-step planning, and tasks where the answer needs to be justified. Slower per call and burn more output tokens (the reasoning is billed as output).",
    examples: [
      "OpenAI: o1, o3, o4-mini, gpt-5 reasoning variants",
      "Anthropic: Claude 3.7 / 4.x with extended thinking enabled",
      "Google: Gemini 2.5 (thinking on)",
      "Open source: DeepSeek R1, QwQ-32B, Llama 3.3 70B Reasoning",
    ],
  },
]

export function ModelSelectionInfoBody() {
  return (
    <>
      <p>
        The model determines the quality, speed, and cost of every agent
        interaction. The platform routes every call through{" "}
        <a
          href="https://docs.litellm.ai/"
          target="_blank"
          rel="noreferrer"
          className="text-brand hover:underline"
        >
          LiteLLM
        </a>
        , so you can mix providers (OpenAI, Anthropic, Google, AWS Bedrock,
        Vertex, DeepSeek, Mistral, Together, Fireworks, Groq, Ollama for
        local) without changing agent code.
      </p>

      <div className="space-y-3">
        {TIERS.map((t) => (
          <div key={t.label}>
            <p className="text-foreground font-medium mb-1">{t.label}</p>
            <p className="text-foreground-muted">{t.pitch}</p>
            <p className="text-xs text-foreground-muted mt-1">
              <span className="text-foreground-light">Examples: </span>
              {t.examples.map((e, i) => (
                <span key={e}>
                  {e}
                  {i < t.examples.length - 1 ? "; " : ""}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-default pt-3 space-y-2">
        <p className="text-foreground font-medium">Picking one</p>
        <ul className="space-y-1 list-disc list-inside text-foreground-muted">
          <li>
            Default to a <strong>balanced</strong> model. Move up to flagship
            only when you see the agent failing on tasks the balanced tier
            can't reliably handle.
          </li>
          <li>
            Use a <strong>reasoning</strong> model when correctness matters
            more than latency — math, code generation, planning over many
            tool calls, or anything where the agent needs to back up its
            answer.
          </li>
          <li>
            Use <strong>fast</strong> for high-volume pipelines, lightweight
            extraction, or any path where a 2× speedup is worth a small
            quality drop.
          </li>
          <li>
            <strong>Open source</strong> is competitive at the balanced and
            fast tiers and often cheaper — especially for self-hosted
            deployments. The reasoning category has caught up with DeepSeek
            R1 and QwQ.
          </li>
        </ul>
      </div>

      <div className="border-t border-default pt-3 space-y-2">
        <p className="text-foreground font-medium">Tradeoffs to keep in mind</p>
        <ul className="space-y-1 list-disc list-inside text-foreground-muted">
          <li>
            <strong>Cost scales with both input and output.</strong> Long
            tool-use loops compound — each step's output becomes the next
            step's input. A flagship model running 20 steps can cost
            10–20× the same task on a balanced model.
          </li>
          <li>
            <strong>Reasoning models bill the &ldquo;thinking&rdquo; tokens as output.</strong>{" "}
            A run that produces a 200-token reply may have generated
            5,000 reasoning tokens you'll see on your bill but never in
            the response.
          </li>
          <li>
            <strong>Tool support varies.</strong> Some smaller / older
            open-source models don&rsquo;t reliably emit JSON tool calls. If
            your agent depends on tools, prefer flagship or balanced models
            with strong function-calling track records.
          </li>
          <li>
            <strong>Set a fallback.</strong> Configure a fallback model in the{" "}
            <strong>Settings</strong> tab so the agent recovers automatically
            from rate-limit or upstream outage errors.
          </li>
        </ul>
      </div>
    </>
  )
}
