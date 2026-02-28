export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-8">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold mb-4">ExponenTile</h1>
        <p className="text-slate-400 mb-6">
          The tile game is available at a different path.
        </p>
        <a
          href="/tile-game/exponentile"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Play ExponenTile
        </a>
      </div>
    </div>
  )
}
