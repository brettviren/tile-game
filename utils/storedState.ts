import { Preferences } from "@capacitor/preferences"
import { getCookie, removeCookie } from "./cookies"
import {
  Board,
  GameState,
  getGameStateAsString,
  getStateFromString,
  RandomFunc, // New: Import RandomFunc type
} from "@/hooks/useBoard"
import { createSeededRandom } from "@/utils/seededRandom" // New: Import createSeededRandom

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
  isPaused: boolean = false, // New parameter
  pausedAccumulatedTime: number = 0, // New parameter
  lastUnpausedTime?: number, // New parameter
) {
  const gameStateString = getGameStateAsString(
    board,
    points,
    moves,
    startTime,
    seed,
    duration,
    isPaused,
    pausedAccumulatedTime,
    lastUnpausedTime,
  )
  await saveToPersistedState({ key: "gameState", value: gameStateString })
}

export async function getGameState(): Promise<GameState | undefined> {
  const gameStateString = await getFromPersistedState({ key: "gameState" })
  if (!gameStateString) {
    return undefined
  }
  
  // Temporarily parse the string to get the seed
  let tempGameState: GameState;
  try {
    const decodedString = decodeURIComponent(gameStateString);
    tempGameState = JSON.parse(decodedString);
  } catch (e) {
    console.error("Error parsing gameStateString:", e);
    return undefined;
  }

  // Ensure a seed exists; if not, generate a new random one
  // Note: if tempGameState.seed is undefined, it means an old game state without seed was saved.
  // In this case, we'll generate a random seed for determinism in reconstructing that old board.
  const seedToUse = tempGameState.seed ?? Math.floor(Math.random() * 1000000);
  const seededRandomFunc: RandomFunc = createSeededRandom(seedToUse);

  return getStateFromString(gameStateString, seededRandomFunc)
}