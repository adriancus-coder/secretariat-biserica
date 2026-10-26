/** Runs once per server instance: the notification digests every 15 minutes (Node.js runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { runPushDigests } = await import("./server/push-digests");
  const timer = setInterval(() => void runPushDigests(), 15 * 60_000);
  timer.unref?.();
}
