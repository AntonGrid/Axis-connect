import { useEffect, useRef, useState } from "react";

interface Props {
  /** Current SRC balance (atomic units). Drops appear when it grows. */
  balanceRaw: bigint;
  /** How many drops to show per accrual. */
  count?: number;
}

/**
 * "Dripping" tokens: when the SRC balance on a card increases, animated drops
 * fall down (see keyframes dripFall in index.css).
 * Purely visual — no accrual logic.
 */
export default function DripTokens({ balanceRaw, count = 5 }: Props) {
  const prevRef = useRef(balanceRaw);
  const [drips, setDrips] = useState<number[]>([]);

  useEffect(() => {
    if (balanceRaw > prevRef.current) {
      const id = Date.now();
      const batch = Array.from({ length: count }, (_, i) => id + i);
      setDrips((d) => [...d, ...batch]);
      const t = setTimeout(() => setDrips((d) => d.filter((x) => !batch.includes(x))), 1600);
      return () => clearTimeout(t);
    }
    prevRef.current = balanceRaw;
  }, [balanceRaw, count]);

  if (drips.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {drips.map((id, i) => (
        <span
          key={id}
          className="drip-token absolute text-axis-accent"
          style={{
            left: `${18 + (i % count) * 14}%`,
            bottom: 0,
            fontSize: 12,
          }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}
