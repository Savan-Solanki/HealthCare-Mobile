function PulseBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[2rem] bg-white/80 ${className}`} />;
}

export default function HospitalLoading() {
  return (
    <div className="space-y-8">
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <PulseBlock className="h-[360px] w-full" key={`hospital-loading-card-${index}`} />
        ))}
      </div>

      <PulseBlock className="h-[340px] w-full" />
    </div>
  );
}
