import { expect, test } from "vitest"
import {
  type Board,
  type MatchedTile,
  moveTilesDown,
} from "@/hooks/useBoard"

// board[x][y]: x is the column, y grows downward from the top.
function testBoard(): Board {
  return Array.from({ length: 3 }, (_, x) =>
    Array.from({ length: 3 }, (_, y) => ({
      id: 3 * y + x,
      value: y + 1,
      removed: false as const,
    })),
  )
}

// Fresh tiles take value floor(0 * 4) + 1.
const alwaysZero = () => 0

test("removed tiles are marked and the survivors fall", () => {
  const board = testBoard()
  const match: MatchedTile = {
    newValue: 9,
    origin: { x: 1, y: 0 },
    matchedTiles: [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
    match: true,
  }

  const [marked, after] = moveTilesDown([match], board, alwaysZero)

  expect(marked[1][1].removed).toBe(true)
  expect(marked[1][2].removed).toBe(true)
  expect(marked[0][1].removed).toBe(false)

  // The seed tile falls to the bottom of the run it cleared.
  expect(after[1][2].id).toBe(board[1][0].id)
  // Its holes are refilled from the top.
  expect(after[1][0].value).toBe(1)
  expect(after[1][1].value).toBe(1)
  // Untouched columns are left alone.
  expect(after[0]).toEqual(board[0])
  expect(after[2]).toEqual(board[2])
})

test("a horizontal match drops one tile in each affected column", () => {
  const board = testBoard()
  const match: MatchedTile = {
    newValue: 4,
    origin: { x: 0, y: 2 },
    matchedTiles: [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ],
    match: true,
  }

  const [, after] = moveTilesDown([match], board, alwaysZero)

  for (const x of [1, 2]) {
    expect(after[x][2].id).toBe(board[x][1].id)
    expect(after[x][1].id).toBe(board[x][0].id)
    expect(after[x][0].value).toBe(1)
  }
  expect(after[0]).toEqual(board[0])
})
