/**
 * Auto-play strategies for exponentile.
 *
 * A strategy scores every legal move on the board; higher keys are preferred.
 * Strategies are combined by priority (see `combineStrategies`) so that several
 * may be applied together.
 *
 * This module is pure and framework-free: it is imported unchanged by the web
 * app, by the browser worker and by the Deno command line runner.
 */
import type { Board, Position } from "@/hooks/useBoard"

/** A legal move, with everything a strategy needs to judge it. */
export type Candidate = {
  from: Position
  to: Position
  /** Points the move scores immediately, before any cascade. */
  score: number
  /** Matches the swap forms; a swap can score at each of its two ends. */
  matches: number
  /** Tiles in the largest match the move forms, counting the seed tile. */
  k: number
  /** Value of the tiles consumed by the match. */
  seedVal: number
  /** Value of the tile the match produces. */
  newVal: number
  /** True when a match draws on both the horizontal and the vertical axis. */
  junction: boolean
  /** Row the produced tile appears in; y grows downward. */
  originY: number
  /** Position in the board scan, matching `getPositionsThatAlmostMatch`. */
  rasterIndex: number
}

export type StrategyContext = {
  board: Board
  /** How many tiles of each value are currently on the board. */
  counts: Record<number, number>
  moveNumber: number
  /**
   * Randomness for strategy decisions only. Deliberately separate from the
   * game's generator so that judging moves never perturbs the tile stream.
   */
  policyRandom: () => number
}

export type Strategy = {
  name: string
  summary: string
  key: (c: Candidate, ctx: StrategyContext) => number
}

const bool = (b: boolean) => (b ? 1 : 0)

export const STRATEGIES: Strategy[] = [
  {
    name: "first",
    summary:
      "Take the first match found while scanning the board from the upper left (the original autoplay).",
    key: (c) => -c.rasterIndex,
  },
  {
    name: "random",
    summary: "Pick uniformly at random among the legal moves.",
    key: (_c, ctx) => ctx.policyRandom(),
  },
  {
    name: "greedy",
    summary: "Take the move scoring the most points right now.",
    key: (c) => c.score,
  },
  {
    name: "cheapest",
    summary:
      "Take the lowest scoring move, preserving high tiles and board life.",
    key: (c) => -c.score,
  },
  {
    name: "longest",
    summary: "Prefer matches of the most tiles, which are the most efficient.",
    key: (c) => c.k,
  },
  {
    name: "shortest",
    summary: "Prefer three-tile matches, leaving longer ones to grow.",
    key: (c) => -c.k,
  },
  {
    name: "inband",
    summary:
      "Prefer matches producing a tile of value four or less, which the refill keeps replenished.",
    key: (c) => bool(c.newVal <= 4),
  },
  {
    name: "lowseed",
    summary: "Prefer matching the lowest valued tiles available.",
    key: (c) => -c.seedVal,
  },
  {
    name: "highseed",
    summary: "Prefer matching the highest valued tiles available.",
    key: (c) => c.seedVal,
  },
  {
    name: "junction",
    summary:
      "Prefer L, T and cross shapes, where both axes feed one match.",
    key: (c) => bool(c.junction),
  },
  {
    name: "company",
    summary:
      "Prefer matches whose new tile already has tiles of that value on the board.",
    key: (c, ctx) => Math.min(ctx.counts[c.newVal] ?? 0, 3),
  },
  {
    name: "noorphan",
    summary:
      "Avoid producing a tile value that has no partners left on the board.",
    key: (c, ctx) => bool((ctx.counts[c.newVal] ?? 0) >= 2),
  },
  {
    name: "sediment",
    summary:
      "Prefer matching tiles of value five or more, clearing dead weight off the board.",
    key: (c) => bool(c.seedVal >= 5),
  },
  {
    name: "deep",
    summary: "Prefer matches that place the new tile low on the board.",
    key: (c) => c.originY,
  },
  {
    name: "shallow",
    summary: "Prefer matches that place the new tile high on the board.",
    key: (c) => -c.originY,
  },
]

export const STRATEGY_NAMES = STRATEGIES.map((s) => s.name)

export function getStrategy(name: string): Strategy {
  const found = STRATEGIES.find((s) => s.name === name)
  if (!found) {
    throw new Error(
      `unknown strategy "${name}"; known strategies are ${STRATEGY_NAMES.join(", ")}`,
    )
  }
  return found
}

/** How several strategies are folded into one decision. */
export type CombineMode = "lexico" | "weighted"

export const COMBINE_MODES: CombineMode[] = ["lexico", "weighted"]

/** One strategy together with the priority the user gave it. */
export type WeightedStrategy = { name: string; weight: number }

export type StrategySpec = {
  strategies: WeightedStrategy[]
  combine: CombineMode
}

export const DEFAULT_SPEC: StrategySpec = {
  strategies: [{ name: "first", weight: 1 }],
  combine: "lexico",
}

/**
 * Parses a specification such as "cheapest:3,company:2,first:1".
 *
 * The weight after each colon is the priority. It defaults to one and, in
 * lexico mode, ties in weight are settled by the order written.
 */
export function parseSpec(
  text: string,
  combine: CombineMode = "lexico",
): StrategySpec {
  const strategies = text
    .split(/[,\s]+/)
    .filter((s) => s.length > 0)
    .map((part) => {
      const [name, weightText] = part.split(":")
      const weight = weightText === undefined ? 1 : Number(weightText)
      if (!Number.isFinite(weight)) {
        throw new Error(`strategy "${name}" has a non-numeric weight "${weightText}"`)
      }
      getStrategy(name) // throws on an unknown name
      return { name, weight }
    })
  if (strategies.length === 0) {
    throw new Error("no strategies given")
  }
  return { strategies, combine }
}

/** Renders a spec back to the text form `parseSpec` accepts. */
export function formatSpec(spec: StrategySpec): string {
  return spec.strategies.map((s) => `${s.name}:${s.weight}`).join(",")
}

export type Chooser = (
  candidates: Candidate[],
  ctx: StrategyContext,
) => Candidate

/**
 * Folds a spec into a single chooser.
 *
 * In `lexico` mode the strategies are applied in descending weight order, each
 * one settling the ties left by the one before it. In `weighted` mode every
 * strategy's key is rescaled onto [0,1] across the candidates on offer and the
 * results are summed with the given weights. Either way the board scan order
 * settles any remaining tie, so a run stays reproducible from its seed.
 */
export function combineStrategies(spec: StrategySpec): Chooser {
  if (spec.strategies.length === 0) {
    throw new Error("no strategies given")
  }
  const ordered =
    spec.combine === "lexico"
      ? [...spec.strategies].sort((a, b) => b.weight - a.weight)
      : spec.strategies
  const resolved = ordered.map((s) => ({
    weight: s.weight,
    strategy: getStrategy(s.name),
  }))

  if (spec.combine === "lexico") {
    return (candidates, ctx) => {
      let best = candidates[0]
      for (const c of candidates.slice(1)) {
        let better = false
        for (const { strategy } of resolved) {
          const a = strategy.key(c, ctx)
          const b = strategy.key(best, ctx)
          if (a !== b) {
            better = a > b
            break
          }
        }
        if (better) best = c
      }
      return best
    }
  }

  return (candidates, ctx) => {
    // Rescale each strategy's keys across the candidates so that weights
    // compare like with like rather than raw points against a boolean.
    const totals = new Array(candidates.length).fill(0)
    for (const { weight, strategy } of resolved) {
      const keys = candidates.map((c) => strategy.key(c, ctx))
      const min = Math.min(...keys)
      const max = Math.max(...keys)
      const span = max - min
      for (let i = 0; i < keys.length; i++) {
        totals[i] += weight * (span === 0 ? 0 : (keys[i] - min) / span)
      }
    }
    let bestIndex = 0
    for (let i = 1; i < candidates.length; i++) {
      if (totals[i] > totals[bestIndex]) bestIndex = i
    }
    return candidates[bestIndex]
  }
}
