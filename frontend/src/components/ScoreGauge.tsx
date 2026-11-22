import { useId } from 'react'

interface ScoreGaugeProps {
  score: number | null
  label?: string
  size?: number
}

function toneFor(score: number | null) {
  if (score === null) return { from: '#3b4252', to: '#2a3040', text: '#8b93a3' }
  if (score >= 90) return { from: '#3ddc97', to: '#34d399', text: '#5fe3ad' }
  if (score >= 70) return { from: '#f5c451', to: '#eab308', text: '#f4cd72' }
  return { from: '#fb7185', to: '#f43f5e', text: '#fda4af' }
}

/** 270° gauge with a gradient stroke; renders only real values. */
export function ScoreGauge({ score, label, size = 168 }: ScoreGaugeProps) {
  const gradientId = useId().replace(/:/g, '')
  const tone = toneFor(score)
  const radius = 47
  const circumference = 2 * Math.PI * radius
  const arc = 0.75 // three-quarter gauge
  const value = Math.min(100, Math.max(0, score ?? 0))

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-[225deg]">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tone.from} />
            <stop offset="100%" stopColor={tone.to} />
          </linearGradient>
        </defs>
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#181c25"
          strokeWidth="5.5"
          strokeDasharray={`${circumference * arc} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray={`${circumference * arc * (value / 100)} ${circumference}`}
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular text-[32px] font-semibold leading-none tracking-tight"
          style={{ color: tone.text }}
        >
          {score ?? '—'}
        </span>
        <span className="mt-1 text-[10px] text-[#6a7280]">{label ?? 'out of 100'}</span>
      </div>
    </div>
  )
}
