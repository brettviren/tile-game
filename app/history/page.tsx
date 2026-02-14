"use client"
import { useEffect, useState } from "react"
import { getGameHistory, GameHistoryEntry } from "@/utils/storedState"
import { ChevronUp, ChevronDown, ArrowLeft } from "lucide-react"
import Link from "next/link"

type SortKey = keyof GameHistoryEntry
type SortOrder = "asc" | "desc"

export default function HistoryPage() {
  const [history, setHistory] = useState<GameHistoryEntry[]>([])
  const [sortKey, setSortKey] = useState<SortKey>("stopTime")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")

  useEffect(() => {
    async function fetchHistory() {
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

  return (
    <div className="flex min-h-screen flex-col items-center p-4">
      <header className="mb-8 flex w-full max-w-4xl items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
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
            </tr>
          </thead>
          <tbody>
            {sortedHistory.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
