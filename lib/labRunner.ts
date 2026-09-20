/**
 * Runs a batch of auto-played games in the browser.
 *
 * Spreads the games over web workers when the browser and the build allow it,
 * and otherwise plays them on the main thread, yielding between games so the
 * page stays responsive either way.
 */
import { playGame } from "@/lib/engine"
import type { StrategySpec } from "@/lib/strategies"
import type { TrialRecord } from "@/lib/trials"
import type { LabRequest, LabResponse } from "@/lib/labWorker"

export type BatchOptions = {
  seeds: number[]
  spec: StrategySpec
  size?: number
  maxMoves?: number
  tag?: string
  /** Workers to use. One means play on the main thread. */
  threads?: number
  onRecord?: (record: TrialRecord, completed: number) => void
  /** Polled between games; return true to stop early. */
  shouldStop?: () => boolean
}

function makeWorker(): Worker {
  return new Worker(new URL("./labWorker.ts", import.meta.url))
}

/** True when this browser and build can actually spin up a game worker. */
export function workersAvailable(): boolean {
  if (typeof Worker === "undefined") return false
  try {
    makeWorker().terminate()
    return true
  } catch {
    return false
  }
}

async function runOnMainThread(options: BatchOptions): Promise<TrialRecord[]> {
  const records: TrialRecord[] = []
  for (const seed of options.seeds) {
    if (options.shouldStop?.()) break
    const { board: _board, ...record } = playGame({
      seed,
      spec: options.spec,
      size: options.size,
      maxMoves: options.maxMoves,
      tag: options.tag,
    })
    records.push(record)
    options.onRecord?.(record, records.length)
    // Hand the thread back so the progress display can paint.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return records
}

function runOnWorkers(
  options: BatchOptions,
  threads: number,
): Promise<TrialRecord[]> {
  return new Promise((resolve, reject) => {
    const { seeds } = options
    const records: TrialRecord[] = []
    const workers: Worker[] = []
    let next = 0
    let done = 0
    let settled = false

    const shutdown = () => workers.forEach((w) => w.terminate())
    const finish = () => {
      if (settled) return
      settled = true
      shutdown()
      resolve(records)
    }

    const dispatch = (worker: Worker) => {
      if (next >= seeds.length || options.shouldStop?.()) return
      const request: LabRequest = {
        seed: seeds[next++],
        spec: options.spec,
        size: options.size ?? 8,
        maxMoves: options.maxMoves ?? 100000,
        tag: options.tag,
      }
      worker.postMessage(request)
    }

    for (let i = 0; i < Math.min(threads, seeds.length); i++) {
      const worker = makeWorker()
      worker.onmessage = (event: MessageEvent<LabResponse>) => {
        const message = event.data
        if ("error" in message) {
          if (!settled) {
            settled = true
            shutdown()
            reject(new Error(message.error))
          }
          return
        }
        records.push(message.record)
        done++
        options.onRecord?.(message.record, done)
        if (done === seeds.length || options.shouldStop?.()) {
          finish()
          return
        }
        dispatch(worker)
      }
      worker.onerror = () => {
        if (!settled) {
          settled = true
          shutdown()
          reject(new Error("the game worker failed to start"))
        }
      }
      workers.push(worker)
    }

    if (workers.length === 0) {
      finish()
      return
    }
    workers.forEach(dispatch)
  })
}

export async function runBatch(
  options: BatchOptions,
): Promise<TrialRecord[]> {
  const threads = Math.max(1, options.threads ?? 1)
  if (threads === 1) return runOnMainThread(options)
  try {
    return await runOnWorkers(options, threads)
  } catch {
    // A browser or build that will not give us workers still gets its games.
    return runOnMainThread(options)
  }
}
