import type { ReactNode } from 'react';

function buildTopoPaths() {
  const lines: { points: string; width: number }[] = [];
  const centers: [number, number, number][] = [
    [560, 120, 13],
    [180, 230, 8],
    [760, 260, 6],
  ];
  centers.forEach(([cx, cy, n], s) => {
    for (let k = 1; k <= n; k++) {
      const r = k * 22;
      const pts: string[] = [];
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        const rr =
          r * (1 + 0.16 * Math.sin(3 * t + k * 0.5 + s) + 0.09 * Math.cos(5 * t - k * 0.3) + 0.05 * Math.sin(9 * t + s));
        pts.push(`${(cx + rr * Math.cos(t) * 1.35).toFixed(1)},${(cy + rr * Math.sin(t)).toFixed(1)}`);
      }
      lines.push({ points: pts.join(' '), width: k % 4 === 0 ? 2 : 1 });
    }
  });
  return lines;
}

// Deterministic, computed once at module load so SSR and client markup match.
const TOPO_LINES = buildTopoPaths();

function Topo() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full text-band-line opacity-[.14]"
      viewBox="0 0 800 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {TOPO_LINES.map((l, i) => (
        <polyline key={i} points={l.points} fill="none" stroke="currentColor" strokeWidth={l.width} />
      ))}
    </svg>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-band px-[max(16px,env(safe-area-inset-left,0px))] py-8 text-band-ink">
      <Topo />
      <div className="relative grid w-full justify-items-center">
        <div className="relative grid w-[min(100%,25rem)] gap-4 rounded-[8px] bg-paper p-[1.6rem_1.5rem] text-ink shadow-[8px_8px_0_rgba(0,0,0,.18)]">
          <div className="flex items-center gap-[.9rem]">
            <div className="grid size-[3.8rem] flex-none place-items-center rounded-full border-[3px] border-dashed border-navy text-center leading-none text-navy">
              <b className="block font-display text-[1.1rem] font-bold leading-none">єП</b>
            </div>
            <div>
              <h1 className="m-0 font-display text-[1.9rem] font-bold uppercase leading-none tracking-[.02em]">
                {title}
              </h1>
              <p className="mt-1 font-mono text-[.74rem] tracking-[.04em] text-ink-2">{subtitle}</p>
            </div>
          </div>
          {children}
        </div>
        <p className="relative mt-[1.2rem] text-center font-mono text-[.72rem] tracking-[.06em] opacity-80">
          ПЛАСТ · КУРІННИЙ ЖУРНАЛ
        </p>
      </div>
    </div>
  );
}
