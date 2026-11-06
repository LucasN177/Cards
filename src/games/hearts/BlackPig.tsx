import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { playSound } from '@/features/sound/sound'

const PIG = '#141414'
const OUTLINE = '#f5f5f4'

/** A black pig seen from the side, facing right. `running` swings the legs. */
export function BlackPig({
  running = false,
  className,
}: {
  running?: boolean
  className?: string
}) {
  const leg = (x: number, phase: number) => (
    <motion.rect
      key={x}
      x={x}
      y={56}
      width={8}
      height={17}
      rx={3}
      fill={PIG}
      stroke={OUTLINE}
      strokeWidth={1.5}
      style={{ transformBox: 'fill-box', originX: 0.5, originY: 0 }}
      animate={running ? { rotate: [phase * 22, -phase * 22, phase * 22] } : undefined}
      transition={running ? { duration: 0.28, repeat: Infinity, ease: 'easeInOut' } : undefined}
    />
  )
  return (
    <svg viewBox="0 0 124 80" className={className} aria-hidden>
      {/* Curly tail */}
      <path
        d="M19 36 C 8 30, 6 44, 14 44 C 20 44, 18 36, 11 38"
        fill="none"
        stroke={PIG}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      {leg(28, 1)}
      {leg(40, -1)}
      {leg(68, -1)}
      {leg(80, 1)}
      <ellipse cx={56} cy={42} rx={39} ry={24} fill={PIG} stroke={OUTLINE} strokeWidth={2} />
      <circle cx={93} cy={36} r={18} fill={PIG} stroke={OUTLINE} strokeWidth={2} />
      {/* Ear */}
      <path
        d="M85 22 L91 6 L99 21 Z"
        fill={PIG}
        stroke={OUTLINE}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Snout */}
      <ellipse cx={110} cy={41} rx={9} ry={8} fill="#3f3f46" stroke={OUTLINE} strokeWidth={2} />
      <circle cx={107.5} cy={41} r={1.6} fill={PIG} />
      <circle cx={112.5} cy={41} r={1.6} fill={PIG} />
      {/* Eye */}
      <circle cx={97} cy={31} r={2.6} fill={OUTLINE} />
      <circle cx={97.8} cy={31.2} r={1.2} fill={PIG} />
    </svg>
  )
}

/** The pig runs once across the screen and grunts; `onDone` removes it. */
export function RunningPig({ onDone }: { onDone: () => void }) {
  // Grunt once per run, whatever the parent passes on later renders.
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    playSound('grunt')
    // Fallback in case the animation never reports its end (e.g. in a background tab).
    const timer = setTimeout(() => done.current(), 3000)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      role="img"
      aria-label="Ein schwarzes Schwein läuft grunzend über den Tisch"
    >
      <motion.div
        className="absolute top-[42%] w-[clamp(6rem,22vw,11rem)]"
        initial={{ x: '-30vw' }}
        animate={{ x: '115vw' }}
        transition={{ duration: 2.4, ease: 'linear' }}
        onAnimationComplete={() => done.current()}
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 0.28, repeat: Infinity, ease: 'easeOut' }}
        >
          <BlackPig running className="w-full drop-shadow-lg" />
        </motion.div>
      </motion.div>
    </div>
  )
}
