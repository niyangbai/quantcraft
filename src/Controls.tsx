export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={disabled ? "slider-row disabled" : "slider-row"}>
      <span>
        {label}
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <input
        disabled={disabled}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function RoundTimer({
  label,
  value,
  progress,
  urgent = false,
  durationMs,
  resetKey,
}: {
  label: string;
  value: string;
  progress?: number;
  urgent?: boolean;
  durationMs?: number;
  resetKey?: number;
}) {
  return (
    <div className={`round-timer ${urgent ? "urgent" : ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <div key={resetKey}>
        <i
          className={durationMs ? "animated" : ""}
          style={durationMs
            ? { animationDuration: `${durationMs}ms` }
            : { width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }}
        />
      </div>
    </div>
  );
}
