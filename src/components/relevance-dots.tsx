interface RelevanceDotsProps {
  /** score 0–10; displayed as 1–5 filled dots */
  score: number;
  className?: string;
}

export function RelevanceDots({ score, className }: RelevanceDotsProps) {
  const filled = Math.round((score / 10) * 5);
  const label = `Relevance: ${filled} of 5`;

  return (
    <span
      className={`flex items-center gap-0.5 ${className ?? ""}`}
      aria-label={label}
      title={label}
      role="img"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`block h-2 w-2 rounded-full ${
            i < filled ? "bg-[#1E3A5F]" : "bg-[#D4D4D4]"
          }`}
        />
      ))}
    </span>
  );
}
