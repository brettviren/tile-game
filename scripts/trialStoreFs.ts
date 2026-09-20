/**
 * File system store for auto-play trial records.
 *
 * Records are kept as newline delimited JSON, one game per line, so that a run
 * can append as it goes and concurrent workers cannot lose each other's rows.
 */
import type { TrialRecord, TrialStore } from "@/lib/trials"

export const DEFAULT_STORE_PATH = "trials.ndjson"

export function createFsStore(path: string = DEFAULT_STORE_PATH): TrialStore {
  return {
    async append(records: TrialRecord[]) {
      if (records.length === 0) return
      const text = records.map((r) => JSON.stringify(r)).join("\n") + "\n"
      await Deno.writeTextFile(path, text, { append: true, create: true })
    },

    async list(): Promise<TrialRecord[]> {
      let text: string
      try {
        text = await Deno.readTextFile(path)
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) return []
        throw error
      }
      const records: TrialRecord[] = []
      for (const [index, line] of text.split("\n").entries()) {
        if (line.trim().length === 0) continue
        try {
          records.push(JSON.parse(line) as TrialRecord)
        } catch {
          console.error(`${path}:${index + 1}: skipping unreadable record`)
        }
      }
      return records
    },

    async clear() {
      try {
        await Deno.remove(path)
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error
      }
    },
  }
}
