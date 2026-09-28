export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="bg-navy-2 text-[#F4F1E8] px-5 pt-6 pb-5 pt-[calc(24px+env(safe-area-inset-top,0px))]">
        <div className="mx-auto max-w-md">
          <div className="text-[13px] opacity-80">Biserica</div>
          <h1 className="text-[26px] text-white">Secretariat</h1>
        </div>
      </header>
      <main className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-md">{children}</div>
      </main>
    </div>
  );
}
