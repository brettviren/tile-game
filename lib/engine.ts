/**
 * Headless exponentile engine.
 *
 * Plays complete games against the same `swapTile` the user interface drives,
 * so a run here and a run in the browser agree move for move. Pure and
 * framework-free: imported unchanged by the web app, the browser worker and
 * the Deno command line runner.
 */
import {
  type Board,
  type Position,
  copyBoard,
  generateBoard,
  getMatchedTile,
  type MatchedTile,
  swapTile,
} from "@/hooks/useBoard"
import { createSeededRandom } from "@/utils/seededRandom"
import {
  type Candidate,
  type StrategyContext,
  type StrategySpec,
  combineStrategies,
} from "@/lib/strategies"
import type { TrialRecord } from "@/lib/trials"

/**
 * The order in which `getPositionsThatAlmostMatch` walks the board: each cell
 * with x outermost, then its left, right, up and down neighbour. Reproducing it
 * is what lets the "first" strategy match the original autoplay exactly.
 */
function* rasterPairs(size: number): Generator<[Position, Position]> {
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const here = { x, y }
      const neighbours = [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ]
      for (const there of neighbours) {
        if (there.x < 0 || there.x >= size || there.y < 0 || there.y >= size) {
          continue
        }
        yield [here, there]
      }
    }
  }
}

/**
 * Every legal move on the board, in board scan order.
 *
 * Deliberately free of randomness: it calls `getMatchedTile`, never `swapTile`,
 * so judging moves cannot draw from the game's tile generator. That keeps a
 * seeded run reproducible however much a strategy deliberates.
 */
export function enumerateCandidates(board: Board): Candidate[] {
  const size = board.length
  const seen = new Set<number>()
  const candidates: Candidate[] = []

  for (const [from, to] of rasterPairs(size)) {
    // A pair is reached from both of its ends; keep only the first sighting.
    const a = from.y * size + from.x
    const b = to.y * size + to.x
    const pairKey = a < b ? a * size * size + b : b * size * size + a
    if (seen.has(pairKey)) continue
    seen.add(pairKey)

    const swapped = copyBoard(board)
    swapped[to.x][to.y] = board[from.x][from.y]
    swapped[from.x][from.y] = board[to.x][to.y]

    const matches = [
      getMatchedTile(from, swapped),
      getMatchedTile(to, swapped),
    ]
    if (!matches.some((m) => m.match)) continue

    // A swap can form a match at each of its ends. `score` totals both, while
    // the shape fields describe the larger of the two so that they stay
    // consistent with one another.
    let score = 0
    let matchCount = 0
    let dominant: MatchedTile | undefined
    for (const m of matches) {
      if (!m.match) continue
      matchCount++
      score += Math.pow(2, m.newValue)
      const size = m.matchedTiles.length + 1
      const bestSize = dominant ? dominant.matchedTiles.length + 1 : -1
      if (
        !dominant ||
        size > bestSize ||
        (size === bestSize && m.newValue > dominant.newValue)
      ) {
        dominant = m
      }
    }
    if (!dominant) continue

    // Both axes fed the match when some tiles share the origin's column and
    // others share its row.
    const vertical = dominant.matchedTiles.some((t) => t.x === dominant!.origin.x)
    const horizontal = dominant.matchedTiles.some((t) => t.y === dominant!.origin.y)

    candidates.push({
      from,
      to,
      score,
      matches: matchCount,
      k: dominant.matchedTiles.length + 1,
      seedVal: swapped[dominant.origin.x][dominant.origin.y].value,
      newVal: dominant.newValue,
      junction: vertical && horizontal,
      originY: dominant.origin.y,
      rasterIndex: candidates.length,
    })
  }
  return candidates
}

export function tileCounts(board: Board): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const column of board) {
    for (const tile of column) {
      counts[tile.value] = (counts[tile.value] ?? 0) + 1
    }
  }
  return counts
}

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now()

export type MoveReport = {
  move: number
  from: Position
  to: Position
  k: number
  newVal: number
  /** Points this move scored, cascades included. */
  points: number
  /** Running total after this move. */
  score: number
  board: Board
}

export type PlayOptions = {
  seed: number
  spec: StrategySpec
  size?: number
  /** Stops a game that will not end; zero or less means no limit. */
  maxMoves?: number
  tag?: string
  /** Called after each move, for progress display. */
  onMove?: (report: MoveReport) => void
}

export type PlayResult = TrialRecord & { board: Board }

/** Plays one complete game and returns its record. */
export function playGame(options: PlayOptions): PlayResult {
  const size = options.size ?? 8
  const maxMoves = options.maxMoves ?? 100000
  const choose = combineStrategies(options.spec)

  const gameRandom = createSeededRandom(options.seed)
  // A second, independent stream so that a strategy such as "random" stays
  // reproducible without disturbing which tiles the board deals.
  const policyRandom = createSeededRandom(options.seed + 0x9e3779b9)

  const startedAt = Date.now()
  const startTime = now()

  let board = generateBoard(size, gameRandom)
  let score = 0
  let moves = 0
  let finished = true

  for (;;) {
    const candidates = enumerateCandidates(board)
    if (candidates.length === 0) break
    if (maxMoves > 0 && moves >= maxMoves) {
      finished = false
      break
    }

    const ctx: StrategyContext = {
      board,
      counts: tileCounts(board),
      moveNumber: moves,
      policyRandom,
    }
    const choice = choose(candidates, ctx)

    const frames = swapTile(choice.from, choice.to, board, gameRandom)
    const points = frames.reduce((acc, frame) => acc + frame.points, 0)
    board = frames[frames.length - 1].board
    score += points
    moves++

    options.onMove?.({
      move: moves,
      from: choice.from,
      to: choice.to,
      k: choice.k,
      newVal: choice.newVal,
      points,
      score,
      board,
    })
  }

  const durationMs = now() - startTime
  const maxTile = board
    .flat()
    .reduce((acc, tile) => Math.max(acc, tile.value), 0)

  return {
    seed: options.seed,
    score,
    moves,
    durationMs,
    maxTile,
    startedAt,
    strategy: options.spec.strategies
      .map((s) => `${s.name}:${s.weight}`)
      .join(","),
    combine: options.spec.combine,
    size,
    finished,
    tag: options.tag,
    board,
  }
}

/**
 * Seeds for a batch of games. A base seed makes a whole batch reproducible;
 * without one the batch is drawn fresh.
 */
export function seedsFor(count: number, baseSeed?: number): number[] {
  if (baseSeed === undefined) {
    return Array.from({ length: count }, () =>
      Math.floor(Math.random() * 1000000),
    )
  }
  return Array.from({ length: count }, (_, i) => baseSeed + i)
}
