/**
 * Records of auto-played games and the summary statistics over them.
 *
 * Pure and framework-free, shared by the command line runner and the web app.
 */

export type TrialRecord = {
  /** Seed handed to the game's generator; replays the game exactly. */
  seed: number
  /** Final score. */
  score: number
  /** Moves played before the board ran out of matches. */
  moves: number
  /** Wall clock time the game took to play, in milliseconds. */
  durationMs: number
  /** Highest tile value left on the board, whose face value is two to it. */
  maxTile: number
  /** Epoch milliseconds at which the game started. */
  startedAt: number
  /** Strategy specification, in the text form `parseSpec` accepts. */
  strategy: string
  combine: string
  size: number
  /** False when the game stopped on the move limit rather than a dead board. */
  finished: boolean
  /** Optional label, for grouping runs of one experiment. */
  tag?: string
}

export type Stat = {
  mean: number
  /** Sample standard deviation, zero for fewer than two values. */
  sd: number
  min: number
  max: number
  median: number
}

export type Summary = {
  count: number
  score: Stat
  moves: Stat
  durationMs: Stat
  maxTile: Stat
}

export function stat(values: number[]): Stat {
  if (values.length === 0) {
    return { mean: 0, sd: 0, min: 0, max: 0, median: 0 }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.length < 2
      ? 0
      : values.reduce((a, v) => a + (v - mean) * (v - mean), 0) /
        (values.length - 1)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return {
    mean,
    sd: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median,
  }
}

export function summarise(records: TrialRecord[]): Summary {
  return {
    count: records.length,
    score: stat(records.map((r) => r.score)),
    moves: stat(records.map((r) => r.moves)),
    durationMs: stat(records.map((r) => r.durationMs)),
    maxTile: stat(records.map((r) => r.maxTile)),
  }
}

/** Groups records by strategy and combine mode, for comparing policies. */
export function summariseByStrategy(
  records: TrialRecord[],
): { strategy: string; combine: string; summary: Summary }[] {
  const groups = new Map<string, TrialRecord[]>()
  for (const r of records) {
    const key = `${r.strategy}\t${r.combine}`
    const group = groups.get(key)
    if (group) group.push(r)
    else groups.set(key, [r])
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const [strategy, combine] = key.split("\t")
      return { strategy, combine, summary: summarise(group) }
    })
    .sort((a, b) => b.summary.score.mean - a.summary.score.mean)
}

/** A store of trial records; backed by the file system or by the browser. */
export interface TrialStore {
  append(records: TrialRecord[]): Promise<void>
  list(): Promise<TrialRecord[]>
  clear(): Promise<void>
}
