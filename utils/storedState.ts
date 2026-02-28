import { Preferences } from "@capacitor/preferences"
import { getCookie, removeCookie } from "./cookies"
import {
  Board,
  GameState,
  getGameStateAsString,
  getStateFromString,
} from "@/hooks/useBoard"

export type GameHistoryEntry = {
  startTime: number
  stopTime: number
  score: number
  moves: number
  seed: number
  board: number[] // Serialized board values
}

export async function saveToPersistedState({
  key,
  value,
}: {
  key: string
  value: string
}) {
  await Preferences.set({
    key,
    value,
  })
}

export async function getFromPersistedState({
  key,
}: {
  key: string
}): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined
  const cookieValue = getCookie(key)
  if (cookieValue) {
    // Migrating away from cookies. If there's a value, we'll move it to preferences (localStorage on web) and remove it from cookies.
    // Next time the value is requested, it will only exist in preferences.
    await saveToPersistedState({
      key,
      value: cookieValue,
    })
    removeCookie(key)
    return cookieValue
  }
  return (await Preferences.get({ key })).value ?? undefined
}

export async function setHighscore(highscore: number) {
  await saveToPersistedState({
    key: "highscore",
    value: highscore.toString(),
  })
}

export async function getHighscore(): Promise<number> {
  const highscoreString = await getFromPersistedState({ key: "highscore" })
  return parseInt(highscoreString ?? "0")
}

export async function isTutorialDone() {
  return Boolean(await getFromPersistedState({ key: "doneTutorial" }))
}

export async function finishedTutorial() {
  await saveToPersistedState({
    key: "doneTutorial",
    value: "true",
  })
}

export async function saveGameToHistory(entry: GameHistoryEntry) {
  const historyString = await getFromPersistedState({ key: "gameHistory" })
  const history: GameHistoryEntry[] = historyString
    ? JSON.parse(historyString)
    : []
  history.push(entry)
  await saveToPersistedState({
    key: "gameHistory",
    value: JSON.stringify(history),
  })
}

export async function getGameHistory(): Promise<GameHistoryEntry[]> {
  const historyString = await getFromPersistedState({ key: "gameHistory" })
  if (!historyString) return []
  try {
    return JSON.parse(historyString)
  } catch (e) {
    return []
  }
}

export async function saveGameState(
  board: Board,
  points: number,
  moves: number,
  startTime?: number,
  seed?: number,
  duration?: number,
) {
  const gameStateString = getGameStateAsString(
    board,
    points,
    moves,
    startTime,
    seed,
    duration,
  )
  await saveToPersistedState({ key: "gameState", value: gameStateString })
}

export async function getGameState(): Promise<GameState | undefined> {
  const gameStateString = await getFromPersistedState({ key: "gameState" })
  if (!gameStateString) {
    return undefined
  }
  return getStateFromString(gameStateString)
}
