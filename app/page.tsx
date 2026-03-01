export default function Home() {
  const basePath =
    process.env.NEXT_PUBLIC_BASE_PATH ||
    (process.env.NODE_ENV === "production" ? "/tile-game" : "")
  return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-8">
          <div className="max-w-md text-center">
              <h1 className="text-3xl font-bold mb-4">ExponenTile</h1>
              <p className="text-slate-400 mb-6">
                  Welcome to The Game.  
              </p>
              <a
                  href={`${basePath}/exponentile/`}
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                  Play ExponenTile
              </a>
              <p className="text-slate-400 mb-6 py-3">
                  Any addiction is the sole responsibility of the player.
              </p>
              <a
                  href={`${basePath}/history/`}
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                  History
              </a>

              <p>
                  Built on
Sun Mar  1 04:05:37 PM EST 2026
              </p>

          </div>
      </div>
  )
}
