import { useParams } from 'common'
import { Brain, Play, RotateCcw, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from 'ui'
import { useSessionAccessTokenQuery } from '@/data/auth/session-access-token-query'
import {
  CopilotPaymentRequiredError,
  CopilotRequestFailedError,
  CopilotServiceUnavailableError,
  CopilotTurnInProgressError,
  projectCopilotApi,
  streamProjectCopilotChat,
  type ProjectCopilotMessage,
} from '@/lib/ai-api'
import { daysFromNow, dayWord } from '@/lib/credits/format'
import { useTrack } from '@/lib/telemetry/track'
import { getSequence } from '@/components/interfaces/AI/GuideBubbles/guide-sequences'
import { MarkdownText } from '@/components/interfaces/AI/Shared/MarkdownText'
import { guideEngineState } from '@/state/guide-engine-state'
import { SIDEBAR_KEYS } from '@/components/layouts/ProjectLayout/LayoutSidebar/LayoutSidebarProvider'
import { useSidebarManagerSnapshot } from '@/state/sidebar-manager-state'

import { type DocsNoticeKind, docsNoticeCopy, isDocsNoticeKind } from './docs-notice-copy'
import { looksLikeGuideLaunchClaim } from './launch-claim'
import { ProjectCopilotWelcomeBody } from './ProjectCopilotWelcome'

/** Inline notice shown for a pre-stream turn failure (402/409/503/other). */
interface TurnNotice {
  kind: 'out_of_credits' | 'busy' | 'unavailable' | 'failed'
  message: string
}

function formatOutOfCreditsNotice(err: CopilotPaymentRequiredError): string {
  if (err.renews_at) {
    const dateOnly = err.renews_at.split('T')[0]
    const days = daysFromNow(err.renews_at)
    return days !== null
      ? `Out of credits. Resets on ${dateOnly} (in ${days} ${dayWord(days)}).`
      : `Out of credits. Resets on ${dateOnly}.`
  }
  return 'Out of credits.'
}

/**
 * The persistent Project Copilot chat panel (registered as a sidebar, so it
 * stays mounted across tab navigation). Onboarding/guidance only in v1: it
 * streams answers grounded in the docs and can trigger guide-bubble
 * walkthroughs (handled by the `trigger_guide` SSE event).
 */
export const ProjectCopilotPanel = () => {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  const { closeSidebar } = useSidebarManagerSnapshot()
  const track = useTrack()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ProjectCopilotMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [statusTool, setStatusTool] = useState<string>('')
  const [isResetting, setIsResetting] = useState(false)
  // Bootstrap (session get-or-create + history load) can fail on a transient 502
  // or an expired token. Surface it with a Retry instead of freezing the composer
  // at "Connecting…" forever. `retryTick` re-triggers the bootstrap effect.
  const [bootstrapError, setBootstrapError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  // Set when the last turn couldn't ground its answer in the docs — holds WHY
  // (not configured / unreachable / not indexed yet) so the warning tells the
  // operator what to do about it, rather than one catch-all "couldn't be
  // reached". We warn rather than present a confident, unsourced reply.
  const [docsNotice, setDocsNotice] = useState<DocsNoticeKind | null>(null)
  // Set on a thrown PRE-STREAM turn (402 out-of-credits, 409 turn-already-in-progress,
  // 503 unavailable, or any other non-OK status — 500/429/502/504). These fail before
  // anything is persisted server-side, so unlike docsNotice this replaces reloading
  // history with keeping the optimistic user bubble + this notice.
  const [turnNotice, setTurnNotice] = useState<TurnNotice | null>(null)
  // Live extended-thinking buffer for the in-flight turn (streamed reasoning
  // deltas; reset at the start of each turn and cleared when it ends).
  const [reasoning, setReasoning] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  // Reset at the start of each turn: did a (recognized-or-not) trigger_guide
  // event arrive this turn? Compared against the final text's launch-claim
  // regex below to fire guide_launch_missing when the assistant says it
  // launched a walkthrough but nothing actually triggered.
  const sawTriggerGuideRef = useRef(false)
  // Latest session id, so an in-flight turn can detect a project/session swap
  // (the panel persists across tab nav) and not paint stale messages.
  const sessionIdRef = useRef<string | null>(null)
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])
  // Last `ref` this effect bootstrapped for — lets the effect below tell a
  // real project switch apart from a token refresh / retry on the same
  // project.
  const prevRefRef = useRef<string | undefined>(undefined)

  // Ensure a session exists, then load its history.
  useEffect(() => {
    let cancelled = false
    if (!token || !ref) return
    if (prevRefRef.current !== undefined && prevRefRef.current !== ref) {
      // Project switch: reset immediately, before awaiting the new session, so
      // an in-flight send() from the old project can't POST project A's
      // session id to project B, and project A's history doesn't flash while
      // the new bootstrap resolves.
      abortRef.current?.abort()
      abortRef.current = null
      sessionIdRef.current = null
      setSessionId(null)
      setMessages([])
      setIsStreaming(false)
      setDocsNotice(null)
      setTurnNotice(null)
    }
    prevRefRef.current = ref
    setBootstrapError(false)
    ;(async () => {
      const existing = await projectCopilotApi.getSession(token, ref)
      let sid = existing.session?.id ?? null
      if (!sid) {
        sid = (await projectCopilotApi.createSession(token, ref)).id
      }
      if (cancelled) return
      const { messages } = await projectCopilotApi.getMessages(token, ref, sid)
      if (cancelled) return
      // Commit sessionId only after history has loaded — committing it first
      // and awaiting getMessages afterward let a transient failure land the
      // Retry gate `bootstrapError && !sessionId` in a state that could never
      // be true again (sessionId already set), stranding the user on an empty
      // "welcome" screen with no way to reload.
      setSessionId(sid)
      setMessages(messages)
    })().catch((err) => {
      // Don't swallow: leaving sessionId null freezes the composer at
      // "Connecting…" with no way out. Surface an inline error + Retry.
      if (cancelled) return
      console.error('[project-copilot] session bootstrap failed', err)
      setBootstrapError(true)
    })
    return () => {
      cancelled = true
    }
  }, [token, ref, retryTick])

  // On unmount (the panel is a sidebar that unmounts on close / tab switch),
  // mark unmounted + abort any in-flight stream so we don't setState-after-unmount
  // or leak the SSE connection + its server worker thread.
  useEffect(
    () => () => {
      mountedRef.current = false
      abortRef.current?.abort()
    },
    []
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, statusTool, reasoning])

  // Reset: abort any in-flight turn, delete the (singleton) session so its
  // history is gone server-side, then create a fresh one. sessionIdRef is
  // cleared synchronously so an aborted in-flight send() sees the swap and does
  // not repaint the old conversation.
  const handleReset = useCallback(async () => {
    if (!token || !ref || isResetting) return
    setIsResetting(true)
    abortRef.current?.abort()
    // Tear down any walkthrough this session launched — the guide store is
    // module-level and survives the chat reset otherwise.
    guideEngineState.finish()
    const current = sessionIdRef.current
    sessionIdRef.current = null
    setSessionId(null)
    setMessages([])
    setInput('')
    setStatusTool('')
    setReasoning('')
    setDocsNotice(null)
    setTurnNotice(null)
    setIsStreaming(false)
    try {
      if (current) await projectCopilotApi.deleteSession(token, ref, current)
      const created = await projectCopilotApi.createSession(token, ref)
      if (!mountedRef.current) return
      sessionIdRef.current = created.id
      setSessionId(created.id)
    } catch (err) {
      // Don't leave the panel wedged at "Connecting…" with no way out: a failed
      // reset leaves sessionId null, so surface the inline retry card (gated on
      // bootstrapError && !sessionId) instead of swallowing the error.
      if (mountedRef.current) {
        console.error('[project-copilot] reset failed', err)
        setBootstrapError(true)
      }
    } finally {
      if (mountedRef.current) setIsResetting(false)
    }
  }, [token, ref, isResetting])

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || isStreaming || !token || !ref || !sessionId) return
      const turnSessionId = sessionId

      setInput('')
      setIsStreaming(true)
      setStatusTool('')
      setReasoning('')
      setDocsNotice(null)
      setTurnNotice(null)
      sawTriggerGuideRef.current = false
      // Optimistic user bubble until we reload the persisted history below.
      const optimisticUserId = `optimistic-${crypto.randomUUID()}`
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticUserId,
          session_id: turnSessionId,
          role: 'user',
          content: message,
          guide_event: null,
          created_at: new Date().toISOString(),
        },
      ])

      const controller = new AbortController()
      abortRef.current = controller
      let threwMessage: string | null = null
      let completedContent: string | null = null

      try {
        await streamProjectCopilotChat(
          token,
          ref,
          turnSessionId,
          { message },
          (event) => {
            if (event.event === 'tool_call') {
              setStatusTool(
                event.tool_call.name === 'search_docs'
                  ? 'Searching the docs…'
                  : `Using ${event.tool_call.name}…`
              )
            } else if (event.event === 'reasoning_delta') {
              setReasoning((prev) => prev + event.delta)
            } else if (event.event === 'trigger_guide') {
              sawTriggerGuideRef.current = true
              // Same liveness guard as the message repaint below: don't launch a
              // walkthrough from a turn the user has since reset or navigated away
              // from (the guide store is global and survives remounts).
              if (mountedRef.current && sessionIdRef.current === turnSessionId) {
                const seq = getSequence(event.sequence_id)
                if (seq) {
                  guideEngineState.start(event.sequence_id, 'copilot')
                } else {
                  // trigger_guide referenced a sequence id the frontend registry
                  // doesn't know about (registry drift) — previously a silent
                  // no-op. Surface it instead of leaving the launch unexplained.
                  track('guide_launch_missing', {
                    sequence_id: event.sequence_id,
                    reason: 'unknown_sequence_id',
                    chatId: turnSessionId,
                  })
                }
              }
            } else if (event.event === 'notice') {
              // Same liveness guard as trigger_guide: ignore a buffered notice from
              // a turn the user has since reset/navigated away from.
              if (
                isDocsNoticeKind(event.kind) &&
                mountedRef.current &&
                sessionIdRef.current === turnSessionId
              ) {
                setDocsNotice(event.kind)
              }
            } else if (event.event === 'complete') {
              completedContent = event.content
            } else if (event.event === 'error') {
              threwMessage = event.error
            }
          },
          { signal: controller.signal }
        )
      } catch (err) {
        const stillCurrentAfterCatch = mountedRef.current && sessionIdRef.current === turnSessionId
        if ((err as Error).name === 'AbortError') {
          // Intentional cancel (unmount) — leave it to the guards below.
        } else if (
          err instanceof CopilotPaymentRequiredError ||
          err instanceof CopilotTurnInProgressError ||
          err instanceof CopilotServiceUnavailableError ||
          err instanceof CopilotRequestFailedError
        ) {
          // Pre-stream rejection: the credit gate, the turn lock, and any other
          // non-OK status (500 pre-commit INSERT failure, 429, gateway 502/504)
          // all fire BEFORE the user message is persisted, so there is nothing new
          // to reload from the server for this turn — the last message there is
          // still the previous (assistant) reply. Reloading here would hit
          // `!lastIsAssistant === false` below and REPLACE the message list,
          // silently wiping the optimistic user bubble above with no error
          // shown (the bug this branch exists to fix). Instead: keep the
          // bubble, restore the composer text so it isn't lost, show an
          // explicit notice, and skip the reload/fallback logic entirely.
          if (stillCurrentAfterCatch) {
            setInput(message)
            setTurnNotice(
              err instanceof CopilotPaymentRequiredError
                ? { kind: 'out_of_credits', message: formatOutOfCreditsNotice(err) }
                : err instanceof CopilotTurnInProgressError
                  ? {
                      kind: 'busy',
                      message: 'A copilot turn is already in progress — please wait for it to finish.',
                    }
                  : err instanceof CopilotRequestFailedError
                    ? { kind: 'failed', message: err.message }
                    : { kind: 'unavailable', message: err.message }
            )
            setStatusTool('')
            setReasoning('')
            setIsStreaming(false)
          }
          abortRef.current = null
          return
        } else {
          threwMessage = (err as Error).message
        }
      }

      // Bail if the panel unmounted or the project/session changed under us.
      const stillCurrent = () => mountedRef.current && sessionIdRef.current === turnSessionId
      if (!stillCurrent()) {
        abortRef.current = null
        return
      }

      // The reply's text claims a walkthrough was launched (e.g. "I've launched
      // the walkthrough"), but no trigger_guide — recognized or not — arrived
      // this turn. Without this, a broken launch is silent: the assistant says
      // it did something and nothing happens.
      if (!sawTriggerGuideRef.current && looksLikeGuideLaunchClaim(completedContent)) {
        track('guide_launch_missing', { reason: 'no_trigger_guide_event', chatId: turnSessionId })
      }

      // Server is the source of truth: it persisted the user + assistant message
      // (incl. guide_event, or an "Error: …" row). Reload rather than synthesise
      // local rows so a later remount doesn't show duplicates.
      try {
        const { messages: server } = await projectCopilotApi.getMessages(token, ref, turnSessionId)
        if (stillCurrent()) {
          const lastIsAssistant = server.at(-1)?.role === 'assistant'
          // Fallback only when the server has no assistant reply for this turn
          // (e.g. the assistant row failed to persist): show the streamed content,
          // else a transient error if the stream itself failed.
          const fallback =
            !lastIsAssistant && (completedContent || threwMessage)
              ? [
                  {
                    id: `transient-${crypto.randomUUID()}`,
                    session_id: turnSessionId,
                    role: 'assistant' as const,
                    // The backend `error` event already sends a complete, user-facing
                    // sentence (often starting "Sorry —"); only prefix a raw
                    // client-thrown message so we don't double up ("Sorry — Sorry —").
                    content:
                      completedContent ||
                      (threwMessage && /^sorry/i.test(threwMessage)
                        ? threwMessage
                        : `Sorry — ${threwMessage}`),
                    guide_event: null,
                    created_at: new Date().toISOString(),
                  },
                ]
              : []
          setMessages([...server, ...fallback])
        }
      } catch {
        // The turn DID happen server-side (the user message and assistant reply
        // were persisted and billed) — we only failed to RELOAD it. Deleting the
        // optimistic user bubble here would erase the user's own message and
        // prompt a confusing duplicate re-send. Keep it, and show the streamed
        // reply if we captured it, else a reload hint.
        if (stillCurrent()) {
          setMessages((prev) => [
            ...prev,
            {
              id: `transient-${crypto.randomUUID()}`,
              session_id: turnSessionId,
              role: 'assistant' as const,
              content: completedContent || 'Your message was sent — reload to see the reply.',
              guide_event: null,
              created_at: new Date().toISOString(),
            },
          ])
        }
      } finally {
        if (mountedRef.current) {
          setStatusTool('')
          setReasoning('')
          setIsStreaming(false)
        }
        abortRef.current = null
      }
    },
    [isStreaming, token, ref, sessionId, track]
  )

  return (
    <div className="flex flex-col h-full bg-studio" role="complementary" aria-label="Project Copilot">
      <div className="flex items-center justify-between px-4 h-12 border-b border-default flex-shrink-0">
        <div className="flex items-center gap-x-2">
          <Sparkles size={16} className="text-brand" />
          <h2 className="text-sm font-medium">Project Copilot</h2>
        </div>
        <div className="flex items-center gap-x-0.5">
          <Button
            type="text"
            size="tiny"
            className="px-1"
            onClick={handleReset}
            loading={isResetting}
            disabled={isResetting}
            aria-label="Start a new chat"
            icon={<RotateCcw size={15} />}
          />
          <Button
            type="text"
            size="tiny"
            className="px-1"
            onClick={() => closeSidebar(SIDEBAR_KEYS.PROJECT_COPILOT)}
            aria-label="Close copilot"
            icon={<X size={16} />}
          />
        </div>
      </div>

      {/* The copilot session is project-wide (no per-user scoping) — every
          collaborator can read the full history, so say so up front. */}
      <p className="px-4 py-1.5 text-xs text-foreground-lighter border-b border-default flex-shrink-0">
        Chats are visible to everyone in this project — don’t paste secrets or API keys.
      </p>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-y-4">
        {/* Scoped to the finalized log only — NOT the streaming block below,
            whose reasoning/status text updates per-token. A screen reader
            announcing that live region politely on each new message is the
            right UX; announcing it on every streamed delta is not. */}
        <div role="log" aria-live="polite" className="contents">
          {bootstrapError && !sessionId ? (
            <div className="flex flex-col gap-y-2 rounded-md border border-default bg-surface-100 px-3 py-3">
              <p className="text-sm text-foreground">Couldn’t connect to Project Copilot.</p>
              <p className="text-xs text-foreground-lighter">
                Check your connection and try again.
              </p>
              <div>
                <Button type="default" size="tiny" onClick={() => setRetryTick((t) => t + 1)}>
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            messages.length === 0 &&
            !isStreaming && (
              <ProjectCopilotWelcomeBody onStartGuide={(id) => guideEngineState.start(id, 'welcome')} />
            )
          )}

          {messages.map((m) => {
            const seq =
              m.guide_event?.sequence_id !== undefined
                ? getSequence(m.guide_event.sequence_id)
                : undefined
            return (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'self-end max-w-[85%] bg-surface-300 rounded-md px-3 py-2'
                    : 'self-start max-w-[95%]'
                }
              >
                {m.role === 'user' ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                    {m.content}
                  </p>
                ) : (
                  <MarkdownText className="text-sm text-foreground">{m.content}</MarkdownText>
                )}
                {seq && (
                  <Button
                    type="default"
                    size="tiny"
                    className="mt-2"
                    icon={<Play size={12} />}
                    onClick={() => guideEngineState.start(seq.id, 'replay')}
                  >
                    Replay: {seq.title}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {/* While streaming: live extended-thinking (if any) + a status line
            (tool name, else a generic thinking line). The backend streams
            reasoning/tool events; the final answer arrives on `complete`.
            aria-live="off" — this text updates per-token; see the log above. */}
        {isStreaming && (
          <div className="self-start w-full flex flex-col gap-y-1.5" aria-live="off">
            {reasoning && (
              <div className="flex flex-col gap-y-1 rounded-md border border-default bg-surface-100 px-3 py-2">
                <div className="flex items-center gap-x-1.5 text-xs font-medium text-foreground-lighter">
                  <Brain size={12} />
                  Thinking
                </div>
                <p className="text-xs text-foreground-light whitespace-pre-wrap break-words">
                  {reasoning}
                </p>
              </div>
            )}
            <p className="text-xs text-foreground-lighter">{statusTool || 'Thinking…'}</p>
          </div>
        )}

        {docsNotice && !isStreaming && (
          <div
            className="self-start max-w-[95%] flex items-start gap-x-1.5 rounded-md border border-warning-500 bg-warning-200 px-3 py-2"
            role="status"
          >
            <TriangleAlert size={13} className="mt-0.5 flex-shrink-0 text-warning-600" />
            <p className="text-xs text-warning-600">{docsNoticeCopy(docsNotice)}</p>
          </div>
        )}

        {turnNotice && !isStreaming && (
          <div
            className="self-start max-w-[95%] flex items-start gap-x-1.5 rounded-md border border-warning-500 bg-warning-200 px-3 py-2"
            role="status"
          >
            <TriangleAlert size={13} className="mt-0.5 flex-shrink-0 text-warning-600" />
            <p className="text-xs text-warning-600">{turnNotice.message}</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-default p-3 flex-shrink-0 flex items-end gap-x-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <textarea
          aria-label="Message Project Copilot"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
          }}
          rows={2}
          placeholder={sessionId ? 'Ask how to connect, create a table, an agent…' : 'Connecting…'}
          className="flex-1 resize-none bg-control border border-control rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          disabled={isStreaming || !sessionId}
        />
        <Button
          htmlType="submit"
          type="primary"
          loading={isStreaming}
          disabled={!input.trim() || !sessionId}
        >
          Send
        </Button>
      </form>
    </div>
  )
}
