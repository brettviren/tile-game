/**
 * Command line auto-play runner.
 *
 * Plays complete games under a chosen combination of strategies, stores each
 * result and reports summaries. Usually reached through the `exponentile-trials`
 * shell script, which owns the help text; this module accepts the same long
 * options so that `deno task trials -- ...` works directly.
 */
import { playGame, seedsFor } from "@/lib/engine"
import {
  COMBINE_MODES,
  type CombineMode,
  STRATEGIES,
  formatSpec,
  parseSpec,
} from "@/lib/strategies"
import {
  type Stat,
  type TrialRecord,
  summarise,
  summariseByStrategy,
} from "@/lib/trials"
import { DEFAULT_STORE_PATH, createFsStore } from "@/scripts/trialStoreFs"
import type { WorkerRequest, WorkerResponse } from "@/scripts/trialWorkerTypes"

type Options = {
  command: string
  games: number
  threads: number
  strategy: string
  combine: CombineMode
  seed?: number
  size: number
  maxMoves: number
  store: string
  tag?: string
  verbose: boolean
  quiet: boolean
  json: boolean
  noStore: boolean
}

const USAGE = `usage: deno task trials -- <command> [options]

Run "exponentile-trials --help" for the full description.

commands:   run  list  summary  strategies  clear`

function parseArgs(argv: string[]): Options {
  const options: Options = {
    command: "run",
    games: 1,
    threads: 1,
    strategy: "first",
    combine: "lexico",
    size: 8,
    maxMoves: 100000,
    store: DEFAULT_STORE_PATH,
    verbose: false,
    quiet: false,
    json: false,
    noStore: false,
  }
  const rest: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--") continue // the separator `deno task` inserts
    if (!arg.startsWith("--")) {
      rest.push(arg)
      continue
    }
    const eq = arg.indexOf("=")
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    const inline = eq === -1 ? undefined : arg.slice(eq + 1)
    const value = () => {
      if (inline !== undefined) return inline
      const next = argv[++i]
      if (next === undefined) throw new Error(`option --${name} needs a value`)
      return next
    }
    const number = (what: string) => {
      const n = Number(value())
      if (!Number.isFinite(n)) throw new Error(`--${name} needs ${what}`)
      return n
    }

    switch (name) {
      case "games": options.games = number("a count"); break
      case "threads": options.threads = number("a count"); break
      case "strategy": options.strategy = value(); break
      case "combine": options.combine = value() as CombineMode; break
      case "seed": options.seed = number("a number"); break
      case "size": options.size = number("a number"); break
      case "max-moves": options.maxMoves = number("a number"); break
      case "store": options.store = value(); break
      case "tag": options.tag = value(); break
      case "verbose": options.verbose = true; break
      case "quiet": options.quiet = true; break
      case "json": options.json = true; break
      case "no-store": options.noStore = true; break
      case "help": console.log(USAGE); Deno.exit(0); break
      default: throw new Error(`unknown option --${name}`)
    }
  }

  if (rest.length > 1) {
    throw new Error(`expected one command, got: ${rest.join(" ")}`)
  }
  if (rest.length === 1) options.command = rest[0]
  if (!COMBINE_MODES.includes(options.combine)) {
    throw new Error(
      `unknown combine mode "${options.combine}"; use ${COMBINE_MODES.join(" or ")}`,
    )
  }
  if (options.games < 1) throw new Error("--games must be at least one")
  if (options.threads < 1) throw new Error("--threads must be at least one")
  return options
}

const round = (n: number, places = 0) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  })

const meanSd = (s: Stat, places = 0) =>
  `${round(s.mean, places)} +/- ${round(s.sd, places)}`

function reportSummary(records: TrialRecord[], json: boolean) {
  if (records.length === 0) {
    console.log("no results stored")
    return
  }
  if (json) {
    console.log(JSON.stringify(summariseByStrategy(records), null, 2))
    return
  }
  console.log()
  for (const group of summariseByStrategy(records)) {
    const s = group.summary
    console.log(`${group.strategy}  (${group.combine}, ${s.count} games)`)
    console.log(`  score     ${meanSd(s.score)}   median ${round(s.score.median)}   range ${round(s.score.min)} .. ${round(s.score.max)}`)
    console.log(`  moves     ${meanSd(s.moves)}   median ${round(s.moves.median)}   range ${round(s.moves.min)} .. ${round(s.moves.max)}`)
    console.log(`  time (s)  ${meanSd({ ...s.durationMs, mean: s.durationMs.mean / 1000, sd: s.durationMs.sd / 1000 }, 2)}   total ${round((s.durationMs.mean * s.count) / 1000, 1)}`)
    console.log(`  max tile  ${meanSd(s.maxTile, 1)}   best ${round(s.maxTile.max)} (${round(Math.pow(2, s.maxTile.max))})`)
    console.log()
  }
}

function reportList(records: TrialRecord[], json: boolean) {
  if (json) {
    console.log(JSON.stringify(records, null, 2))
    return
  }
  if (records.length === 0) {
    console.log("no results stored")
    return
  }
  console.log(
    ["seed".padStart(10), "score".padStart(10), "moves".padStart(7), "time(s)".padStart(8), "maxtile".padStart(8), "when".padStart(20), "strategy"].join("  "),
  )
  for (const r of records) {
    console.log(
      [
        String(r.seed).padStart(10),
        round(r.score).padStart(10),
        String(r.moves).padStart(7),
        (r.durationMs / 1000).toFixed(2).padStart(8),
        String(r.maxTile).padStart(8),
        new Date(r.startedAt).toISOString().slice(0, 19).replace("T", " ").padStart(20),
        `${r.strategy}${r.tag ? ` [${r.tag}]` : ""}`,
      ].join("  "),
    )
  }
}

/** Plays the batch in this process, reporting each game as it finishes. */
function runSerial(
  seeds: number[],
  options: Options,
  spec: ReturnType<typeof parseSpec>,
  onRecord: (r: TrialRecord, i: number) => void,
): TrialRecord[] {
  const records: TrialRecord[] = []
  for (const [index, seed] of seeds.entries()) {
    const { board: _board, ...record } = playGame({
      seed,
      spec,
      size: options.size,
      maxMoves: options.maxMoves,
      tag: options.tag,
      onMove: options.verbose
        ? (m) =>
            console.log(
              `  seed ${seed} move ${String(m.move).padStart(4)}  ${m.from.x},${m.from.y} <-> ${m.to.x},${m.to.y}  k=${m.k} -> ${m.newVal}  +${m.points}  total ${m.score}`,
            )
        : undefined,
    })
    records.push(record)
    onRecord(record, index)
  }
  return records
}

/** Plays the batch across a pool of workers. */
function runConcurrent(
  seeds: number[],
  options: Options,
  spec: ReturnType<typeof parseSpec>,
  onRecord: (r: TrialRecord, i: number) => void,
): Promise<TrialRecord[]> {
  return new Promise((resolve, reject) => {
    const records: TrialRecord[] = []
    const workerCount = Math.min(options.threads, seeds.length)
    const workers: Worker[] = []
    let next = 0
    let done = 0

    const shutdown = () => workers.forEach((w) => w.terminate())

    const dispatch = (worker: Worker) => {
      if (next >= seeds.length) return
      const seed = seeds[next++]
      worker.postMessage({
        seed,
        spec,
        size: options.size,
        maxMoves: options.maxMoves,
        tag: options.tag,
      } satisfies WorkerRequest)
    }

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(import.meta.resolve("./trialWorker.ts"), {
        type: "module",
      })
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data
        if ("error" in message) {
          shutdown()
          reject(new Error(message.error))
          return
        }
        records.push(message.record)
        onRecord(message.record, done)
        done++
        if (done === seeds.length) {
          shutdown()
          resolve(records)
          return
        }
        dispatch(worker)
      }
      worker.onerror = (event) => {
        shutdown()
        reject(new Error(String(event.message ?? "worker failed")))
      }
      workers.push(worker)
    }
    workers.forEach(dispatch)
  })
}

async function main() {
  let options: Options
  try {
    options = parseArgs(Deno.args)
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : error}`)
    console.error(USAGE)
    Deno.exit(2)
  }

  const store = createFsStore(options.store)

  switch (options.command) {
    case "strategies": {
      if (options.json) {
        console.log(JSON.stringify(STRATEGIES.map((s) => ({ name: s.name, summary: s.summary })), null, 2))
        return
      }
      const width = Math.max(...STRATEGIES.map((s) => s.name.length))
      for (const s of STRATEGIES) {
        console.log(`  ${s.name.padEnd(width)}  ${s.summary}`)
      }
      console.log()
      console.log(`combine modes: ${COMBINE_MODES.join(", ")}`)
      return
    }

    case "list":
      reportList(await store.list(), options.json)
      return

    case "summary":
      reportSummary(await store.list(), options.json)
      return

    case "clear":
      await store.clear()
      console.log(`cleared ${options.store}`)
      return

    case "run":
      break

    default:
      console.error(`error: unknown command "${options.command}"`)
      console.error(USAGE)
      Deno.exit(2)
  }

  let spec
  try {
    spec = parseSpec(options.strategy, options.combine)
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : error}`)
    Deno.exit(2)
  }

  const seeds = seedsFor(options.games, options.seed)
  if (!options.quiet) {
    console.log(
      `playing ${options.games} game${options.games === 1 ? "" : "s"} with ${formatSpec(spec)} (${spec.combine})` +
        `${options.threads > 1 ? ` on ${options.threads} threads` : ""}`,
    )
  }

  const report = (r: TrialRecord, index: number) => {
    if (options.quiet) return
    console.log(
      `[${String(index + 1).padStart(String(options.games).length)}/${options.games}] ` +
        `seed ${String(r.seed).padStart(7)}  score ${round(r.score).padStart(10)}  ` +
        `moves ${String(r.moves).padStart(5)}  ${(r.durationMs / 1000).toFixed(2)}s` +
        `${r.finished ? "" : "  (hit move limit)"}`,
    )
  }

  const started = performance.now()
  const records =
    options.threads > 1
      ? await runConcurrent(seeds, options, spec, report)
      : runSerial(seeds, options, spec, report)
  const elapsed = (performance.now() - started) / 1000

  if (!options.noStore) await store.append(records)

  if (options.json) {
    console.log(JSON.stringify({ records, summary: summarise(records) }, null, 2))
    return
  }
  if (!options.quiet) {
    console.log(`\nwall clock ${elapsed.toFixed(2)}s${options.noStore ? "" : `, appended to ${options.store}`}`)
  }
  reportSummary(records, false)
}

if (import.meta.main) {
  await main()
}
