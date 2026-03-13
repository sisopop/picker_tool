import { useEffect, useMemo, useRef, useState } from 'react'

type Mode = 'wheel' | 'ladder'
type ChoiceItem = { label: string; enabled: boolean }
type LadderLine = { row: number; col: number }
type LadderStep = { x1: number; y1: number; x2: number; y2: number; type: 'down' | 'right' | 'left' }
type LadderTrace = { startIndex: number; endIndex: number; steps: LadderStep[]; length: number; color: string }

const MAX_ITEMS = 10
const POINTER_ANGLE = 0
const VIEWBOX_SIZE = 480
const CENTER = VIEWBOX_SIZE / 2
const OUTER_RADIUS = 220
const INNER_RADIUS = 36
const LADDER_ROWS = 14
const LADDER_WIDTH = 660
const LADDER_HEIGHT = 480
const LADDER_START_X = 60
const LADDER_RIGHT = 488
const LADDER_TOP = 50
const LADDER_BOTTOM = 430
const TRACE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16']

function randomPastel(i: number) {
  const palettes = ['#fde68a', '#bfdbfe', '#fecdd3', '#c7d2fe', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fdba74', '#a7f3d0', '#e9d5ff']
  return palettes[i % palettes.length]
}

function normalizeItems(values: ChoiceItem[]) {
  return values.map((item) => ({ ...item, label: item.label.trim() }))
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(angleRad), y: cy + radius * Math.sin(angleRad) }
}

function describeSector(startAngle: number, endAngle: number, outerRadius: number) {
  const startOuter = polarToCartesian(CENTER, CENTER, outerRadius, endAngle)
  const endOuter = polarToCartesian(CENTER, CENTER, outerRadius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return [`M ${CENTER} ${CENTER}`, `L ${startOuter.x} ${startOuter.y}`, `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`, 'Z'].join(' ')
}

function getLabelRadius(count: number) {
  if (count <= 2) return 120
  if (count <= 4) return 128
  if (count <= 6) return 136
  return 144
}

function countRowConnections(lines: LadderLine[], count: number) {
  const connectionCounts = Array.from({ length: count }, () => 0)
  for (const line of lines) {
    if (line.col >= 0 && line.col < count - 1) {
      connectionCounts[line.col] += 1
      connectionCounts[line.col + 1] += 1
    }
  }
  return connectionCounts
}

function canPlaceLadderLine(lines: LadderLine[], row: number, col: number) {
  const hasSame = lines.some((line) => line.row === row && line.col === col)
  const hasLeft = lines.some((line) => line.row === row && line.col === col - 1)
  const hasRight = lines.some((line) => line.row === row && line.col === col + 1)
  return !hasSame && !hasLeft && !hasRight
}

function generateLadderLines(count: number) {
  if (count < 2) return [] as LadderLine[]
  const maxCols = count - 1
  const lines: LadderLine[] = []

  for (let row = 0; row < LADDER_ROWS; row += 1) {
    for (let col = 0; col < maxCols; col += 1) {
      if (!canPlaceLadderLine(lines, row, col)) continue
      const probability = count <= 3 ? 0.34 : count <= 6 ? 0.28 : 0.22
      if (Math.random() < probability) lines.push({ row, col })
    }
  }

  const minConnectionsPerRow = Math.min(3, LADDER_ROWS)
  let connectionCounts = countRowConnections(lines, count)

  for (let targetRow = 0; targetRow < count; targetRow += 1) {
    let guard = 0
    while (connectionCounts[targetRow] < minConnectionsPerRow && guard < 500) {
      const candidateCols: number[] = []
      if (targetRow > 0) candidateCols.push(targetRow - 1)
      if (targetRow < count - 1) candidateCols.push(targetRow)
      const shuffledRows = Array.from({ length: LADDER_ROWS }, (_, i) => i).sort(() => Math.random() - 0.5)
      let placed = false
      for (const ladderRow of shuffledRows) {
        const shuffledCandidateCols = [...candidateCols].sort(() => Math.random() - 0.5)
        for (const candidateCol of shuffledCandidateCols) {
          if (canPlaceLadderLine(lines, ladderRow, candidateCol)) {
            lines.push({ row: ladderRow, col: candidateCol })
            connectionCounts = countRowConnections(lines, count)
            placed = true
            break
          }
        }
        if (placed) break
      }
      if (!placed) break
      guard += 1
    }
  }

  if (lines.length === 0) {
    lines.push({ row: Math.floor(Math.random() * LADDER_ROWS), col: Math.floor(Math.random() * (count - 1)) })
  }

  return lines.sort((a, b) => (a.row === b.row ? a.col - b.col : a.row - b.row))
}

function buildLadderSteps(count: number, lines: LadderLine[], startIndex: number) {
  if (count < 2) return { steps: [] as LadderStep[], endIndex: startIndex }

  const FIRST_STEP_OFFSET = 12
  const rowGap = count === 1 ? 0 : (LADDER_BOTTOM - LADDER_TOP) / (count - 1)
  const colGap = (LADDER_RIGHT - (LADDER_START_X + FIRST_STEP_OFFSET)) / LADDER_ROWS

  const steps: LadderStep[] = []
  let currentRow = startIndex
  let currentX = LADDER_START_X

  for (let col = 0; col < LADDER_ROWS; col += 1) {
    const colX = LADDER_START_X + FIRST_STEP_OFFSET + colGap * col
    const nextColX = LADDER_START_X + FIRST_STEP_OFFSET + colGap * (col + 1)
    const currentY = LADDER_TOP + rowGap * currentRow

    if (currentX < colX) steps.push({ x1: currentX, y1: currentY, x2: colX, y2: currentY, type: 'right' })

    const downLine = lines.find((line) => line.row === col && line.col === currentRow)
    const upLine = lines.find((line) => line.row === col && line.col === currentRow - 1)

    if (downLine) {
      const nextY = LADDER_TOP + rowGap * (currentRow + 1)
      steps.push({ x1: colX, y1: currentY, x2: colX, y2: nextY, type: 'down' })
      currentRow += 1
      steps.push({ x1: colX, y1: nextY, x2: nextColX, y2: nextY, type: 'right' })
      currentX = nextColX
      continue
    }
    if (upLine) {
      const nextY = LADDER_TOP + rowGap * (currentRow - 1)
      steps.push({ x1: colX, y1: currentY, x2: colX, y2: nextY, type: 'left' })
      currentRow -= 1
      steps.push({ x1: colX, y1: nextY, x2: nextColX, y2: nextY, type: 'right' })
      currentX = nextColX
      continue
    }
    steps.push({ x1: colX, y1: currentY, x2: nextColX, y2: currentY, type: 'right' })
    currentX = nextColX
  }
  return { steps, endIndex: currentRow }
}

function getPointAlongSteps(steps: LadderStep[], totalLength: number, progress: number) {
  if (!steps.length || totalLength <= 0) return null
  const target = totalLength * Math.max(0, Math.min(1, progress))
  let accumulated = 0
  for (const step of steps) {
    const dx = step.x2 - step.x1
    const dy = step.y2 - step.y1
    const length = Math.sqrt(dx * dx + dy * dy)
    if (accumulated + length >= target) {
      const local = length === 0 ? 0 : (target - accumulated) / length
      return { x: step.x1 + dx * local, y: step.y1 + dy * local }
    }
    accumulated += length
  }
  const last = steps[steps.length - 1]
  return { x: last.x2, y: last.y2 }
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'secondary' }) {
  const { variant = 'primary', className = '', ...rest } = props
  return <button className={`btn btn-${variant} ${className}`.trim()} {...rest} />
}

export default function App() {
  const [mode, setMode] = useState<Mode>('wheel')
  const [itemInputs, setItemInputs] = useState<ChoiceItem[]>([
    { label: '', enabled: true },
    { label: '', enabled: true },
  ])
  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [result, setResult] = useState('')
  const [ladderLines, setLadderLines] = useState<LadderLine[]>([])
  const [isLadderPlaying, setIsLadderPlaying] = useState(false)
  const [ladderTraces, setLadderTraces] = useState<LadderTrace[]>([])
  const [activeTraceIndex, setActiveTraceIndex] = useState<number | null>(null)
  const [traceProgress, setTraceProgress] = useState(0)
  const [selectedStart, setSelectedStart] = useState<number | null>(null)
  const [lockedStarts, setLockedStarts] = useState<number[]>([])
  const [highlightedResultMap, setHighlightedResultMap] = useState<Record<number, string>>({})
  const timeoutRef = useRef<number | null>(null)
  const ladderTimeoutRef = useRef<number | null>(null)
  const ladderAnimationRef = useRef<number | null>(null)
  const spinDuration = 4200
  const ladderDuration = 2600

  const items = useMemo(() => normalizeItems(itemInputs).filter((item) => item.enabled && item.label).slice(0, MAX_ITEMS), [itemInputs])
  const segmentAngle = items.length > 0 ? 360 / items.length : 360

  useEffect(() => {
    if (mode === 'ladder') {
      setLadderLines(generateLadderLines(items.length))
      setLadderTraces([])
      setActiveTraceIndex(null)
      setTraceProgress(0)
      setSelectedStart(null)
      setLockedStarts([])
      setResult('')
      setHighlightedResultMap({})
      setIsLadderPlaying(false)
    }
  }, [mode, items.length])

  const updateItem = (index: number, value: string) => {
    setItemInputs((prev) => prev.map((item, i) => (i === index ? { ...item, label: value } : item)))
  }

  const toggleItemEnabled = (index: number) => {
    setItemInputs((prev) => prev.map((item, i) => (i === index ? { ...item, enabled: !item.enabled } : item)))
  }

  const addItem = () => {
    setItemInputs((prev) => (prev.length >= MAX_ITEMS ? prev : [...prev, { label: '', enabled: true }]))
  }

  const removeItem = (index: number) => {
    setItemInputs((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length >= 2 ? next : [
        { label: '', enabled: true },
        { label: '', enabled: true },
      ]
    })
  }

  const resetAll = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    if (ladderTimeoutRef.current) window.clearTimeout(ladderTimeoutRef.current)
    if (ladderAnimationRef.current) window.clearInterval(ladderAnimationRef.current)
    timeoutRef.current = null
    ladderTimeoutRef.current = null
    ladderAnimationRef.current = null
    setItemInputs([{ label: '', enabled: true }, { label: '', enabled: true }])
    setRotation(0)
    setResult('')
    setHighlightedResultMap({})
    setIsSpinning(false)
    setLadderLines([])
    setLadderTraces([])
    setActiveTraceIndex(null)
    setTraceProgress(0)
    setSelectedStart(null)
    setLockedStarts([])
    setIsLadderPlaying(false)
  }

  const spin = () => {
  if (isSpinning || items.length < 2) return
  if (timeoutRef.current) window.clearTimeout(timeoutRef.current)

  const winnerIndex = Math.floor(Math.random() * items.length)
  const segmentStart = winnerIndex * segmentAngle
  const margin = Math.min(12, segmentAngle * 0.18)
  const randomInsideSegment =
    segmentStart + margin + Math.random() * Math.max(segmentAngle - margin * 2, segmentAngle * 0.2)

  const currentNormalized = ((rotation % 360) + 360) % 360
  const targetNormalized = (POINTER_ANGLE - randomInsideSegment + 360) % 360

  let delta = (targetNormalized - currentNormalized + 360) % 360
  if (delta < 180) delta += 360

  const extraTurns = 360 * (4 + Math.random() * 5)
  const nextRotation = rotation + extraTurns + delta

  setIsSpinning(true)
  setResult('')
  setRotation(nextRotation)

  timeoutRef.current = window.setTimeout(() => {
    const finalRotation = ((nextRotation % 360) + 360) % 360
    const pointerAngleOnWheel = (((POINTER_ANGLE - finalRotation + 360) % 360) + 0.0001) % 360
    const finalIndex = Math.floor(pointerAngleOnWheel / segmentAngle) % items.length

    setResult(items[finalIndex].label)
    setIsSpinning(false)
    timeoutRef.current = null
  }, spinDuration)
}

  const regenerateLadder = () => {
    setLadderLines(generateLadderLines(items.length))
    setLadderTraces([])
    setActiveTraceIndex(null)
    setTraceProgress(0)
    setSelectedStart(null)
    setLockedStarts([])
    setResult('')
    setHighlightedResultMap({})
    setIsLadderPlaying(false)
  }

  const playLadder = () => {
    if (items.length < 2 || isLadderPlaying || selectedStart === null || lockedStarts.includes(selectedStart)) return
    if (ladderTimeoutRef.current) window.clearTimeout(ladderTimeoutRef.current)
    if (ladderAnimationRef.current) window.clearInterval(ladderAnimationRef.current)

    const built = buildLadderSteps(items.length, ladderLines, selectedStart)
    const totalLength = built.steps.reduce((sum, step) => sum + Math.hypot(step.x2 - step.x1, step.y2 - step.y1), 0)
    const nextTrace: LadderTrace = {
      startIndex: selectedStart,
      endIndex: built.endIndex,
      steps: built.steps,
      length: totalLength,
      color: TRACE_COLORS[lockedStarts.length % TRACE_COLORS.length],
    }

    setIsLadderPlaying(true)
    setResult('')
    setTraceProgress(0)
    setLadderTraces((prev) => [...prev, nextTrace])
    setActiveTraceIndex(lockedStarts.length)
    setLockedStarts((prev) => [...prev, selectedStart])

    const startedAt = performance.now()
    ladderAnimationRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      const nextProgress = Math.min(elapsed / ladderDuration, 1)
      setTraceProgress(nextProgress)
      if (nextProgress >= 1 && ladderAnimationRef.current) {
        window.clearInterval(ladderAnimationRef.current)
        ladderAnimationRef.current = null
      }
    }, 16)

    ladderTimeoutRef.current = window.setTimeout(() => {
      setTraceProgress(1)
      setIsLadderPlaying(false)
      setResult(items[built.endIndex].label)
      setHighlightedResultMap((prev) => ({ ...prev, [built.endIndex]: nextTrace.color }))
      setSelectedStart(null)
      setActiveTraceIndex(null)
      ladderTimeoutRef.current = null
    }, ladderDuration)
  }

  const ladderRowGap = items.length <= 1 ? 0 : (LADDER_BOTTOM - LADDER_TOP) / (items.length - 1)
  const getPathD = (steps: LadderStep[]) => steps.length ? steps.map((step, index) => `${index === 0 ? 'M' : 'L'} ${step.x1} ${step.y1} L ${step.x2} ${step.y2}`).join(' ') : ''

  return (
  <div className="page-shell">
    <div className="page-inner">
      <div className="page-header">
        <div>
          <div className="badge">MVP</div>
          <h1>선택 도구</h1>
          <p>룰렛과 사다리타기를 같은 입력값으로 바로 테스트할 수 있습니다.</p>
        </div>
      </div>

      <div className="mode-switch">
        <Button variant={mode === 'wheel' ? 'primary' : 'outline'} onClick={() => setMode('wheel')}>
          룰렛
        </Button>
        <Button variant={mode === 'ladder' ? 'primary' : 'outline'} onClick={() => setMode('ladder')}>
          사다리타기
        </Button>
      </div>

      <div className="layout-grid">
        <div className="stage-col">
          {mode === 'wheel' ? (
            <div className="wheel-wrap">
              <div className="wheel-pointer" />
              <div
                className="wheel-surface"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: isSpinning ? `transform ${spinDuration}ms cubic-bezier(0.12, 0.9, 0.15, 1)` : 'none',
                }}
              >
                <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="wheel-svg">
                  {items.length === 0 ? (
                    <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} fill="#e2e8f0" />
                  ) : (
                    items.map((item, i) => {
                      const start = i * segmentAngle
                      const end = start + segmentAngle
                      const middle = start + segmentAngle / 2
                      const labelPoint = polarToCartesian(CENTER, CENTER, getLabelRadius(items.length), middle)

                      return (
                        <g key={`${item.label}-${i}`}>
                          <path d={describeSector(start, end, OUTER_RADIUS)} fill={randomPastel(i)} />
                          <foreignObject x={labelPoint.x - 70} y={labelPoint.y - 30} width={140} height={60}>
                            <div className="wheel-label-wrap">
                              <span className={`wheel-label wheel-count-${Math.min(items.length, 7)}`}>
                                {item.label}
                              </span>
                            </div>
                          </foreignObject>
                        </g>
                      )
                    })
                  )}
                  <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS} fill="white" stroke="#e2e8f0" strokeWidth="2" />
                </svg>
                <div className="wheel-center">SPIN</div>
              </div>
            </div>
          ) : (
            <div className="ladder-card">
              <svg viewBox={`0 0 ${LADDER_WIDTH} ${LADDER_HEIGHT}`} className="ladder-svg">
                <rect x="0" y="0" width={LADDER_WIDTH} height={LADDER_HEIGHT} fill="white" />

                {items.map((item, index) => {
                  const y = LADDER_TOP + ladderRowGap * index
                  const lockedTrace = ladderTraces.find((trace) => trace.startIndex === index)
                  const circleFill = lockedTrace
                    ? lockedTrace.color
                    : selectedStart === index
                    ? TRACE_COLORS[lockedStarts.length % TRACE_COLORS.length]
                    : '#e2e8f0'

                  return (
                    <g key={`ladder-${item.label}-${index}`}>
                      <g
                        className={`ladder-picker ${lockedStarts.includes(index) ? 'locked' : ''}`}
                        onClick={() => {
                          if (!lockedStarts.includes(index) && !isLadderPlaying) setSelectedStart(index)
                        }}
                      >
                        <circle cx={32} cy={y} r="12" fill={circleFill} stroke="#64748b" strokeWidth="2" />
                        <text
                          x={32}
                          y={y + 4}
                          textAnchor="middle"
                          fontSize="12"
                          fontWeight="700"
                          fill="#111"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {index + 1}
                        </text>
                      </g>

                      <line
                        x1={LADDER_START_X}
                        y1={y}
                        x2={LADDER_RIGHT}
                        y2={y}
                        stroke="#64748b"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />

                      <foreignObject x={500} y={y - 18} width={120} height={36}>
                        <div
                          className="result-pill"
                          style={
                            highlightedResultMap[index]
                              ? {
                                  border: `3px solid ${highlightedResultMap[index]}`,
                                  background: `${highlightedResultMap[index]}12`,
                                }
                              : undefined
                          }
                        >
                          {item.label}
                        </div>
                      </foreignObject>
                    </g>
                  )
                })}

                {ladderTraces.map((trace, traceIndex) => {
                  const pathD = getPathD(trace.steps)
                  const isActive = activeTraceIndex === traceIndex && isLadderPlaying
                  const visibleProgress = isActive ? traceProgress : 1

                  return (
                    <path
                      key={`trace-${traceIndex}`}
                      d={pathD}
                      fill="none"
                      stroke={trace.color}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - visibleProgress}
                    />
                  )
                })}

                {activeTraceIndex !== null && ladderTraces[activeTraceIndex] && (() => {
                  const activeTrace = ladderTraces[activeTraceIndex]
                  const point = getPointAlongSteps(activeTrace.steps, activeTrace.length, traceProgress)
                  if (!point) return null

                  return (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="8"
                      fill={activeTrace.color}
                      stroke="white"
                      strokeWidth="3"
                    />
                  )
                })()}
              </svg>
            </div>
          )}
        </div>

        <div className="control-col">
          <div className="control-row">
            {mode === 'wheel' ? (
              <Button className="grow" onClick={spin} disabled={isSpinning || items.length < 2}>
                돌리기
              </Button>
            ) : (
              <>
                <Button
                  className="grow"
                  onClick={playLadder}
                  disabled={isLadderPlaying || items.length < 2 || selectedStart === null || lockedStarts.includes(selectedStart)}
                >
                  시작
                </Button>
                <Button
                  variant="outline"
                  onClick={regenerateLadder}
                  disabled={items.length < 2 || isLadderPlaying}
                >
                  재생성
                </Button>
              </>
            )}
            <Button variant="outline" onClick={resetAll}>
              초기화
            </Button>
          </div>

          <div className="panel">
            <div className="panel-title">선택 추가</div>
            <div className="input-list">
              {itemInputs.map((item, index) => (
                <div key={index} className="input-row">
                  <button
                    type="button"
                    aria-label={`항목 ${index + 1} 사용 여부`}
                    onClick={() => toggleItemEnabled(index)}
                    className={`check-toggle ${item.enabled ? 'enabled' : ''}`}
                  >
                    <span className={`check-inner ${item.enabled ? 'visible' : ''}`} />
                  </button>

                  <input
                    value={item.label}
                    onChange={(e) => updateItem(index, e.target.value)}
                    placeholder={`항목 ${index + 1}`}
                    className={`text-input ${item.enabled ? '' : 'dimmed'}`}
                  />

                  <Button
                    variant="outline"
                    onClick={() => removeItem(index)}
                    disabled={itemInputs.length <= 2}
                    className="delete-btn icon-btn"
                    aria-label={`항목 ${index + 1} 삭제`}
                    title="삭제"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="secondary"
              className="full-width"
              onClick={addItem}
              disabled={itemInputs.length >= MAX_ITEMS}
            >
              선택 추가
            </Button>
          </div>

          {mode === 'ladder' && items.length >= 2 && (
            <p className="helper-text">
              사다리 선은 처음부터 자동으로 랜덤 생성됩니다. 위 번호를 하나씩 선택해 시작할 수 있고,
              이미 탄 번호와 경로는 초기화 전까지 유지되며 다시 선택하거나 수정할 수 없습니다.
            </p>
          )}
        </div>
      </div>

      {result && !isSpinning && !isLadderPlaying && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-caption">선택 결과</div>
            <div className="modal-result">{result}</div>
            <Button className="full-width" onClick={() => setResult('')}>
              확인
            </Button>
          </div>
        </div>
      )}
    </div>
  </div>
)
}