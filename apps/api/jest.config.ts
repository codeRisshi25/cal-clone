import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["**/tests/**/*.test.ts"],
  globalSetup: "./tests/setup.ts",
  moduleNameMapper: {
    "^@cal-clone/types$": "<rootDir>/../../packages/types/src/index.ts",
    "^@cal-clone/db$": "<rootDir>/../../packages/db/index.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "./tsconfig.json" }],
  },
};

export default config;
