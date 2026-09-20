"use client"
/**
 * Strategy lab: choose and prioritise auto-play strategies, run batches of
 * games, and review the results kept in the browser.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Eye,
  Play,
  Square,
  Trash2,
  X,
} from "lucide-react"
import {
  COMBINE_MODES,
  type CombineMode,
  STRATEGIES,
  type StrategySpec,
  formatSpec,
} from "@/lib/strategies"
import { seedsFor } from "@/lib/engine"
import {
  type TrialRecord,
  type Summary,
  summariseByStrategy,
} from "@/lib/trials"

const numberFormat = (n: number, places = 0) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  })

function SummaryCard({
  strategy,
  combine,
  summary,
}: {
  strategy: string
  combine: string
  summary: Summary
}) {
  const rows: [string, string][] = [
    [
      "Score",
      `${numberFormat(summary.score.mean)} ± ${numberFormat(summary.score.sd)}`,
    ],
    [
      "Moves",
      `${numberFormat(summary.moves.mean)} ± ${numberFormat(summary.moves.sd)}`,
    ],
    [
      "Time (s)",
      `${numberFormat(summary.durationMs.mean / 1000, 2)} ± ${numberFormat(
        summary.durationMs.sd / 1000,
        2,
      )}`,
    ],
    [
      "Max tile",
      `${numberFormat(Math.pow(2, summary.maxTile.max))} (value ${summary.maxTile.max})`,
    ],
  ]
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-sm">{strategy}</span>
        <span className="text-xs opacity-60">
          {combine}, {summary.count} game{summary.count === 1 ? "" : "s"}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="opacity-60">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function LabPage() {
  const router = useRouter()

  const [applied, setApplied] = useState<string[]>(["first"])
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [combine, setCombine] = useState<CombineMode>("lexico")
  const [games, setGames] = useState(1)
  const [threads, setThreads] = useState(1)
  const [baseSeed, setBaseSeed] = useState("")
  const [tag, setTag] = useState("")

  const [records, setRecords] = useState<TrialRecord[]>([])
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [error, setError] = useState<string | undefined>()
  const [stopRequested, setStopRequested] = useState(false)
  // A ref, not state: the running batch polls this between games and must see
  // the Stop button immediately rather than on the next render.
  const stopRef = useRef(false)
  const [maxThreads, setMaxThreads] = useState(1)
  const [threadsUsable, setThreadsUsable] = useState(true)

  const buildSpec = useCallback((): StrategySpec => {
    const strategies =
      combine === "lexico"
        ? applied.map((name, index) => ({
            name,
            weight: applied.length - index,
          }))
        : applied.map((name) => ({ name, weight: weights[name] ?? 1 }))
    return { strategies, combine }
  }, [applied, weights, combine])

  // Load stored results and the strategy last used.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { webTrialStore, loadSpec } = await import("@/lib/trialStoreWeb")
      const [stored, spec] = await Promise.all([
        webTrialStore.list(),
        loadSpec<StrategySpec | undefined>(undefined),
      ])
      if (cancelled) return
      setRecords(stored)
      if (spec?.strategies?.length) {
        setApplied(spec.strategies.map((s) => s.name))
        setWeights(
          Object.fromEntries(spec.strategies.map((s) => [s.name, s.weight])),
        )
        setCombine(spec.combine === "weighted" ? "weighted" : "lexico")
      }
    }
    load()

    async function probeWorkers() {
      const { workersAvailable } = await import("@/lib/labRunner")
      const usable = workersAvailable()
      if (cancelled) return
      setThreadsUsable(usable)
      setMaxThreads(
        usable ? Math.max(1, Math.min(16, navigator.hardwareConcurrency || 1)) : 1,
      )
    }
    probeWorkers()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (name: string) =>
    setApplied((current) =>
      current.includes(name)
        ? current.filter((n) => n !== name)
        : [...current, name],
    )

  const move = (index: number, by: number) =>
    setApplied((current) => {
      const target = index + by
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  async function run() {
    if (applied.length === 0) {
      setError("Choose at least one strategy.")
      return
    }
    setError(undefined)
    setRunning(true)
    setStopRequested(false)
    setCompleted(0)

    const spec = buildSpec()
    const seedText = baseSeed.trim()
    const seeds = seedsFor(
      games,
      seedText === "" ? undefined : Number(seedText),
    )

    stopRef.current = false

    try {
      const [{ runBatch }, { webTrialStore, saveSpec }] = await Promise.all([
        import("@/lib/labRunner"),
        import("@/lib/trialStoreWeb"),
      ])
      await saveSpec(spec)
      const fresh = await runBatch({
        seeds,
        spec,
        threads,
        tag: tag.trim() || undefined,
        onRecord: (record, done) => {
          setCompleted(done)
          setRecords((current) => [...current, record])
        },
        shouldStop: () => stopRef.current,
      })
      await webTrialStore.append(fresh)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
      stopRef.current = false
      setStopRequested(false)
    }
  }

  function requestStop() {
    stopRef.current = true
    setStopRequested(true)
  }

  async function clearResults() {
    const { webTrialStore } = await import("@/lib/trialStoreWeb")
    await webTrialStore.clear()
    setRecords([])
  }

  async function watchOneGame() {
    if (applied.length === 0) {
      setError("Choose at least one strategy.")
      return
    }
    const spec = buildSpec()
    const { saveSpec } = await import("@/lib/trialStoreWeb")
    await saveSpec(spec)
    sessionStorage.setItem("autoPlaySpec", JSON.stringify(spec))
    router.push("/exponentile")
  }

  const groups = summariseByStrategy(records)
  const recent = [...records].slice(-25).reverse()
  const spec = applied.length > 0 ? formatSpec(buildSpec()) : "none"

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl p-4 text-white">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/exponentile" aria-label="Back to the game">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-2xl font-medium">Strategy lab</h1>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-lg">Strategies</h2>

        {applied.length > 0 && (
          <ol className="mb-3 flex flex-col gap-1">
            {applied.map((name, index) => (
              <li
                key={name}
                className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1"
              >
                <span className="w-6 text-center text-sm opacity-60">
                  {index + 1}
                </span>
                <span className="flex-1 font-mono text-sm">{name}</span>
                {combine === "weighted" ? (
                  <input
                    type="number"
                    step="any"
                    aria-label={`Weight for ${name}`}
                    className="w-20 rounded bg-black/30 px-2 py-1 text-right text-sm"
                    value={weights[name] ?? 1}
                    onChange={(e) =>
                      setWeights((w) => ({
                        ...w,
                        [name]: Number(e.target.value),
                      }))
                    }
                  />
                ) : (
                  <>
                    <button
              type="button"
                      aria-label={`Raise ${name}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
              type="button"
                      aria-label={`Lower ${name}`}
                      disabled={index === applied.length - 1}
                      onClick={() => move(index, 1)}
                      className="disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => toggle(name)}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
        )}

        <p className="mb-2 text-xs opacity-60">
          {combine === "lexico"
            ? "Applied in the order shown; each settles the ties left by the one above it."
            : "Each preference is rescaled across the available moves, then summed with these weights."}
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {COMBINE_MODES.map((mode) => (
            <button
              type="button"
              key={mode}
              onClick={() => setCombine(mode)}
              className={`rounded-lg px-3 py-1 text-sm ${
                combine === mode ? "bg-indigo-600" : "bg-white/10"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <details className="rounded-xl border border-white/10">
          <summary className="cursor-pointer px-3 py-2 text-sm">
            Add a strategy
          </summary>
          <ul className="flex flex-col gap-1 p-2">
            {STRATEGIES.filter((s) => !applied.includes(s.name)).map((s) => (
              <li key={s.name}>
                <button
              type="button"
                  onClick={() => toggle(s.name)}
                  className="w-full rounded-lg px-2 py-1 text-left hover:bg-white/10"
                >
                  <span className="font-mono text-sm">{s.name}</span>
                  <span className="block text-xs opacity-60">{s.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg">Run</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="opacity-60">Games</span>
            <input
              type="number"
              min={1}
              className="rounded bg-black/30 px-2 py-1"
              value={games}
              onChange={(e) => setGames(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="opacity-60">
              {threadsUsable ? `Threads (max ${maxThreads})` : "Threads (1, no workers)"}
            </span>
            <input
              type="number"
              min={1}
              max={maxThreads}
              disabled={!threadsUsable}
              className="rounded bg-black/30 px-2 py-1 disabled:opacity-50"
              value={threads}
              onChange={(e) =>
                setThreads(
                  Math.min(maxThreads, Math.max(1, Number(e.target.value) || 1)),
                )
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="opacity-60">Base seed</span>
            <input
              type="number"
              placeholder="random"
              className="rounded bg-black/30 px-2 py-1"
              value={baseSeed}
              onChange={(e) => setBaseSeed(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="opacity-60">Tag</span>
            <input
              type="text"
              placeholder="optional"
              className="rounded bg-black/30 px-2 py-1"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
          </label>
        </div>

        <p className="mt-2 font-mono text-xs opacity-60">
          {spec} ({combine})
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
              type="button"
            onClick={run}
            disabled={running}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-bl from-indigo-500 to-indigo-600 px-4 py-2 font-medium disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Run {games} game{games === 1 ? "" : "s"}
          </button>
          <button
              type="button"
            onClick={requestStop}
            disabled={!running}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 disabled:opacity-40"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
          <button
              type="button"
            onClick={watchOneGame}
            disabled={running}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 disabled:opacity-40"
          >
            <Eye className="h-4 w-4" />
            Watch one game
          </button>
        </div>

        {running && (
          <p className="mt-2 text-sm opacity-80">
            {completed} of {games} finished
            {stopRequested ? ", stopping after the games in flight" : ""}
          </p>
        )}
        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg">Summary</h2>
          {records.length > 0 && (
            <button
              type="button"
              onClick={clearResults}
              className="flex items-center gap-1 text-sm opacity-60 hover:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="text-sm opacity-60">No games recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <SummaryCard
                key={`${g.strategy} ${g.combine}`}
                strategy={g.strategy}
                combine={g.combine}
                summary={g.summary}
              />
            ))}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-2 text-lg">Recent games</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left opacity-60">
                <tr>
                  <th className="py-1 pr-3 font-normal">Seed</th>
                  <th className="py-1 pr-3 text-right font-normal">Score</th>
                  <th className="py-1 pr-3 text-right font-normal">Moves</th>
                  <th className="py-1 pr-3 text-right font-normal">Time</th>
                  <th className="py-1 font-normal">Strategy</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={`${r.seed}-${r.startedAt}-${i}`} className="border-t border-white/10">
                    <td className="py-1 pr-3 font-mono">{r.seed}</td>
                    <td className="py-1 pr-3 text-right">
                      {numberFormat(r.score)}
                    </td>
                    <td className="py-1 pr-3 text-right">{r.moves}</td>
                    <td className="py-1 pr-3 text-right">
                      {(r.durationMs / 1000).toFixed(2)}s
                    </td>
                    <td className="py-1 font-mono text-xs opacity-70">
                      {r.strategy}
                      {r.tag ? ` [${r.tag}]` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
