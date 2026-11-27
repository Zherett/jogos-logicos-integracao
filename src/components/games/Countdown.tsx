import { useEffect, useRef, useState } from "react";

interface Props {
  onDone: () => void;
  from?: number;
}

export function Countdown({ onDone, from = 3 }: Props) {
  // Sequence: from, from-1, ..., 1, 0 (=> "VAI!")
  const [n, setN] = useState<number>(from);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => {
      if (n <= 0) {
        onDoneRef.current();
      } else {
        setN(n - 1);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [n]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
      <div
        key={n}
        className="animate-countdown font-display font-extrabold text-primary text-[6rem] sm:text-[10rem] leading-none drop-shadow-lg"
      >
        {n === 0 ? "VAI!" : n}
      </div>
    </div>
  );
}
