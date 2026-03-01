"use client"
import { useEffect, useState } from "react"
import type { GameHistoryEntry } from "@/utils/storedState"
import { ChevronUp, ChevronDown, ArrowLeft, Play } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

type SortKey = keyof GameHistoryEntry
type SortOrder = "asc" | "desc"

// Mini board component to display a snapshot of the game
function MiniBoard({ board, size }: { board: number[]; size: number }) {
  const tileColors: Record<number, string> = {
    1: "#0a9396",
    2: "#e9d8a6",
    3: "#ee9b00",
    4: "#ca6702",
    5: "#005f73",
    6: "#ae2012",
    7: "#86350f",
    8: "#94d2bd",
    9: "#9b2226",
  }

  return (
    <div
      className="grid gap-0.5 p-1"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        width: "48px",
        height: "48px",
      }}
    >
      {board.slice(0, size * size).map((value, i) => (
        <div
          key={i}
          className="flex items-center justify-center rounded text-xs font-bold text-white"
          style={{
            backgroundColor: tileColors[value] || `hsl(${(value - 9) * 36} 100% 75%)`,
            aspectRatio: "1",
          }}
        >
          {value > 0 ? value : ""}
        </div>
      ))}
    </div>
  )
}

export default function HistoryPage() {
  const router = useRouter()
  const [history, setHistory] = useState<GameHistoryEntry[]>([])
  const [sortKey, setSortKey] = useState<SortKey>("stopTime")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    async function fetchHistory() {
      const { getGameHistory } = await import("@/utils/storedState")
      const h = await getGameHistory()
      setHistory(h)
    }
    fetchHistory()
  }, [])

  const sortedHistory = [...history].sort((a, b) => {
    const aVal = a[sortKey]
    const bVal = b[sortKey]
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1
    return 0
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortOrder("desc")
    }
  }

  const formatTime = (ms: number) => {
    return new Date(ms).toLocaleString()
  }

  const formatDuration = (start: number, stop: number) => {
    const ms = stop - start
    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    const hours = Math.floor(ms / (1000 * 60 * 60))
    const parts = []
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`)
    parts.push(`${seconds}s`)
    return parts.join(" ")
  }

  const SortButton = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-1 font-semibold hover:text-indigo-400"
    >
      {label}
      {sortKey === k ? (
        sortOrder === "asc" ? (
          <ChevronUp size={16} />
        ) : (
          <ChevronDown size={16} />
        )
      ) : null}
    </button>
  )

  const loadGame = (entry: GameHistoryEntry) => {
    // Store the board state in sessionStorage
    sessionStorage.setItem("loadedGameBoard", JSON.stringify(entry.board))
    sessionStorage.setItem("loadedGamePoints", entry.score.toString())
    sessionStorage.setItem("loadedGameMoves", entry.moves.toString())
    sessionStorage.setItem("loadedGameSeed", entry.seed.toString())
    sessionStorage.setItem("loadedGameStartTime", entry.startTime.toString())

    // Navigate to the game page
    router.push("/exponentile")
  }

  if (!mounted) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col items-center p-4">
      <header className="mb-8 flex w-full max-w-4xl items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href=".."
            className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-3xl font-bold">Game History</h1>
        </div>
      </header>
      <div className="w-full max-w-4xl overflow-x-auto rounded-lg border border-gray-200 shadow-sm dark:border-gray-800">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
              <th className="p-4 whitespace-nowrap">
                <SortButton k="startTime" label="Started" />
              </th>
              <th className="p-4 whitespace-nowrap">
                <SortButton k="stopTime" label="Finished" />
              </th>
              <th className="p-4 font-semibold whitespace-nowrap">Duration</th>
              <th className="p-4 whitespace-nowrap">
                <SortButton k="score" label="Score" />
              </th>
              <th className="p-4 whitespace-nowrap">
                <SortButton k="moves" label="Moves" />
              </th>
              <th className="p-4 whitespace-nowrap">
                <SortButton k="seed" label="Seed" />
              </th>
              <th className="p-4 whitespace-nowrap text-center">Board</th>
            </tr>
          </thead>
          <tbody>
            {sortedHistory.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  No games played yet.
                </td>
              </tr>
            ) : (
              sortedHistory.map((entry, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30"
                >
                  <td className="p-4 whitespace-nowrap text-sm">
                    {formatTime(entry.startTime)}
                  </td>
                  <td className="p-4 whitespace-nowrap text-sm">
                    {formatTime(entry.stopTime)}
                  </td>
                  <td className="p-4 whitespace-nowrap text-sm">
                    {formatDuration(entry.startTime, entry.stopTime)}
                  </td>
                  <td className="p-4 font-medium">
                    {entry.score.toLocaleString()}
                  </td>
                  <td className="p-4">{entry.moves.toLocaleString()}</td>
                  <td className="p-4 font-mono text-xs">{entry.seed}</td>
                  <td className="p-4">
                    <button
                      onClick={() => loadGame(entry)}
                      className="flex items-center justify-center gap-1 rounded bg-indigo-600 hover:bg-indigo-700 p-2 transition-colors"
                      title="Load this game"
                    >
                      <MiniBoard
                        board={entry.board}
                        size={8}
                      />
                      <Play size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
