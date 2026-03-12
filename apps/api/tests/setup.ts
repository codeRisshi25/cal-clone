// Jest global setup — runs once before all test suites
// Loads .env.test so DATABASE_URL etc. point to the test DB
import { config } from "dotenv";
import { resolve } from "path";

export default async function setup() {
  config({ path: resolve(__dirname, "../.env.test") });
}
