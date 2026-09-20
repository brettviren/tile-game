import { defineConfig } from "vitest/config"
import path from "path"

// The app resolves "@/..." through tsconfig paths; vitest needs telling too.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
})
