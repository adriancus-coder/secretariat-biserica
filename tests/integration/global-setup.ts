import { execSync } from "node:child_process";
import "dotenv/config";

/**
 * Testele de integrare rulează pe o bază de date separată (TEST_DATABASE_URL).
 * Înainte de rulare aplicăm migrațiile; dacă variabila lipsește, testele se sar.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("[integration] TEST_DATABASE_URL nu este setat — testele de integrare vor fi sărite.");
    return;
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
