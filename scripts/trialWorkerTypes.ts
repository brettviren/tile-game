/** Messages exchanged with the trial workers, kept apart from the worker
 * module itself so the parent can import them without pulling in the worker
 * global scope. */
import type { StrategySpec } from "@/lib/strategies"
import type { TrialRecord } from "@/lib/trials"

export type WorkerRequest = {
  seed: number
  spec: StrategySpec
  size: number
  maxMoves: number
  tag?: string
}

export type WorkerResponse = { record: TrialRecord } | { error: string }
