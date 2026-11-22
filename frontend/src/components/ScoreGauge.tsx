interface ScoreGaugeProps {
  score: number | null
  label?: string
  width?: number
}

function toneFor(score: number | null) {
  if (score === null) return { bar: '#c3b9a6', text: '#6f6a5f' }
  if (score >= 90) return { bar: '#14805c', text: '#14805c' }
  if (score >= 70) return { bar: '#b58a00', text: '#8a6100' }
  return { bar: '#b3263c', text: '#a8233a' }
}

/**
 * Scorecard rather than a gauge: the number is set in the display serif and a
 * thin rule carries the proportion. No gradients, no glow.
 */
export function ScoreGauge({ score, label = 'out of 100', width = 190 }: ScoreGaugeProps) {
  const tone = toneFor(score)
  const value = Math.min(100, Math.max(0, score ?? 0))

  return (
    <div style={{ width }}>
      <div className="flex items-baseline gap-1">
        <span className="serif-title tabular text-[64px]" style={{ color: tone.text }}>
          {score ?? '—'}
        </span>
        <span className="text-[11px] text-[#756f62]">/ 100</span>
      </div>

      <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-[#e5dfd1]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${value}%`, background: tone.bar }}
        />
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-[#756f62]">
        <span>0</span>
        <span>{label}</span>
        <span>100</span>
      </div>
    </div>
  )
}
