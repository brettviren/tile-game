"use client"
import {
  Board,
  BoardPoints,
  Position,
  copyBoard,
  generateBoard,
  useBoard,
  getRandomTile,
  RandomFunc, // Import RandomFunc type
  getStateFromString, // Import getStateFromString
  GameState, // Import GameState type
} from "@/hooks/useBoard"
import { createSeededRandom } from "@/utils/seededRandom" // Import createSeededRandom
import {
  motion,
  AnimatePresence,
  Transition,
  useAnimate,
  AnimationSequence,
  PanInfo,
} from "framer-motion"
import { CapacitorGameConnect } from "@openforge/capacitor-game-connect"
import { Capacitor } from "@capacitor/core"
import { useEffect, useRef, useState } from "react"
import Tile from "./Tile"
import Tutorial from "./Tutorial"
import Settings from "./Settings"
import { AnimationSpeeds, useSettings } from "@/hooks/useSettings"
import {
  getGameState,
  getHighscore,
  saveGameState,
  saveGameToHistory,
  saveToPersistedState,
  setHighscore,
  getFromPersistedState, // Import getFromPersistedState
} from "@/utils/storedState"
import { boardContains2048Tile } from "@/utils/achievements"
import Button from "./Button"
import ShareButton from "./ShareButton"
import Link from "next/link"
import { History, Volume2, VolumeX, Maximize, Minimize } from "lucide-react"
import { useAudioPlayer } from "@/hooks/useAudioPlayer"

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
const AUDIO_FILES = [
  `${basePath}/sounds/blop1.mp3`,
  `${basePath}/sounds/blop2.mp3`,
  `${basePath}/sounds/blop3.mp3`,
]

function Timer({
  startTime,
  duration,
  formatTime,
  isPaused,
  togglePause,
  pausedAccumulatedTime, // New prop
  lastUnpausedTime, // New prop
}: {
  startTime: number
  duration?: number
  formatTime: (ms: number) => string
  isPaused: boolean
  togglePause: () => void
  pausedAccumulatedTime: number // New prop
  lastUnpausedTime: number | undefined // New prop
}) {
  const [elapsed, setElapsed] = useState<number>(0)

  useEffect(() => {
    let intervalId: number | undefined
    if (duration === undefined && !isPaused) {
      // Calculate elapsed time based on accumulated and current active segment
      const currentElapsed =
        pausedAccumulatedTime +
        (lastUnpausedTime ? Date.now() - lastUnpausedTime : 0)
      setElapsed(currentElapsed)

      intervalId = window.setInterval(() => {
        const currentElapsed =
          pausedAccumulatedTime +
          (lastUnpausedTime ? Date.now() - lastUnpausedTime : 0)
        setElapsed(currentElapsed)
      }, 1000)
    } else if (duration !== undefined) {
      setElapsed(duration)
    } else if (isPaused) {
      // When paused, display the accumulated time
      setElapsed(pausedAccumulatedTime)
    }
    return () => window.clearInterval(intervalId)
  }, [startTime, duration, isPaused, pausedAccumulatedTime, lastUnpausedTime]) // Added new dependencies

  return (
    <button
      className={`text-xl font-medium ${isPaused ? "text-gray-500" : ""}`}
      onClick={togglePause}
    >
      {formatTime(elapsed)}
    </button>
  )
}

export default function Game() {
  const [board, setBoard] = useState<Board>([] as any) // Initialize with an empty array or loading state
  const [points, setPoints] = useState(0)
  const [moves, setMoves] = useState(0)
  const [seed, setSeed] = useState<number | undefined>(undefined) // Declare seed first
  const [startTime, setStartTime] = useState<number | undefined>(undefined)
  const [duration, setDuration] = useState<number | undefined>(undefined)

  // New state variables for accurate timer
  const [pausedAccumulatedTime, setPausedAccumulatedTime] = useState<number>(0)
  const [lastUnpausedTime, setLastUnpausedTime] = useState<number | undefined>(
    undefined,
  )

  const [isPaused, setIsPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previousState, setPreviousState] = useState<{
    board: Board
    points: number
    moves: number
  } | undefined>(undefined)

  const { play } = useAudioPlayer(AUDIO_FILES)
  const [muted, setMuted] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(
          `Error attempting to enable full-screen mode: ${err.message}`,
        )
      })
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  // --- Start of togglePause function ---
  const togglePause = () => {
    if (isPaused) {
      // Unpausing
      setLastUnpausedTime(Date.now())
    } else {
      // Pausing
      if (lastUnpausedTime !== undefined) {
        setPausedAccumulatedTime(
          (prev) => prev + (Date.now() - lastUnpausedTime),
        )
      }
      setLastUnpausedTime(undefined) // Indicate it's paused
    }
    setIsPaused((prev) => !prev)
  }
  // --- End of togglePause function ---

  useEffect(() => {
    async function initSavedState() {
      // Check URL for seed parameter first
      const urlParams = new URLSearchParams(window.location.search);
      const urlSeed = urlParams.get("seed");
      let initialSeed: number | undefined = undefined;

      if (urlSeed) {
        initialSeed = parseInt(urlSeed);
        if (isNaN(initialSeed)) {
          console.warn("Invalid seed provided in URL, generating a random one.");
          initialSeed = Math.floor(Math.random() * 1000000);
        }
      }

      const loadedBoard = sessionStorage.getItem("loadedGameBoard")
      const loadedPoints = sessionStorage.getItem("loadedGamePoints")
      const loadedMoves = sessionStorage.getItem("loadedGameMoves")
      const loadedSeed = sessionStorage.getItem("loadedGameSeed")
      const loadedStartTime = sessionStorage.getItem("loadedGameStartTime")
      const loadedPausedAccumulatedTime = sessionStorage.getItem(
        "loadedPausedAccumulatedTime",
      )

      if (loadedBoard && loadedPoints && loadedMoves && loadedSeed && loadedStartTime) {
        // Use URL seed if present, otherwise use loaded seed
        const seedToUse = initialSeed ?? parseInt(loadedSeed);
        setSeed(seedToUse); // Set the seed state

        const seededRandomFunc = createSeededRandom(seedToUse);

        // Load the game from history, using the seeded random function
        const boardValues = JSON.parse(loadedBoard);
        const size = 8;
        const board: Board = Array.from({ length: size }, (_, y) =>
          Array.from({ length: size }, (_, x) => {
            const index = y * size + x;
            return {
              ...getRandomTile(seededRandomFunc), // Use seeded getRandomTile
              value: boardValues[index],
            };
          }),
        );

        setBoard(board);
        setPoints(parseInt(loadedPoints));
        setMoves(parseInt(loadedMoves));
        setStartTime(parseInt(loadedStartTime));
        setPausedAccumulatedTime(parseInt(loadedPausedAccumulatedTime ?? "0"));
        setDuration(0); // Force game over state
        setIsLoadedFromHistory(true); // Force game over screen

        // Clear the loaded game flags
        sessionStorage.removeItem("loadedGameBoard");
        sessionStorage.removeItem("loadedGamePoints");
        sessionStorage.removeItem("loadedGameMoves");
        sessionStorage.removeItem("loadedGameSeed");
        sessionStorage.removeItem("loadedGameStartTime");
        sessionStorage.removeItem("loadedPausedAccumulatedTime");


        setLoading(false);
        return;
      }
      
      const rawGameStateString = await getFromPersistedState({ key: "gameState" }); // Get the raw string
      if (!rawGameStateString) { // No saved game data
        // If no saved state, use URL seed or generate a new random one
        const newSeed = initialSeed ?? Math.floor(Math.random() * 1000000);
        setSeed(newSeed); // Set the seed state
        // No board to load, so useBoard will generate a new one with this seed.
        setLoading(false);
        return;
      }

      // Parse the raw game state string to get the GameState object and extract the seed
      let parsedGameState: GameState;
      try {
        parsedGameState = JSON.parse(decodeURIComponent(rawGameStateString));
      } catch (e) {
        console.error("Error parsing rawGameStateString:", e);
        setLoading(false);
        return;
      }

      // If saved state, use URL seed if present, otherwise use saved seed
      const seedToUse = initialSeed ?? parsedGameState.seed ?? Math.floor(Math.random() * 1000000);
      setSeed(seedToUse); // Set the seed state

      // When loading gameState, use the getStateFromString function which now takes randomFunc
      const seededRandomFunc = createSeededRandom(seedToUse);
      const loadedGameState = getStateFromString(rawGameStateString, seededRandomFunc);
      
      setBoard(loadedGameState.board);
      setPoints(loadedGameState.points);
      setMoves(loadedGameState.moves);
      setStartTime(loadedGameState.startTime);
      setDuration(loadedGameState.duration);
      setPausedAccumulatedTime(loadedGameState.pausedAccumulatedTime || 0);
      if (!loadedGameState.isPaused) {
        setLastUnpausedTime(Date.now());
      } else {
        setIsPaused(true);
      }
      setLoading(false);
    }
    initSavedState();
  }, []);

  const {
    board: initialBoardFromHook, // Renamed to avoid conflict with local 'board' state
    isAdjacent,
    swapTile: seededSwapTile, // Renamed to use the seeded version
    getPositionsThatAlmostMatch,
    isGameOver,
  } = useBoard(8, seed) // Pass the seed here

  // Update the board state once initialBoardFromHook is available and not loading
  useEffect(() => {
    if (!loading && seed !== undefined && board.length === 0) { // Only set if board is empty
      setBoard(initialBoardFromHook);
    }
  }, [loading, seed, initialBoardFromHook, board.length]);


  const [animating, setAnimating] = useState(false)
  const [selectedFrom, setSelectedFrom] = useState<Position | undefined>(
    undefined,
  )
  const [boardsHistory, setBoardsHistory] = useState<BoardPoints[]>([
    { board, points: 0 },
  ])

  const [debug, setDebug] = useState(false)

  const [gameOverClosed, setGameOverClosed] = useState(false)

  const [player, setPlayer] = useState<
    { player_name: string; player_id: string } | undefined
  >()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }
    async function getPlayer() {
      const player = await CapacitorGameConnect.signIn()
      setPlayer(player)
    }
    getPlayer()
  }, [])

  const [highscore, initialiseHighscore] = useState<number>(0)
  const [isLoadedFromHistory, setIsLoadedFromHistory] = useState(false)

  useEffect(() => {
    async function initHighScore() {
      initialiseHighscore(await getHighscore())
    }
    initHighScore()
  }, [])

  const { animationSpeed, setAnimationSpeed, gamePosition, setGamePosition } =
    useSettings()

  useEffect(() => {
    if (
      !animating &&
      isGameOver(board) &&
      startTime &&
      duration === undefined
    ) {
      // Calculate final duration based on accumulated active time
      let finalDuration = pausedAccumulatedTime;
      if (!isPaused && lastUnpausedTime) {
        finalDuration += Date.now() - lastUnpausedTime;
      }
      setDuration(finalDuration)

      // Serialize board to a simple array of values
      const boardValues = board.flat().map((tile) => tile.value)

      const entry = {
        startTime,
        stopTime: Date.now(), // Use current time as stop time
        score: points,
        seed: seed ?? 0, // Ensure seed is always a number for saving
        moves,
        board: boardValues,
      }
      saveGameToHistory(entry)
    }
  }, [board, animating, startTime, duration, isGameOver, points, moves, seed, isPaused, pausedAccumulatedTime, lastUnpausedTime]) // Added new dependencies


  function formatTime(ms: number) {
    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    const hours = Math.floor(ms / (1000 * 60 * 60))

    const parts = []
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`)
    parts.push(`${seconds}s`)
    return parts.join(" ")
  }
  const animationDuration = AnimationSpeeds[animationSpeed]

  const transition: Transition = { type: "spring", duration: animationDuration }

  async function onPanEnd(
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
    { x, y }: Position,
  ) {
    if (animating || isPaused) {
      return
    }
    const offsetX = Math.abs(info.offset.x)
    const offsetY = Math.abs(info.offset.y)
    let swipeToPosition: undefined | Position = undefined
    if (offsetX > offsetY) {
      swipeToPosition = info.offset.x > 0 ? { x: x + 1, y } : { x: x - 1, y }
    } else {
      swipeToPosition = info.offset.y > 0 ? { y: y + 1, x } : { y: y - 1, x }
    }
    setSelectedFrom(undefined)
    await handleSwapTiles({ x, y }, swipeToPosition) // Use the new handleSwapTiles
  }

  async function handleSwapTiles(a: Position, b: Position) { // Renamed from swapTiles
    if (moves === 0 && !startTime) {
      setStartTime(Date.now())
      setLastUnpausedTime(Date.now()) // Initialize lastUnpausedTime on first move
      // No need to set seed here, it's already managed by useEffect or resetBoard
    }
    setPreviousState({ board, points, moves })
    // Use the seededSwapTile returned from useBoard
    const boards = seededSwapTile(a, b, board) 
    setMoves((moves) => moves + 1)
    setAnimating(true)
    const newBoardsHistory = [...boardsHistory, ...boards]
    setBoardsHistory(newBoardsHistory)
    let soundsPlayed = 0
    for (const [index, newBoard] of boards.entries()) {
      setBoard(newBoard.board)
      if (newBoard.points > 0 && !muted) {
        play(Math.min(Math.pow(2, 0.4 * soundsPlayed), 2.5))
        soundsPlayed++
      }
      setPoints((currentPoints) => currentPoints + newBoard.points)
      if (index < boards.length - 1) {
        await new Promise((r) => setTimeout(r, animationDuration * 1000 + 100))
      }
    }
    if (boardContains2048Tile(board)) {
      // There's a bug with this achievement that causes the leaderboards/achievements to crash.
      // For now we'll just save it. We can award the user when the bug is fixed.
      // This guy seems to have the same problem: https://stackoverflow.com/questions/77574849/gamekit-not-showing-with-swiftui
      // (We don't await this, cause we don't want the animations delayed)
      saveToPersistedState({ key: "2048achievement", value: "true" })
    }

    setAnimating(false)
  }

  function undo() {
    if (!previousState || animating) {
      return
    }
    const currentState = { board, points, moves }
    setBoard(previousState.board)
    setPoints(previousState.points)
    setMoves(previousState.moves)
    setPreviousState(currentState)
  }

  async function clickTile(position: Position) {
    if (animating || isPaused) {
      return
    }
    if (!selectedFrom) {
      setSelectedFrom(position)
      return
    }
    if (
      (selectedFrom.x == position.x && selectedFrom.y == position.y) ||
      !isAdjacent(selectedFrom, position)
    ) {
      setSelectedFrom(undefined)
      return
    }
    await handleSwapTiles(selectedFrom, position) // Use the new handleSwapTiles
    setSelectedFrom(undefined)
  }

  useEffect(() => {
    if (animating) {
      return
    }
    // Save game state including new timer variables
    saveGameState(
      board,
      points,
      moves,
      startTime,
      seed,
      duration,
      isPaused, // New: save isPaused state
      pausedAccumulatedTime, // New: save accumulated time
      lastUnpausedTime, // New: save lastUnpausedTime
    )
    async function checkHighscore() {
      if (!animating && !debug) {
        const highscore = await getHighscore()
        if (highscore < points) {
          await setHighscore(points)
          initialiseHighscore(points)
        }
      }
      if (isGameOver(board)) {
        if (player && animationSpeed == "instant") {
          await CapacitorGameConnect.unlockAchievement({
            achievementID: "speedDemon",
          })
        }
        if (highscore < points && Capacitor.getPlatform() == "ios") {
          await CapacitorGameConnect.submitScore({
            leaderboardID: "exponentile",
            totalScoreAmount: highscore,
          })
        }
      }
    }
    checkHighscore()
  }, [
    board,
    points,
    animating,
    startTime,
    seed,
    duration,
    animationSpeed,
    debug,
    highscore,
    isGameOver,
    moves,
    player,
    isPaused, // New dependency
    pausedAccumulatedTime, // New dependency
    lastUnpausedTime, // New dependency
  ])
  useEffect(() => {
    // Sync score with leaderboards, in case they got a highscore while offline.
    // also sometimes submitting scores just don't work
    async function checkIfLeaderboardsScoreCorrect() {
      const highscore = await getHighscore()
      const highscoreFromLeaderboards =
        await CapacitorGameConnect.getUserTotalScore({
          leaderboardID: "exponentile",
        })
      if (highscoreFromLeaderboards.player_score < highscore) {
        await CapacitorGameConnect.submitScore({
          leaderboardID: "exponentile",
          totalScoreAmount: highscore,
        })
      }
    }
    if (player) {
      checkIfLeaderboardsScoreCorrect()
    }
  }, [player])

  function getExitTo({ x, y }: Position): Position | undefined {
    const tile = board[x][y]
    if (!grid.current) {
      return
    }
    const gridGap = parseInt(
      getComputedStyle(grid.current).gap.replace("px", ""),
    )
    const tileWidth = parseInt(
      getComputedStyle(grid.current.children[0]).width.replace("px", ""),
    )
    const size = gridGap + tileWidth
    if (!tile.removed) {
      return undefined
    }
    return {
      x: (x - tile.mergedTo.x) * -size,
      y: (y - tile.mergedTo.y) * -size,
    }
  }
  const [grid, animate] = useAnimate()

  function resetBoard(): void {
    const newSeed = Math.floor(Math.random() * 1000000)
    setSeed(newSeed) // Set the component's seed state

    const seededRandomFunc = createSeededRandom(newSeed);
    const newBoard = generateBoard(8, seededRandomFunc) // Use seeded generateBoard

    saveGameState(newBoard, 0, 0, undefined, newSeed) // Reset timer variables
    setGameOverClosed(false)
    setIsLoadedFromHistory(false)
    setPoints(0)
    setMoves(0)
    setStartTime(undefined)
    setDuration(undefined)
    setPausedAccumulatedTime(0) // Reset accumulated time
    setLastUnpausedTime(undefined) // Reset last unpaused time
    setIsPaused(false) // Ensure timer is not paused on reset
    setBoard(newBoard)
    setPreviousState(undefined)
  }
  const [autoplay, setAutoplay] = useState(false)

  useEffect(() => {
    async function autoPlay() {
      const hintPositions = getPositionsThatAlmostMatch(board)
      if (!hintPositions) {
        return
      }
      await new Promise((r) => setTimeout(r, 100))
      await handleSwapTiles(hintPositions[0], hintPositions[1]) // Use the new handleSwapTiles
    }

    if (autoplay && !animating) {
      autoPlay()
    }
  }, [autoplay, board, animating, getPositionsThatAlmostMatch, handleSwapTiles]) // Add handleSwapTiles to dependencies

  function getHint(): void {
    const hintPositions = getPositionsThatAlmostMatch(board)
    if (!hintPositions) {
      setGameOverClosed(false)
      return
    }
    const { x: x1, y: y1 } = hintPositions[0]
    const { x: x2, y: y2 } = hintPositions[1]
    const sequence1: AnimationSequence = [
      [
        `[data-pos="${x1}${y1}"]`,
        { scale: 1.2, x: (x2 - x1) * 10, y: (y2 - y1) * 10 },
      ],
      [`[data-pos="${x1}${y1}"]`, { scale: 1, x: 0, y: 0 }],
    ]
    const sequence2: AnimationSequence = [
      [
        `[data-pos="${x2}${y2}"]`,
        { scale: 0.8, x: (x2 - x1) * -10, y: (y2 - y1) * -10 },
      ],
      [`[data-pos="${x2}${y2}"]`, { scale: 1, x: 0, y: 0 }],
    ]

    animate(sequence1)
    animate(sequence2)
  }
  const myDiv = useRef<HTMLDivElement>(null)
  if (loading) {
    return <div />
  }

  return (
    <div
      className={`flex pb-8 ${gamePosition == "top" ? "flex-col" : "flex-col-reverse "} items-center`}
      ref={myDiv}
    >
      <Tutorial />
      <motion.div
        layout
        className={`flex flex-1 transition ${gamePosition == "top" ? "flex-col justify-start" : "flex-col-reverse gap-8"}`}
      >
        <main
          className="relative grid w-screen grid-cols-8 grid-rows-8 items-center gap-0.5 p-1 sm:w-full sm:gap-2 sm:p-4 touch-none"
          ref={grid}
        >
          <AnimatePresence>
            {(isGameOver(board) || isLoadedFromHistory) &&
              !animating &&
              !gameOverClosed && (
                <motion.div
                  className="absolute left-0 top-0 z-20 flex h-full w-full items-center justify-center"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  <div className="flex flex-col rounded bg-white/80 px-6 pb-6 pt-2 dark:bg-black/80">
                    <button
                      className="self-end"
                      onClick={() => setGameOverClosed(true)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="h-6 w-6 "
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18 18 6M6 6l12 12"
                        />
                      </svg>
                    </button>

                    <motion.h1 className="mb-6 text-5xl font-bold text-blue-100 [text-shadow:_3px_3px_0_#0a9396,_6px_6px_0_#ee9b00,_9px_9px_0_#005f73]">
                      Game Over
                    </motion.h1>
                    <div className="mb-4 flex justify-between px-8 text-lg">
                      <span>Moves</span>
                      <span className="font-medium">
                        {moves.toLocaleString()}
                      </span>
                    </div>
                    {duration !== undefined && (
                      <div className="mb-4 flex justify-between px-8 text-lg">
                        <span>Time</span>
                        <span className="font-medium">
                          {formatTime(duration)}
                        </span>
                      </div>
                    )}
                    <ShareButton board={board} points={points} moves={moves} />
                    <Button
                      onClick={() => {
                        resetBoard()
                      }}
                      className="mt-2 flex justify-center gap-3"
                    >
                      New game
                    </Button>
                  </div>
                </motion.div>
              )}
          </AnimatePresence>
          <AnimatePresence mode="popLayout">
            {board.map((row, y) =>
              row.map((_, x) => (
                <motion.button
                  onPanEnd={(event, info) => onPanEnd(event, info, { x, y })}
                  transition={transition}
                  disabled={animating || isPaused} // New: disable tiles when paused
                  layout
                  data-pos={`${x}${y}`}
                  onContextMenu={(event) => {
                    if (!debug) {
                      return
                    }
                    event.preventDefault()
                    const newValue = parseInt(prompt("Enter new value") ?? "0")
                    const newBoard = copyBoard(board)
                    newBoard[x][y].value = newValue
                    setBoard(newBoard)
                  }}
                  initial={{ y: -80 }}
                  animate={getExitTo({ x, y }) ?? { y: 0 }}
                  className={`aspect-square w-full sm:size-12 md:size-14 ${
                    getExitTo({ x, y }) ? "z-0" : "z-10"
                  }`}
                  key={board[x][y].id}
                  onClick={(_) => clickTile({ x, y })}
                >
                  <Tile
                    tile={board[x][y]}
                    selected={selectedFrom?.x == x && selectedFrom.y == y}
                  />
                </motion.button>
              )),
            )}
          </AnimatePresence>
        </main>
        <div className="flex flex-col gap-6 p-2 sm:p-4">
          <div className="flex flex-row justify-between">
            <div className="flex min-w-0 flex-1 flex-col items-start">
              <span className="text-lg">Score</span>
              <motion.span
                className="break-all text-[clamp(2.25rem,8vw,3.75rem)] font-medium leading-none"
                key={points}
                animate={{ opacity: 1, scale: [0.7, 1] }}
                transition={{ type: "spring", stiffness: 500, damping: 15 }}
              >
                {points.toLocaleString()}
              </motion.span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-end">
              <span className="text-lg">Highscore</span>
              <motion.span
                className="break-all text-[clamp(2.25rem,8vw,3.75rem)] font-medium leading-none"
                key={Math.max(highscore, points)}
                animate={{ opacity: 1, scale: [0.7, 1] }}
                transition={{ type: "spring", stiffness: 500, damping: 15 }}
              >
                {Math.max(highscore, points).toLocaleString()}
              </motion.span>
            </div>
          </div>

          <div className="flex flex-row items-center justify-between">
            <button
              onClick={getHint}
              className="w-fit rounded-xl bg-gradient-to-bl from-indigo-500 to-indigo-600 px-6 py-2 text-lg font-medium text-white"
            >
              Get hint
            </button>
            <button
              onClick={undo}
              disabled={!previousState || animating}
              className="w-fit rounded-xl bg-gradient-to-bl from-amber-500 to-amber-600 px-6 py-2 text-lg font-medium text-white disabled:opacity-50"
            >
              Undo
            </button>
            {startTime && (
              <Timer
                startTime={startTime}
                duration={duration}
                formatTime={formatTime}
                isPaused={isPaused}
                togglePause={togglePause} // Use the new togglePause function
                pausedAccumulatedTime={pausedAccumulatedTime} // Pass new prop
                lastUnpausedTime={lastUnpausedTime} // Pass new prop
              />
            )}
            <button
              onClick={() =>
                (isGameOver(board) || confirm("Are you sure?")) && resetBoard()
              }
              className="w-fit rounded-xl bg-gradient-to-bl from-rose-500 to-rose-600 px-6 py-2 text-lg font-medium text-white"
            >
              Reset
            </button>
          </div>

          {debug && (
            <div>
              <Button onClick={() => setAutoplay(!autoplay)}>
                Autoplay {autoplay ? "on" : "off"}
              </Button>
            </div>
          )}
        </div>
      </motion.div>
      <div className="flex w-full items-center justify-end gap-6 px-4">
        {player && (
          <>
            <button
              onClick={async () => {
                await CapacitorGameConnect.showLeaderboard({
                  leaderboardID: "exponentile",
                })
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0"
                />
              </svg>
            </button>
            <button
              onClick={async () => {
                await CapacitorGameConnect.showAchievements()
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" />
                <path d="M11 12 5.12 2.2" />
                <path d="m13 12 5.88-9.8" />
                <path d="M8 7h8" />
                <circle cx="12" cy="17" r="5" />
                <path d="M12 18v-2h-.5" />
              </svg>
            </button>
          </>
        )}
        <Link href="/history" aria-label="Game History">
          <History className="h-6 w-6" />
        </Link>

        {!muted ? (
          <button onClick={() => setMuted(!muted)}>
            <Volume2 />
          </button>
        ) : (
          <button onClick={() => setMuted(!muted)}>
            <VolumeX />
          </button>
        )}
        {typeof document !== "undefined" && document.fullscreenEnabled && (
          <button onClick={toggleFullscreen} aria-label="Toggle Fullscreen">
            {isFullscreen ? <Minimize /> : <Maximize />}
          </button>
        )}
        <Settings
          setAnimationSpeed={setAnimationSpeed}
          animationSpeed={animationSpeed}
          gamePosition={gamePosition}
          setGamePosition={setGamePosition}
          setDebug={setDebug}
        />
      </div>
    </div>
  )
}
