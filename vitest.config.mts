import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/**/*.test.ts",
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
    ],
    // Integration suites mutate process-level MongoDB connection settings;
    // serial file execution keeps those isolated while unit tests remain fast.
    fileParallelism: false,
    reporters: ["default"],
  },
});
