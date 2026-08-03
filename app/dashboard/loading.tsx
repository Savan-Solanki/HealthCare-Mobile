function PulseBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[2rem] bg-white/80 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#eef6fa]">
      <div className="mx-auto flex min-h-screen max-w-[1920px]">
        <aside className="hidden w-[320px] border-r border-slate-200 bg-white xl:block" />

        <div className="flex flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-7 lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-3">
                <PulseBlock className="h-8 w-60 rounded-xl" />
                <PulseBlock className="h-4 w-40 rounded-xl" />
              </div>
              <PulseBlock className="h-12 w-12 rounded-full" />
            </div>
          </header>

          <main className="flex-1 px-4 pb-28 pt-6 sm:px-7 lg:px-8 xl:pb-8">
            <div className="space-y-8">
              <PulseBlock className="h-[240px] w-full" />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <PulseBlock className="h-[220px] w-full" key={`metric-${index}`} />
                ))}
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.72fr)]">
                <PulseBlock className="h-[390px] w-full" />
                <PulseBlock className="h-[390px] w-full" />
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
