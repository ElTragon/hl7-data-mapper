import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        // Bootstrap, routing, providers, and generated UI primitives contain
        // wiring rather than application behavior. Their dependencies test
        // those primitives; our coverage gate targets product-owned logic.
        "src/main.tsx",
        "src/router.tsx",
        "src/providers/**",
        "src/routes/**",
        "src/components/ui/**",
        "src/test/**",
        "src/routeTree.gen.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "../../coverage/web",
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
})
