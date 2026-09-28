export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Se încarcă…</span>
      <div className="h-7 w-48 rounded-lg bg-panel mb-2" />
      <div className="h-4 w-32 rounded bg-panel mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-12 rounded-xl bg-panel" />
        ))}
      </div>
    </div>
  );
}
