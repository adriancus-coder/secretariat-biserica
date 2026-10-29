/** Runs once per server instance: the notification digests every 15 minutes, the saved versions' fingerprints once (Node.js runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { runPushDigests } = await import("./server/push-digests");
  const timer = setInterval(() => void runPushDigests(), 15 * 60_000);
  timer.unref?.();
  // GENERATED-HASH-STABLE: versions saved with the text's fingerprint move to the data's (once, idempotent).
  const { scheduleGeneratedUpgrade } = await import("./server/generated-upgrade");
  scheduleGeneratedUpgrade();
}
