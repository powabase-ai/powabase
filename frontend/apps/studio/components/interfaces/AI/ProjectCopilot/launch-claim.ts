/**
 * Detects whether an assistant turn's final text claims it launched a guide
 * walkthrough (e.g. "I've launched the walkthrough", "Let's start the
 * walkthrough — I'll highlight the button now"). Used by ProjectCopilotPanel
 * to fire `guide_launch_missing` when the text makes this claim but no
 * `trigger_guide` event actually arrived for the turn — otherwise a broken
 * launch is silent: the assistant says it did something and nothing happens.
 *
 * Kept as a standalone, dependency-free module so it's unit-testable without
 * pulling in the rest of the panel.
 *
 * Negated phrasing ("I can't launch the walkthrough", "there's no walkthrough
 * for this") must NOT match — a denial isn't a claim. The lookbehinds below
 * reject a launch verb immediately preceded by can't/cannot/won't/unable to,
 * and a "walkthrough" immediately preceded by "no".
 */
export const GUIDE_LAUNCH_CLAIM_REGEX =
  /(?<!\b(?:can'?t|cannot|won'?t|unable to)\s)\b(launch|launched|launching|start|started|starting|open|opened|opening|show|showed|showing|highlight|highlighted|highlighting)\w*\b[^.!?\n]{0,60}(?<!\bno\s)\bwalkthrough\b|\bi'?ve launched\b|\bwalkthrough (?:is|on) (?:now )?on screen\b/i

export const looksLikeGuideLaunchClaim = (text: string | null | undefined): boolean => {
  if (!text) return false
  return GUIDE_LAUNCH_CLAIM_REGEX.test(text)
}
