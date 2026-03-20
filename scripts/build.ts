#!/usr/bin/env -S deno run --allow-write --allow-env

/**
 * build.ts — Generates out/index.html
 *
 * Usage:  deno task build
 *         deno run --allow-write --allow-env scripts/build.ts
 */

// ── Timestamp ─────────────────────────────────────────────────────────────────

const BUILD_TIMESTAMP = new Date().toLocaleString("en-US", {
  weekday:      "short",
  year:         "numeric",
  month:        "short",
  day:          "2-digit",
  hour:         "2-digit",
  minute:       "2-digit",
  second:       "2-digit",
  timeZoneName: "short",
});

// ── Base path ─────────────────────────────────────────────────────────────────

const BASE_PATH = Deno.env.get("NEXT_PUBLIC_BASE_PATH") ??
  (Deno.env.get("NODE_ENV") === "production" ? "/tile-game" : "");

// ── HTML ──────────────────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ExponenTile</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950">
  <div class="min-h-screen flex items-center justify-center bg-slate-950 text-white p-8">
    <div class="max-w-md text-center">
      <h1 class="text-3xl font-bold mb-4">ExponenTile</h1>
      <p class="text-slate-400 mb-6">
        Welcome to The Game.
      </p>
      <a
        href="${BASE_PATH}/exponentile/"
        class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        Play ExponenTile
      </a>
      <p class="text-slate-400 mb-6 py-3">
        Any addiction is the sole responsibility of the player.
      </p>
      <a
        href="${BASE_PATH}/history/"
        class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        History
      </a>
      <p>
        Built on ${BUILD_TIMESTAMP}
      </p>
    </div>
  </div>
</body>
</html>
`;

// ── Write output ──────────────────────────────────────────────────────────────

await Deno.mkdir("out", { recursive: true });
await Deno.writeTextFile("out/index.html", html);

console.log(`✓  Built out/index.html  [${BUILD_TIMESTAMP}]`);

