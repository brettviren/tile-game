/**
 * Browser store for auto-play trial records.
 *
 * Backed by Capacitor Preferences, which is localStorage on the web and native
 * storage in the packaged apps, matching how the rest of the game persists.
 */
import { Preferences } from "@capacitor/preferences"
import type { TrialRecord, TrialStore } from "@/lib/trials"

const KEY = "trialResults"

/** Oldest records are dropped beyond this, to stay well inside quota. */
const MAX_RECORDS = 2000

async function readAll(): Promise<TrialRecord[]> {
  if (typeof window === "undefined") return []
  const { value } = await Preferences.get({ key: KEY })
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as TrialRecord[]) : []
  } catch {
    return []
  }
}

export const webTrialStore: TrialStore = {
  async append(records: TrialRecord[]) {
    if (records.length === 0) return
    const all = [...(await readAll()), ...records]
    const kept = all.slice(Math.max(0, all.length - MAX_RECORDS))
    await Preferences.set({ key: KEY, value: JSON.stringify(kept) })
  },

  list: readAll,

  async clear() {
    await Preferences.remove({ key: KEY })
  },
}

/** The strategy selection, remembered between visits and shared with the game. */
const SPEC_KEY = "trialStrategySpec"

export async function saveSpec(spec: unknown) {
  await Preferences.set({ key: SPEC_KEY, value: JSON.stringify(spec) })
}

export async function loadSpec<T>(fallback: T): Promise<T> {
  if (typeof window === "undefined") return fallback
  const { value } = await Preferences.get({ key: SPEC_KEY })
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
