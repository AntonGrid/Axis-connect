import { useEffect, useRef, useState } from "react";

interface Props {
  /** Текущий остаток SRC (атомарные единицы). Капли появляются при росте. */
  balanceRaw: bigint;
  /** Сколько капель показать за одно начисление. */
  count?: number;
}

/**
 * «Капающие» токены: при увеличении баланса SRC на карточке появляются
 * падающие анимированные капли (см. keyframes dripFall в index.css).
 * Чисто визуальный элемент — никакой логики начислений.
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
