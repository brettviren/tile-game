import { describe, expect, test } from "vitest"
import {
  generateBoard,
  getPositionsThatAlmostMatch,
  swapTile,
} from "@/hooks/useBoard"
import { createSeededRandom } from "@/utils/seededRandom"
import { enumerateCandidates, playGame, seedsFor } from "@/lib/engine"
import {
  type Candidate,
  type StrategyContext,
  combineStrategies,
  formatSpec,
  parseSpec,
} from "@/lib/strategies"
import { stat, summarise, summariseByStrategy } from "@/lib/trials"

describe("specifications", () => {
  test("names and weights are parsed", () => {
    expect(parseSpec("cheapest:3,company:2,first")).toEqual({
      combine: "lexico",
      strategies: [
        { name: "cheapest", weight: 3 },
        { name: "company", weight: 2 },
        { name: "first", weight: 1 },
      ],
    })
  })

  test("a specification round trips", () => {
    const spec = parseSpec("greedy:2,junction:1", "weighted")
    expect(parseSpec(formatSpec(spec), "weighted")).toEqual(spec)
  })

  test("unknown names and empty specifications are rejected", () => {
    expect(() => parseSpec("nosuchstrategy")).toThrow(/unknown strategy/)
    expect(() => parseSpec("")).toThrow(/no strategies/)
    expect(() => parseSpec("greedy:bogus")).toThrow(/non-numeric weight/)
  })
})

describe("combining strategies", () => {
  const candidate = (over: Partial<Candidate>): Candidate => ({
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    score: 0,
    k: 3,
    seedVal: 1,
    newVal: 2,
    matches: 1,
    junction: false,
    originY: 0,
    rasterIndex: 0,
    ...over,
  })

  const ctx = (): StrategyContext => ({
    board: [],
    counts: {},
    moveNumber: 0,
    policyRandom: () => 0.5,
  })

  test("lexico applies the heaviest strategy first", () => {
    const low = candidate({ score: 8, k: 3, rasterIndex: 0 })
    const high = candidate({ score: 64, k: 5, rasterIndex: 1 })

    const byScore = combineStrategies(parseSpec("greedy:2,shortest:1"))
    expect(byScore([low, high], ctx())).toBe(high)

    const byLength = combineStrategies(parseSpec("shortest:2,greedy:1"))
    expect(byLength([low, high], ctx())).toBe(low)
  })

  test("a lower priority strategy settles ties left by the first", () => {
    const early = candidate({ score: 16, rasterIndex: 0, junction: false })
    const late = candidate({ score: 16, rasterIndex: 1, junction: true })
    const chooser = combineStrategies(parseSpec("greedy:3,junction:2"))
    expect(chooser([early, late], ctx())).toBe(late)
  })

  test("weighted mode trades strategies off against each other", () => {
    const cheapPlain = candidate({ score: 8, junction: false })
    const dearJunction = candidate({ score: 64, junction: true, rasterIndex: 1 })

    // Junction outweighs cheapness.
    expect(
      combineStrategies(parseSpec("cheapest:1,junction:5", "weighted"))(
        [cheapPlain, dearJunction],
        ctx(),
      ),
    ).toBe(dearJunction)

    // Cheapness outweighs junction.
    expect(
      combineStrategies(parseSpec("cheapest:5,junction:1", "weighted"))(
        [cheapPlain, dearJunction],
        ctx(),
      ),
    ).toBe(cheapPlain)
  })
})

describe("the engine", () => {
  test('"first" reproduces the original autoplay move for move', () => {
    let checked = 0
    for (let seed = 1; seed <= 12; seed++) {
      const random = createSeededRandom(seed)
      let board = generateBoard(8, random)
      for (let move = 0; move < 20; move++) {
        const hint = getPositionsThatAlmostMatch(board)
        const candidates = enumerateCandidates(board)
        if (!hint) {
          expect(candidates).toHaveLength(0)
          break
        }
        const first = candidates.reduce((a, b) =>
          b.rasterIndex < a.rasterIndex ? b : a,
        )
        const pair = [first.from, first.to]
        expect(new Set(pair.map((p) => `${p.x},${p.y}`))).toEqual(
          new Set(hint.map((p) => `${p.x},${p.y}`)),
        )
        checked++
        board = swapTile(hint[0], hint[1], board, random).slice(-1)[0].board
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  test("enumerated moves are all legal and carry the match shape", () => {
    const board = generateBoard(8, createSeededRandom(7))
    const candidates = enumerateCandidates(board)
    expect(candidates.length).toBeGreaterThan(0)
    for (const c of candidates) {
      expect(c.k).toBeGreaterThanOrEqual(3)
      // A match of k tiles of value v yields v + k - 2 and scores two to it.
      expect(c.newVal).toBe(c.seedVal + c.k - 2)
      expect(c.score).toBeGreaterThanOrEqual(Math.pow(2, c.newVal))
      expect(c.matches).toBeGreaterThanOrEqual(1)
    }
  })

  test("a seed replays a game exactly", () => {
    const spec = parseSpec("cheapest:2,company:1")
    const a = playGame({ seed: 4242, spec })
    const b = playGame({ seed: 4242, spec })
    expect([a.score, a.moves, a.maxTile]).toEqual([b.score, b.moves, b.maxTile])
    expect(a.moves).toBeGreaterThan(0)
  })

  test("judging moves never disturbs the tile stream", () => {
    // "random" deliberates with its own generator, so two runs of a seed must
    // still agree; if it drew from the game's generator they would not.
    const a = playGame({ seed: 77, spec: parseSpec("random") })
    const b = playGame({ seed: 77, spec: parseSpec("random") })
    expect(a.score).toBe(b.score)
    expect(a.moves).toBe(b.moves)
  })

  test("a game ends with a board holding no legal move", () => {
    const result = playGame({ seed: 31337, spec: parseSpec("first") })
    expect(result.finished).toBe(true)
    expect(enumerateCandidates(result.board)).toHaveLength(0)
  })

  test("the move limit stops a game short", () => {
    const result = playGame({
      seed: 31337,
      spec: parseSpec("first"),
      maxMoves: 5,
    })
    expect(result.moves).toBe(5)
    expect(result.finished).toBe(false)
  })

  test("a base seed makes a batch reproducible", () => {
    expect(seedsFor(3, 100)).toEqual([100, 101, 102])
    expect(seedsFor(3)).toHaveLength(3)
  })
})

describe("statistics", () => {
  test("mean, sample standard deviation and median", () => {
    const s = stat([2, 4, 4, 4, 5, 5, 7, 9])
    expect(s.mean).toBe(5)
    // Sample standard deviation, the n-1 form.
    expect(s.sd).toBeCloseTo(2.13809, 4)
    expect(s.median).toBe(4.5)
    expect(s.min).toBe(2)
    expect(s.max).toBe(9)
  })

  test("a single value has no spread and no values is all zero", () => {
    expect(stat([42])).toEqual({ mean: 42, sd: 0, min: 42, max: 42, median: 42 })
    expect(stat([])).toEqual({ mean: 0, sd: 0, min: 0, max: 0, median: 0 })
  })

  test("records are summarised and grouped by strategy", () => {
    const base = {
      durationMs: 10,
      maxTile: 9,
      startedAt: 0,
      combine: "lexico",
      size: 8,
      finished: true,
    }
    const records = [
      { ...base, seed: 1, score: 100, moves: 10, strategy: "first:1" },
      { ...base, seed: 2, score: 300, moves: 30, strategy: "first:1" },
      { ...base, seed: 3, score: 900, moves: 90, strategy: "greedy:1" },
    ]
    expect(summarise(records).count).toBe(3)
    expect(summarise(records).score.mean).toBe(from(records))

    const groups = summariseByStrategy(records)
    expect(groups).toHaveLength(2)
    // Ordered by mean score, best first.
    expect(groups[0].strategy).toBe("greedy:1")
    expect(groups[1].summary.score.mean).toBe(200)
    expect(groups[1].summary.count).toBe(2)
  })
})

function from(records: { score: number }[]) {
  return records.reduce((a, r) => a + r.score, 0) / records.length
}
