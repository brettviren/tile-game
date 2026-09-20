/**
 * Browser worker that plays whole games off the main thread.
 *
 * One seed per message, so the page can keep several workers busy and stays
 * responsive while a long batch runs.
 */
import { playGame } from "@/lib/engine"
import type { StrategySpec } from "@/lib/strategies"
import type { TrialRecord } from "@/lib/trials"

export type LabRequest = {
  seed: number
  spec: StrategySpec
  size: number
  maxMoves: number
  tag?: string
}

export type LabResponse = { record: TrialRecord } | { error: string }

// Structurally typed so the file needs no webworker lib reference, which would
// collide with the DOM lib the rest of the app is built against.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<LabRequest>) => void) | null
  postMessage: (message: LabResponse) => void
}

ctx.onmessage = (event) => {
  const request = event.data
  try {
    const { board: _board, ...record } = playGame({
      seed: request.seed,
      spec: request.spec,
      size: request.size,
      maxMoves: request.maxMoves,
      tag: request.tag,
    })
    ctx.postMessage({ record })
  } catch (error) {
    ctx.postMessage({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
