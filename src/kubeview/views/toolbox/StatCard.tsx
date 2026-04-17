export function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[11px] text-slate-400">{label}</span></div>
      <div className="text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}
