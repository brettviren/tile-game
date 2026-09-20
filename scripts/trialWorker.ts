/// <reference lib="deno.worker" />
/**
 * Deno worker that plays whole games, one seed at a time.
 *
 * The parent hands out seeds and collects records, so games spread over as many
 * workers as the user asked for without any shared state between them.
 */
import { playGame } from "@/lib/engine"
import type { WorkerRequest, WorkerResponse } from "@/scripts/trialWorkerTypes"

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    const { board: _board, ...record } = playGame({
      seed: request.seed,
      spec: request.spec,
      size: request.size,
      maxMoves: request.maxMoves,
      tag: request.tag,
    })
    const response: WorkerResponse = { record }
    self.postMessage(response)
  } catch (error) {
    const response: WorkerResponse = {
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}
