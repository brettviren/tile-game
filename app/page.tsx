"use client"
import dynamic from "next/dynamic"

const Game = dynamic(() => import("../components/Game"), { ssr: false })

export default function HomePage() {
  return (
    <div className="flex h-full w-full justify-center">
      <Game />
    </div>
  )
}
