import { useRef } from "react";

interface Props {
  targets: number[];
  values: number[];
  onChange: (index: number, value: number) => void;
  disabled?: boolean;
  /** null = not validated yet; otherwise one flag per bar. */
  results?: (boolean | null)[];
}

const STEP = 10;

/** Three horizontal "volume" bars the player drags to match a percentage. */
export function PercentSliders({ targets, values, onChange, disabled, results }: Props) {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      {targets.map((t, i) => (
        <SliderRow
          key={i}
          target={t}
          value={values[i] ?? 0}
          onChange={(v) => onChange(i, v)}
          disabled={disabled}
          result={results?.[i] ?? null}
        />
      ))}
    </div>
  );
}

function SliderRow({
  target, value, onChange, disabled, result,
}: {
  target: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  result: boolean | null;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerDownRef = useRef<number | null>(null);

  function setFromClientX(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = ((clientX - rect.left) / rect.width) * 100;
    const snapped = Math.round(raw / STEP) * STEP;
    onChange(Math.min(100, Math.max(0, snapped)));
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    pointerDownRef.current = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setFromClientX(e.clientX);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (disabled || pointerDownRef.current !== e.pointerId) return;
    setFromClientX(e.clientX);
  }

  function releasePointer(e: React.PointerEvent) {
    if (pointerDownRef.current === e.pointerId) {
      pointerDownRef.current = null;
    }
  }

  const ring =
    result === true ? "border-success" : result === false ? "border-destructive" : "border-foreground/60";

  return (
    <div className="flex items-center gap-3">
      <div
        className={`grid h-12 w-20 shrink-0 place-items-center rounded-2xl border-2 font-display text-xl font-extrabold ${
          result === true
            ? "border-success bg-success/15 text-success"
            : result === false
              ? "border-destructive bg-destructive/15 text-destructive"
              : "border-primary/40 bg-primary/10 text-primary"
        }`}
      >
        {target}%
      </div>

      <div className="min-w-0 flex-1 select-none">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={`Ajuste para ${target}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
          onLostPointerCapture={releasePointer}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "ArrowRight") onChange(Math.min(100, value + STEP));
            if (e.key === "ArrowLeft") onChange(Math.max(0, value - STEP));
          }}
          className={`relative h-10 w-full cursor-pointer touch-none rounded-2xl border-4 bg-muted/50 shadow-inner ${ring} ${
            disabled ? "opacity-70" : ""
          }`}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-l-xl bg-primary transition-[width] duration-100"
            style={{ width: `${value}%` }}
          />
          <div
            className="absolute top-1/2 h-11 w-5 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-foreground/70 bg-background shadow-md"
            style={{ left: `${value}%` }}
          />
        </div>

        {/* Ruler: 10 unlabeled marks */}
        <div className="mt-1 flex w-full justify-between px-[2px]">
          {Array.from({ length: 11 }, (_, i) => (
            <div
              key={i}
              className={`w-[2px] rounded-full bg-foreground/40 ${i % 5 === 0 ? "h-3" : "h-2"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
