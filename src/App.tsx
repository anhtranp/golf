import { useState, useEffect, useRef } from "react"
import {
  Camera,
  Activity,
  CheckCircle2,
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react"
import CameraMotionTracker, {
  CameraMotionTrackerHandle,
} from "./components/CameraMotionTracker"

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = "Address" | "Backswing" | "Top" | "Downswing" | "Impact" | "Follow-through"
type SessionState = "ready" | "recording" | "analyzing" | "complete"

interface PhaseData {
  name: Phase
  order: string
  score: number
  keyMetric: string
  metricValue: string
  targetBenchmark: string
  status: "Optimal" | "Good" | "Needs Work"
  biomechanicsFocus: string
  drillTip: string
  note: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const PHASES: PhaseData[] = [
  {
    name: "Address",
    order: "01",
    score: 91,
    keyMetric: "Stance Width",
    metricValue: '22"',
    targetBenchmark: '21–23"',
    status: "Optimal",
    biomechanicsFocus: "Knee flex, pelvis neutral, 52/48 weight distribution",
    drillTip: "Maintain athletic bend at hip creases, keep spine tilt at 26°.",
    note: "Shoulder-width, balanced address posture",
  },
  {
    name: "Backswing",
    order: "02",
    score: 84,
    keyMetric: "Shoulder Turn",
    metricValue: "89°",
    targetBenchmark: "95°+",
    status: "Good",
    biomechanicsFocus: "Thoracic coil, wide hand path, flexed trail knee",
    drillTip: "Turn chest against stable lower body to maximize kinetic coil.",
    note: "6° below PGA elite shoulder turn benchmark",
  },
  {
    name: "Top",
    order: "03",
    score: 79,
    keyMetric: "Club Plane",
    metricValue: "58°",
    targetBenchmark: "54°–56°",
    status: "Needs Work",
    biomechanicsFocus: "Wrist hinge, lead arm parallel to shoulder line",
    drillTip:
      "Avoid over-swinging; pause briefly at the top to establish transition rhythm.",
    note: "Slightly above standard kinematic plane",
  },
  {
    name: "Downswing",
    order: "04",
    score: 65,
    keyMetric: "Transition Lag",
    metricValue: "+0.08s",
    targetBenchmark: "< 0.00s",
    status: "Needs Work",
    biomechanicsFocus: "Pelvis uncoiling first, elbow shallowing to right hip",
    drillTip:
      "Fire target-side hip forward before shoulders begin rotational unwinding.",
    note: "Hip sequence initiation delayed after shoulder rotation",
  },
  {
    name: "Impact",
    order: "05",
    score: 88,
    keyMetric: "Club Speed",
    metricValue: "94 mph",
    targetBenchmark: "92–98 mph",
    status: "Optimal",
    biomechanicsFocus:
      "Forward shaft lean, square clubface, lead hip cleared 42°",
    drillTip:
      "Deliver hands ahead of the ball for crisp downward strike compression.",
    note: "Strong center face contact with solid compression",
  },
  {
    name: "Follow-through",
    order: "06",
    score: 82,
    keyMetric: "Finish Balance",
    metricValue: "92% Lead",
    targetBenchmark: "90–95%",
    status: "Good",
    biomechanicsFocus: "Full chest facing target, vertical finish on lead foot",
    drillTip: "Hold full finish for 3 seconds to train balanced deceleration.",
    note: "High balanced extension with stable deceleration",
  },
]

const WEAKEST_PHASE = "Downswing"

const PGA_COMPARISONS = [
  {
    label: "Hip Rotation",
    my: "42°",
    pga: "48°",
    myVal: 42,
    pgaVal: 48,
    unit: "°",
  },
  {
    label: "Shoulder Rotation",
    my: "89°",
    pga: "95°",
    myVal: 89,
    pgaVal: 95,
    unit: "°",
  },
  {
    label: "Tempo Ratio",
    my: "2.8:1",
    pga: "3.0:1",
    myVal: 2.8,
    pgaVal: 3.0,
    unit: ":1",
  },
  {
    label: "Club Path",
    my: "−2.3°",
    pga: "−0.8°",
    myVal: 2.3,
    pgaVal: 0.8,
    unit: "°",
  },
  {
    label: "Impact Hand Pos.",
    my: '+1.8"',
    pga: '+0.4"',
    myVal: 1.8,
    pgaVal: 0.4,
    unit: '"',
  },
  {
    label: "Wrist Lag (Peak)",
    my: "68°",
    pga: "82°",
    myVal: 68,
    pgaVal: 82,
    unit: "°",
  },
]

const COACH_INSIGHTS = [
  {
    index: "01",
    phase: "Downswing",
    finding:
      "Hip rotation initiates 0.08s after shoulder turn begins — the reverse of the elite sequence.",
    recommendation:
      'Begin the downswing by firing the left hip toward the target before the shoulders start to unwind. Practice "bump and rotate" drills with a resistance band below the knees.',
    delta: "−0.08 s vs. benchmark",
  },
  {
    index: "02",
    phase: "Backswing",
    finding:
      "Shoulder rotation reaches only 89° at the top — 6° short of the PGA reference model's 95° average.",
    recommendation:
      "Increase thoracic rotation by keeping the right knee flexed through the backswing. Work on shoulder mobility with daily doorframe stretching for 4 weeks.",
    delta: "−6° shoulder turn",
  },
  {
    index: "03",
    phase: "Impact",
    finding:
      "Club path is 2.3° out-to-in, producing mild pull and fade dispersion averaging 8 yards right of target.",
    recommendation:
      "Shallow the downswing by feeling the right elbow slot to the hip. Place a headcover just outside the ball line and swing without touching it.",
    delta: "2.3° out-to-in path",
  },
]

// ── Golfer SVG ───────────────────────────────────────────────────────────────

function GolferVisualization({
  activePhase,
  sessionState,
  isAnimating,
}: {
  activePhase: Phase
  sessionState: SessionState
  isAnimating: boolean
}) {
  const phaseAngles: Record<Phase, {
    shoulder: number
    hip: number
    arm: number
    club: number
  }> = {
    Address: { shoulder: 0, hip: 0, arm: 30, club: 85 },
    Backswing: { shoulder: 45, hip: 20, arm: 70, club: 45 },
    Top: { shoulder: 85, hip: 42, arm: 90, club: 10 },
    Downswing: { shoulder: 40, hip: 38, arm: 50, club: 30 },
    Impact: { shoulder: -10, hip: 35, arm: 15, club: 80 },
    "Follow-through": { shoulder: -35, hip: 40, arm: -30, club: 110 },
  }

  const angles = phaseAngles[activePhase]
  const isActive = sessionState === "complete"

  // Golfer body positions (centered on 200, base at 480)
  const cx = 200
  const headY = 130
  const shoulderY = 175
  const hipY = 270
  const kneeY = 355
  const footY = 440

  // Tracking dot positions vary subtly by phase
  const hipOffset = isActive ? angles.hip * 0.4 : 0
  const shoulderOffset = isActive ? angles.shoulder * 0.35 : 0

  // Club path - varies by phase
  const clubPaths: Record<Phase, string> = {
    Address: `M ${cx - 20} ${shoulderY + 20} L ${cx + 15} ${footY - 20}`,
    Backswing: `M ${cx - 20} ${shoulderY + 20} Q ${cx + 60} ${shoulderY - 30} ${cx + 70} ${shoulderY - 60}`,
    Top: `M ${cx - 20} ${shoulderY + 20} Q ${cx + 80} ${shoulderY - 60} ${cx + 55} ${shoulderY - 100}`,
    Downswing: `M ${cx - 20} ${shoulderY + 20} Q ${cx + 40} ${shoulderY - 40} ${cx + 30} ${shoulderY - 70}`,
    Impact: `M ${cx - 20} ${shoulderY + 20} L ${cx - 5} ${footY - 20}`,
    "Follow-through": `M ${cx - 20} ${shoulderY + 20} Q ${cx - 70} ${shoulderY - 20} ${cx - 80} ${shoulderY - 80}`,
  }

  // Swing trajectory arc
  const trajectoryPath = `M ${cx + 70} ${shoulderY - 80} Q ${cx + 100} ${shoulderY + 30} ${cx + 30} ${hipY} Q ${cx - 10} ${footY - 40} ${cx + 15} ${footY - 20}`

  const showTrajectory = sessionState === "complete"

  return (
    <svg
      viewBox="0 0 400 500"
      className="w-full h-full"
      style={{ maxHeight: "500px" }}
    >
      {/* Background grid lines */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={400 * f}
          y1="60"
          x2={400 * f}
          y2="470"
          stroke="#D4CFC6"
          strokeWidth="0.5"
          strokeDasharray="3,6"
        />
      ))}
      {[0.33, 0.66].map((f) => (
        <line
          key={f}
          x1="40"
          y1={500 * f}
          x2="380"
          y2={500 * f}
          stroke="#D4CFC6"
          strokeWidth="0.5"
          strokeDasharray="3,6"
        />
      ))}

      {/* Ground line */}
      <line
        x1="60"
        y1={footY + 8}
        x2="340"
        y2={footY + 8}
        stroke="#C5CEBC"
        strokeWidth="1.5"
      />

      {/* Mat / address area */}
      <rect
        x="130"
        y={footY + 8}
        width="140"
        height="6"
        rx="2"
        fill="#C5CEBC"
        opacity="0.5"
      />

      {/* Swing trajectory arc */}
      {showTrajectory && (
        <path
          d={trajectoryPath}
          fill="none"
          stroke="#3F5E38"
          strokeWidth="1.5"
          strokeDasharray="5,4"
          opacity="0.4"
          className={isAnimating ? "animate-trace-path" : ""}
        />
      )}

      {/* Club */}
      <path
        d={clubPaths[activePhase]}
        fill="none"
        stroke="#3D3B35"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ transition: "d 0.6s ease" }}
      />

      {/* Club head dot */}
      {activePhase !== "Address" && activePhase !== "Impact" && (
        <circle
          cx={
            activePhase === "Top"
              ? cx + 55
              : activePhase === "Follow-through"
                ? cx - 80
                : cx + 70
          }
          cy={
            activePhase === "Top"
              ? shoulderY - 100
              : activePhase === "Follow-through"
                ? shoulderY - 80
                : shoulderY - 80
          }
          r="5"
          fill="#A8843A"
          className={isAnimating ? "animate-pulse-dot" : ""}
        />
      )}

      {/* Body — torso */}
      <line
        x1={cx}
        y1={shoulderY}
        x2={cx + hipOffset * 0.5}
        y2={hipY}
        stroke="#252420"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Pelvis line */}
      <line
        x1={cx - 18 + hipOffset * 0.3}
        y1={hipY}
        x2={cx + 18 + hipOffset * 0.3}
        y2={hipY - 4}
        stroke="#252420"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Shoulder line */}
      <line
        x1={cx - 24 + shoulderOffset * 0.2}
        y1={shoulderY}
        x2={cx + 24 + shoulderOffset * 0.2}
        y2={shoulderY - 2}
        stroke="#252420"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Left leg */}
      <line
        x1={cx - 12 + hipOffset * 0.2}
        y1={hipY}
        x2={cx - 14}
        y2={kneeY}
        stroke="#252420"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1={cx - 14}
        y1={kneeY}
        x2={cx - 12}
        y2={footY + 6}
        stroke="#252420"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Right leg */}
      <line
        x1={cx + 12 + hipOffset * 0.2}
        y1={hipY}
        x2={cx + 16}
        y2={kneeY}
        stroke="#252420"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1={cx + 16}
        y1={kneeY}
        x2={cx + 14}
        y2={footY + 6}
        stroke="#252420"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Right arm */}
      <line
        x1={cx + 20 + shoulderOffset * 0.2}
        y1={shoulderY}
        x2={cx - 20 + angles.arm * 0.3}
        y2={shoulderY + 55}
        stroke="#252420"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Left arm / lead arm */}
      <line
        x1={cx - 20 + shoulderOffset * 0.2}
        y1={shoulderY}
        x2={cx - 20 + angles.arm * 0.3}
        y2={shoulderY + 55}
        stroke="#252420"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Head */}
      <circle
        cx={cx + shoulderOffset * 0.1}
        cy={headY}
        r="22"
        fill="none"
        stroke="#252420"
        strokeWidth="2.5"
      />
      {/* Face dot */}
      <circle
        cx={cx + shoulderOffset * 0.1 + 6}
        cy={headY + 2}
        r="2"
        fill="#252420"
        opacity="0.4"
      />
      {/* Neck */}
      <line
        x1={cx + shoulderOffset * 0.1}
        y1={headY + 22}
        x2={cx}
        y2={shoulderY}
        stroke="#252420"
        strokeWidth="2"
      />

      {/* ── Tracking dots ── */}
      {/* Shoulders */}
      <circle
        cx={cx - 24 + shoulderOffset * 0.2}
        cy={shoulderY}
        r="6"
        fill="white"
        stroke="#3F5E38"
        strokeWidth="2"
        className="tracking-dot"
      />
      <circle
        cx={cx + 24 + shoulderOffset * 0.2}
        cy={shoulderY}
        r="6"
        fill="white"
        stroke="#3F5E38"
        strokeWidth="2"
        className="tracking-dot"
      />
      <circle
        cx={cx - 24 + shoulderOffset * 0.2}
        cy={shoulderY}
        r="2.5"
        fill="#3F5E38"
      />
      <circle
        cx={cx + 24 + shoulderOffset * 0.2}
        cy={shoulderY}
        r="2.5"
        fill="#3F5E38"
      />

      {/* Hips */}
      <circle
        cx={cx - 18 + hipOffset * 0.3}
        cy={hipY}
        r="6"
        fill="white"
        stroke="#A8843A"
        strokeWidth="2"
        className="tracking-dot"
      />
      <circle
        cx={cx + 18 + hipOffset * 0.3}
        cy={hipY - 4}
        r="6"
        fill="white"
        stroke="#A8843A"
        strokeWidth="2"
        className="tracking-dot"
      />
      <circle cx={cx - 18 + hipOffset * 0.3} cy={hipY} r="2.5" fill="#A8843A" />
      <circle
        cx={cx + 18 + hipOffset * 0.3}
        cy={hipY - 4}
        r="2.5"
        fill="#A8843A"
      />

      {/* Hands */}
      <circle
        cx={cx - 20 + angles.arm * 0.3}
        cy={shoulderY + 55}
        r="6"
        fill="white"
        stroke="#5A7A52"
        strokeWidth="2"
        className="tracking-dot"
      />
      <circle
        cx={cx - 20 + angles.arm * 0.3}
        cy={shoulderY + 55}
        r="2.5"
        fill="#5A7A52"
      />

      {/* Knees */}
      <circle
        cx={cx - 14}
        cy={kneeY}
        r="4"
        fill="white"
        stroke="#8FA888"
        strokeWidth="1.5"
        className="tracking-dot"
      />
      <circle
        cx={cx + 16}
        cy={kneeY}
        r="4"
        fill="white"
        stroke="#8FA888"
        strokeWidth="1.5"
        className="tracking-dot"
      />
      <circle cx={cx - 14} cy={kneeY} r="1.5" fill="#8FA888" />
      <circle cx={cx + 16} cy={kneeY} r="1.5" fill="#8FA888" />

      {/* Club head */}
      <circle
        cx={cx + 15}
        cy={footY - 20}
        r="5"
        fill="white"
        stroke="#252420"
        strokeWidth="2"
        className={`tracking-dot ${isAnimating ? "animate-pulse-dot" : ""}`}
        style={{ animationDelay: "0.2s" }}
      />

      {/* Legend */}
      <g transform="translate(290, 140)">
        <circle
          cx="6"
          cy="6"
          r="4"
          fill="white"
          stroke="#3F5E38"
          strokeWidth="1.5"
        />
        <text
          x="14"
          y="10"
          fontSize="9"
          fill="#6B6860"
          fontFamily="'DM Sans', sans-serif"
        >
          Shoulders
        </text>
        <circle
          cx="6"
          cy="22"
          r="4"
          fill="white"
          stroke="#A8843A"
          strokeWidth="1.5"
        />
        <text
          x="14"
          y="26"
          fontSize="9"
          fill="#6B6860"
          fontFamily="'DM Sans', sans-serif"
        >
          Hips
        </text>
        <circle
          cx="6"
          cy="38"
          r="4"
          fill="white"
          stroke="#5A7A52"
          strokeWidth="1.5"
        />
        <text
          x="14"
          y="42"
          fontSize="9"
          fill="#6B6860"
          fontFamily="'DM Sans', sans-serif"
        >
          Hands
        </text>
        <circle
          cx="6"
          cy="54"
          r="4"
          fill="white"
          stroke="#8FA888"
          strokeWidth="1.5"
        />
        <text
          x="14"
          y="58"
          fontSize="9"
          fill="#6B6860"
          fontFamily="'DM Sans', sans-serif"
        >
          Knees
        </text>
      </g>

      {/* Phase label */}
      {sessionState === "complete" && (
        <g>
          <text
            x="20"
            y="30"
            fontSize="10"
            fill="#3F5E38"
            fontFamily="'DM Mono', monospace"
            letterSpacing="0.08em"
            textAnchor="start"
            style={{ textTransform: "uppercase" }}
          >
            PHASE
          </text>
          <text
            x="20"
            y="48"
            fontSize="18"
            fill="#252420"
            fontFamily="'Playfair Display', serif"
            fontWeight="600"
          >
            {activePhase}
          </text>
        </g>
      )}
    </svg>
  )
}

// ── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({
  score,
  size = 120,
  strokeWidth,
}: {
  score: number
  size?: number
  strokeWidth?: number
}) {
  const sw = strokeWidth || (size < 70 ? 4 : 7)
  const r = (size - sw * 2 - 2) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#EFF3EE"
        strokeWidth={sw}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={score >= 85 ? "#3F5E38" : score >= 70 ? "#A8843A" : "#C0503A"}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 1s ease" }}
      />
      <text
        x="50%"
        y="48%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.24}
        fontWeight="600"
        fill="#252420"
        fontFamily="'Playfair Display', serif"
      >
        {score}
      </text>
      <text
        x="50%"
        y="68%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.11}
        fill="#6B6860"
        fontFamily="'DM Sans', sans-serif"
      >
        / 100
      </text>
    </svg>
  )
}

// ── Bar comparison ───────────────────────────────────────────────────────────

function ComparisonBar({
  label,
  my,
  pga,
  myVal,
  pgaVal,
}: {
  label: string
  my: string
  pga: string
  myVal: number
  pgaVal: number
}) {
  const max = Math.max(myVal, pgaVal) * 1.2
  const myPct = (myVal / max) * 100
  const pgaPct = (pgaVal / max) * 100
  const diff = Math.abs(myVal - pgaVal)
  const pct = (diff / pgaVal) * 100

  return (
    <div className="py-3" style={{ borderBottom: "1px solid #D4CFC6" }}>
      <div className="flex justify-between items-baseline mb-2">
        <span
          style={{
            fontSize: "11px",
            letterSpacing: "0.06em",
            color: "#6B6860",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: "10px",
            color: "#C0503A",
            fontFamily: "var(--font-mono)",
          }}
        >
          {pct > 5 ? `${pct.toFixed(0)}% off` : "On target"}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            style={{
              width: "28px",
              fontSize: "9px",
              color: "#3F5E38",
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}
          >
            You
          </span>
          <div
            style={{
              flex: 1,
              height: "6px",
              backgroundColor: "#EFF3EE",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${myPct}%`,
                height: "100%",
                backgroundColor: "#3F5E38",
                borderRadius: "3px",
                transition: "width 0.8s ease",
              }}
            />
          </div>
          <span
            style={{
              width: "40px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "#252420",
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {my}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            style={{
              width: "28px",
              fontSize: "9px",
              color: "#A8843A",
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}
          >
            PGA
          </span>
          <div
            style={{
              flex: 1,
              height: "6px",
              backgroundColor: "#EFF3EE",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pgaPct}%`,
                height: "100%",
                backgroundColor: "#A8843A",
                borderRadius: "3px",
              }}
            />
          </div>
          <span
            style={{
              width: "40px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "#252420",
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {pga}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activePhase, setActivePhase] = useState<Phase>("Impact")
  const [sessionState, setSessionState] = useState<SessionState>("ready")
  const [vizMode, setVizMode] = useState<"camera" | "diagram">("camera")
  const [isAnimating, setIsAnimating] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [showResults, setShowResults] = useState(false)
  const [capturedNotification, setCapturedNotification] =
    useState<string | null>(null)
  const [recordedClubSpeed, setRecordedClubSpeed] = useState("94")
  const [recordedShoulderTurn, setRecordedShoulderTurn] = useState("89°")
  const [recordedHipRotation, setRecordedHipRotation] = useState("42°")
  const analysisRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const trackerRef = useRef<CameraMotionTrackerHandle | null>(null)
  const [isTrackerFullscreen, setIsTrackerFullscreen] = useState(false)

  const activePhaseData = PHASES.find((p) => p.name === activePhase)!
  const overallScore = Math.round(
    PHASES.reduce((sum, p) => sum + p.score, 0) / PHASES.length,
  )
  const weakestPhaseScore = Math.min(...PHASES.map((p) => p.score))
  const consistencyScore = 82

  function handleCameraSwingCaptured(metrics: {
    shoulderTurn: number
    hipRotation: number
    phase: string
    clubSpeed: number
  }) {
    setSessionState("complete")
    setShowResults(true)
    if (
      [
        "Address",
        "Backswing",
        "Top",
        "Downswing",
        "Impact",
        "Follow-through",
      ].includes(metrics.phase)
    ) {
      setActivePhase(metrics.phase as Phase)
    } else {
      setActivePhase("Impact")
    }
    setRecordedClubSpeed(`${metrics.clubSpeed}`)
    setRecordedShoulderTurn(`${metrics.shoulderTurn}°`)
    setRecordedHipRotation(`${metrics.hipRotation}°`)
    setCapturedNotification(
      `AI Motion Tracked: ${metrics.shoulderTurn}° shoulder turn · ${metrics.hipRotation}° hip rotation · ${metrics.phase} detected`,
    )
    setTimeout(() => setCapturedNotification(null), 6000)
  }

  function handleStartSwing() {
    setSessionState("recording")
    setShowResults(false)
    setAnalysisProgress(0)
    setTimeout(() => {
      handleAnalyze()
    }, 2200)
  }

  function handleAnalyze() {
    setSessionState("analyzing")
    setAnalysisProgress(0)
    analysisRef.current = setInterval(() => {
      setAnalysisProgress((p) => {
        if (p >= 100) {
          clearInterval(analysisRef.current!)
          setSessionState("complete")
          setShowResults(true)
          setActivePhase("Impact")
          return 100
        }
        return p + 4
      })
    }, 60)
  }

  function handleReplay() {
    if (sessionState !== "complete") return
    setIsAnimating(true)
    const phases: Phase[] = [
      "Address",
      "Backswing",
      "Top",
      "Downswing",
      "Impact",
      "Follow-through",
    ]
    let i = 0
    const interval = setInterval(() => {
      if (i < phases.length) {
        setActivePhase(phases[i])
        i++
      } else {
        clearInterval(interval)
        setIsAnimating(false)
        setActivePhase("Impact")
      }
    }, 700)
  }

  useEffect(() => {
    return () => {
      if (analysisRef.current) clearInterval(analysisRef.current)
    }
  }, [])

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-canvas)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-warm-white)",
        }}
      >
        <div
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: "0 40px",
            height: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle
                cx="11"
                cy="11"
                r="10"
                stroke="#3F5E38"
                strokeWidth="1.5"
              />
              <line
                x1="11"
                y1="4"
                x2="11"
                y2="18"
                stroke="#3F5E38"
                strokeWidth="1.5"
              />
              <path
                d="M6 8 Q11 11 16 8"
                stroke="#3F5E38"
                strokeWidth="1.2"
                fill="none"
              />
            </svg>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--color-charcoal)",
                fontWeight: "600",
              }}
            >
              Motion Capture Studio
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor:
                  sessionState === "recording"
                    ? "#C0503A"
                    : sessionState === "analyzing"
                      ? "#A8843A"
                      : sessionState === "complete"
                        ? "#3F5E38"
                        : "#D4CFC6",
                transition: "background-color 0.4s ease",
              }}
              className={
                sessionState === "recording" ? "animate-pulse-dot" : ""
              }
            />
            <span
              style={{
                fontSize: "11px",
                letterSpacing: "0.08em",
                color: "var(--color-charcoal-soft)",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
              }}
            >
              {sessionState === "ready"
                ? "Sensor Ready"
                : sessionState === "recording"
                  ? "Recording…"
                  : sessionState === "analyzing"
                    ? "Processing…"
                    : "Analysis Complete"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <span
              style={{
                fontSize: "11px",
                color: "var(--color-charcoal-soft)",
                fontFamily: "var(--font-mono)",
                alignSelf: "center",
              }}
            >
              Sep 20, 2026 · 9:41 AM
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main
        style={{ maxWidth: "1440px", margin: "0 auto", padding: "32px 40px" }}
      >
        {/* ── Top Row: Full-Width Motion Capture Visualization ── */}
        <div style={{ marginBottom: "28px" }}>
          {/* Visualization Panel */}
          <div
            style={{
              backgroundColor: "var(--color-warm-white)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              padding: "24px 28px",
              position: "relative",
              minHeight: "620px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header with Title, Mode Switcher, and Controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "18px",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--color-charcoal-soft)",
                    fontFamily: "var(--font-mono)",
                    marginBottom: "4px",
                  }}
                >
                  Swing Analysis
                </p>
                <h1
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "24px",
                    fontWeight: "500",
                    color: "var(--color-charcoal)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                  }}
                >
                  Motion Capture
                  <br />
                  <span style={{ fontStyle: "italic", color: "#3F5E38" }}>
                    Visualization
                  </span>
                </h1>
              </div>

              {/* Controls & Mode Switcher */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                {/* View Mode Toggle */}
                <div
                  style={{
                    display: "flex",
                    backgroundColor: "#EFF3EE",
                    borderRadius: "4px",
                    padding: "3px",
                    border: "1px solid #D4CFC6",
                  }}
                >
                  <button
                    onClick={() => setVizMode("camera")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 14px",
                      fontSize: "11px",
                      fontWeight: "600",
                      borderRadius: "3px",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      backgroundColor:
                        vizMode === "camera"
                          ? "var(--color-green-fairway)"
                          : "transparent",
                      color:
                        vizMode === "camera"
                          ? "#FFFFFF"
                          : "var(--color-charcoal-soft)",
                    }}
                  >
                    <Camera size={13} />
                    <span>Live Camera Tracking</span>
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: "#22C55E",
                      }}
                      className="animate-pulse"
                    />
                  </button>

                  <button
                    onClick={() => setVizMode("diagram")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 14px",
                      fontSize: "11px",
                      fontWeight: "600",
                      borderRadius: "3px",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      backgroundColor:
                        vizMode === "diagram"
                          ? "var(--color-green-fairway)"
                          : "transparent",
                      color:
                        vizMode === "diagram"
                          ? "#FFFFFF"
                          : "var(--color-charcoal-soft)",
                    }}
                  >
                    <Activity size={13} />
                    <span>3D Model Diagram</span>
                  </button>
                </div>

                {/* Full Screen / Expand View Button for Tracker */}
                {vizMode === "camera" && (
                  <button
                    onClick={() => trackerRef.current?.toggleFullscreen()}
                    title={
                      isTrackerFullscreen
                        ? "Exit Full Screen (Esc or F)"
                        : "Expand to Full Screen (F)"
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 13px",
                      fontSize: "11px",
                      fontWeight: "600",
                      borderRadius: "4px",
                      border: isTrackerFullscreen
                        ? "1px solid #22C55E"
                        : "1px solid #C5CEBC",
                      cursor: "pointer",
                      backgroundColor: isTrackerFullscreen
                        ? "var(--color-green-fairway)"
                        : "#FFFFFF",
                      color: isTrackerFullscreen
                        ? "#FFFFFF"
                        : "var(--color-charcoal)",
                      transition: "all 0.2s ease",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}
                  >
                    {isTrackerFullscreen ? (
                      <Minimize2 size={13} />
                    ) : (
                      <Maximize2 size={13} />
                    )}
                    <span>
                      {isTrackerFullscreen ? "Exit Full Screen" : "Full Screen"}
                    </span>
                  </button>
                )}

                {/* Legacy Diagram Controls (visible when in diagram mode) */}
                {vizMode === "diagram" && (
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      className="control-btn"
                      onClick={handleStartSwing}
                      disabled={
                        sessionState === "recording" ||
                        sessionState === "analyzing"
                      }
                      style={{
                        padding: "7px 14px",
                        backgroundColor:
                          sessionState === "ready" ||
                          sessionState === "complete"
                            ? "var(--color-green-fairway)"
                            : "var(--color-border)",
                        color:
                          sessionState === "ready" ||
                          sessionState === "complete"
                            ? "white"
                            : "var(--color-charcoal-soft)",
                        border: "none",
                        borderRadius: "2px",
                        fontSize: "11px",
                        fontWeight: "500",
                        letterSpacing: "0.06em",
                        cursor:
                          sessionState === "ready" ||
                          sessionState === "complete"
                            ? "pointer"
                            : "not-allowed",
                      }}
                    >
                      {sessionState === "recording" ? "● REC" : "Start Swing"}
                    </button>
                    <button
                      className="control-btn"
                      onClick={handleAnalyze}
                      disabled={sessionState !== "recording"}
                      style={{
                        padding: "7px 14px",
                        backgroundColor: "transparent",
                        color:
                          sessionState === "recording"
                            ? "var(--color-charcoal)"
                            : "var(--color-charcoal-soft)",
                        border: `1px solid ${
                          sessionState === "recording"
                            ? "var(--color-charcoal)"
                            : "var(--color-border)"
                        }`,
                        borderRadius: "2px",
                        fontSize: "11px",
                        fontWeight: "500",
                        letterSpacing: "0.06em",
                        cursor:
                          sessionState === "recording"
                            ? "pointer"
                            : "not-allowed",
                      }}
                    >
                      Analyze
                    </button>
                    <button
                      className="control-btn"
                      onClick={handleReplay}
                      disabled={sessionState !== "complete" || isAnimating}
                      style={{
                        padding: "7px 14px",
                        backgroundColor: "transparent",
                        color:
                          sessionState === "complete" && !isAnimating
                            ? "var(--color-accent-gold)"
                            : "var(--color-charcoal-soft)",
                        border: `1px solid ${
                          sessionState === "complete" && !isAnimating
                            ? "var(--color-accent-gold)"
                            : "var(--color-border)"
                        }`,
                        borderRadius: "2px",
                        fontSize: "11px",
                        fontWeight: "500",
                        letterSpacing: "0.06em",
                        cursor:
                          sessionState === "complete" && !isAnimating
                            ? "pointer"
                            : "not-allowed",
                      }}
                    >
                      {isAnimating ? "▶ Playing…" : "Replay"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Notification Banner when swing captured from live camera */}
            {capturedNotification && (
              <div
                style={{
                  marginBottom: "14px",
                  padding: "10px 16px",
                  backgroundColor: "#EFF3EE",
                  border: "1px solid #C5CEBC",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <CheckCircle2 size={16} color="#3F5E38" />
                <span
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    color: "#3F5E38",
                    fontWeight: 500,
                  }}
                >
                  {capturedNotification}
                </span>
              </div>
            )}

            {/* Viewport Area */}
            <div
              style={{
                flex: 1,
                minHeight: "520px",
                position: "relative",
                display: "flex",
              }}
            >
              {vizMode === "camera" ? (
                <CameraMotionTracker
                  ref={trackerRef}
                  activePhase={activePhase}
                  onPhaseDetected={(phase) => {
                    if (
                      [
                        "Address",
                        "Backswing",
                        "Top",
                        "Downswing",
                        "Impact",
                        "Follow-through",
                      ].includes(phase)
                    ) {
                      setActivePhase(phase as Phase)
                    }
                  }}
                  onSwingCaptured={handleCameraSwingCaptured}
                  onFullscreenChange={(fs) => setIsTrackerFullscreen(fs)}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                  }}
                >
                  {/* Analysis progress bar */}
                  {sessionState === "analyzing" && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "0",
                        left: "0",
                        right: "0",
                        height: "3px",
                        backgroundColor: "var(--color-border)",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          backgroundColor: "var(--color-green-fairway)",
                          width: `${analysisProgress}%`,
                          transition: "width 0.15s linear",
                        }}
                      />
                    </div>
                  )}

                  {/* Empty state */}
                  {sessionState === "ready" && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: "64px",
                          height: "64px",
                          border: "1px dashed var(--color-border-green)",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          width="28"
                          height="28"
                          viewBox="0 0 28 28"
                          fill="none"
                        >
                          <circle
                            cx="14"
                            cy="6"
                            r="4"
                            stroke="#8FA888"
                            strokeWidth="1.5"
                          />
                          <line
                            x1="14"
                            y1="10"
                            x2="14"
                            y2="18"
                            stroke="#8FA888"
                            strokeWidth="1.5"
                          />
                          <line
                            x1="10"
                            y1="13"
                            x2="18"
                            y2="13"
                            stroke="#8FA888"
                            strokeWidth="1.5"
                          />
                          <line
                            x1="14"
                            y1="18"
                            x2="11"
                            y2="24"
                            stroke="#8FA888"
                            strokeWidth="1.5"
                          />
                          <line
                            x1="14"
                            y1="18"
                            x2="17"
                            y2="24"
                            stroke="#8FA888"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </div>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "var(--color-charcoal-soft)",
                          textAlign: "center",
                          lineHeight: 1.5,
                        }}
                      >
                        Step onto the mat and press
                        <br />
                        <strong style={{ color: "var(--color-green-fairway)" }}>
                          Start Swing
                        </strong>{" "}
                        when ready
                      </p>
                    </div>
                  )}

                  {sessionState === "analyzing" && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "42px",
                          fontWeight: "500",
                          color: "var(--color-green-fairway)",
                        }}
                      >
                        {analysisProgress}
                        <span style={{ fontSize: "20px" }}>%</span>
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          letterSpacing: "0.08em",
                          color: "var(--color-charcoal-soft)",
                          fontFamily: "var(--font-mono)",
                          textTransform: "uppercase",
                        }}
                      >
                        Analyzing motion data
                      </p>
                    </div>
                  )}

                  {sessionState === "complete" && (
                    <div style={{ marginTop: "20px" }}>
                      <GolferVisualization
                        activePhase={activePhase}
                        sessionState={sessionState}
                        isAnimating={isAnimating}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Phase Timeline ── */}
        <div style={{ marginBottom: "28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "14px",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "baseline", gap: "12px" }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "20px",
                  fontWeight: "500",
                  color: "var(--color-charcoal)",
                  letterSpacing: "-0.01em",
                }}
              >
                Phase Performance
              </h2>
              <span
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--color-charcoal-soft)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Click to inspect kinematic details
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 10px",
                backgroundColor: "var(--color-green-tint)",
                border: "1px solid var(--color-border-green)",
                borderRadius: "3px",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#22C55E",
                }}
                className="animate-pulse"
              />
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--color-green-fairway)",
                }}
              >
                Active Tracking Phase:{" "}
                <strong style={{ color: "var(--color-charcoal)" }}>
                  {activePhase}
                </strong>
              </span>
            </div>
          </div>

          {/* 6 Phase Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: "10px",
            }}
          >
            {PHASES.map((phase) => {
              const isWeakest = phase.score === weakestPhaseScore
              const isSelected = phase.name === activePhase
              return (
                <div
                  key={phase.name}
                  className={`phase-card ${isSelected ? "active" : ""} ${
                    isWeakest ? "weakest" : ""
                  }`}
                  onClick={() => setActivePhase(phase.name)}
                  style={{
                    backgroundColor: isSelected
                      ? isWeakest
                        ? "var(--color-weak-light)"
                        : "var(--color-green-tint)"
                      : "var(--color-warm-white)",
                    border: `1px solid ${
                      isWeakest
                        ? "var(--color-weak)"
                        : isSelected
                          ? "var(--color-green-fairway)"
                          : "var(--color-border)"
                    }`,
                    borderRadius: "4px",
                    padding: "16px 14px",
                    cursor: "pointer",
                    opacity: 1,
                    position: "relative",
                    boxShadow: isSelected
                      ? "0 2px 8px rgba(63, 94, 56, 0.12)"
                      : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      {isSelected && (
                        <div
                          style={{
                            width: "5px",
                            height: "5px",
                            borderRadius: "50%",
                            backgroundColor: "#22C55E",
                          }}
                          className="animate-pulse"
                        />
                      )}
                      <span
                        style={{
                          fontSize: "10px",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: isWeakest
                            ? "var(--color-weak)"
                            : isSelected
                              ? "var(--color-green-fairway)"
                              : "var(--color-charcoal-soft)",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                        }}
                      >
                        {phase.order} {phase.name}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "8px",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: isWeakest
                          ? "var(--color-weak)"
                          : phase.status === "Optimal"
                            ? "var(--color-green-fairway)"
                            : "var(--color-charcoal-soft)",
                        fontFamily: "var(--font-mono)",
                        backgroundColor: isWeakest
                          ? "var(--color-weak-light)"
                          : "rgba(0,0,0,0.04)",
                        padding: "1px 5px",
                        borderRadius: "2px",
                        border: `1px solid ${
                          isWeakest ? "var(--color-weak)" : "transparent"
                        }`,
                      }}
                    >
                      {isWeakest ? "Weakest" : phase.status}
                    </span>
                  </div>

                  {/* Score bar */}
                  <div style={{ marginBottom: "8px" }}>
                    <div
                      style={{
                        height: "3px",
                        backgroundColor: "var(--color-border)",
                        borderRadius: "2px",
                        overflow: "hidden",
                        marginBottom: "4px",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: showResults ? `${phase.score}%` : "40%",
                          backgroundColor: isWeakest
                            ? "var(--color-weak)"
                            : "#3F5E38",
                          borderRadius: "2px",
                          transition: "width 0.8s ease",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: "28px",
                        fontWeight: "500",
                        color: isWeakest
                          ? "var(--color-weak)"
                          : "var(--color-charcoal)",
                        lineHeight: 1,
                      }}
                    >
                      {showResults ? phase.score : "—"}
                    </div>
                  </div>

                  <div>
                    <p
                      style={{
                        fontSize: "10px",
                        color: "var(--color-charcoal-soft)",
                        fontFamily: "var(--font-mono)",
                        marginBottom: "1px",
                      }}
                    >
                      {phase.keyMetric}
                    </p>
                    <p
                      style={{
                        fontSize: "12px",
                        fontWeight: "500",
                        color: "var(--color-charcoal)",
                      }}
                    >
                      {phase.metricValue}
                    </p>
                    <p
                      style={{
                        fontSize: "9px",
                        color: "var(--color-charcoal-soft)",
                        fontFamily: "var(--font-mono)",
                        marginTop: "2px",
                      }}
                    >
                      Tgt: {phase.targetBenchmark}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Detailed Interactive Biomechanics & AI Drill Inspector */}
          <div
            className="animate-fade-in"
            style={{
              marginTop: "12px",
              backgroundColor: "var(--color-warm-white)",
              border: "1px solid var(--color-border-green)",
              borderRadius: "4px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--color-border)",
                paddingBottom: "8px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--color-green-fairway)",
                    fontWeight: 600,
                  }}
                >
                  Phase {activePhaseData.order} · {activePhase}
                </span>
                <span
                  style={{
                    fontSize: "9px",
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "2px 7px",
                    borderRadius: "3px",
                    backgroundColor:
                      activePhaseData.score === weakestPhaseScore
                        ? "var(--color-weak-light)"
                        : "var(--color-green-tint)",
                    color:
                      activePhaseData.score === weakestPhaseScore
                        ? "var(--color-weak)"
                        : "var(--color-green-fairway)",
                    border: `1px solid ${
                      activePhaseData.score === weakestPhaseScore
                        ? "var(--color-weak)"
                        : "var(--color-border-green)"
                    }`,
                  }}
                >
                  {activePhaseData.score === weakestPhaseScore
                    ? "Primary Focus Area"
                    : activePhaseData.status}
                </span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--color-charcoal-soft)",
                  }}
                >
                  {activePhaseData.keyMetric}:{" "}
                  <strong style={{ color: "var(--color-charcoal)" }}>
                    {activePhaseData.metricValue}
                  </strong>
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--color-charcoal-soft)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  (Target: {activePhaseData.targetBenchmark})
                </span>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr",
                gap: "20px",
                alignItems: "start",
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--color-charcoal-soft)",
                    display: "block",
                    marginBottom: "2px",
                  }}
                >
                  Camera Motion Tracking Biomechanics
                </span>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-charcoal)",
                    lineHeight: "1.5",
                  }}
                >
                  {activePhaseData.note}.{" "}
                  <span
                    style={{
                      color: "var(--color-charcoal-soft)",
                      fontSize: "12px",
                    }}
                  >
                    Tracked points: {activePhaseData.biomechanicsFocus}.
                  </span>
                </p>
              </div>

              <div
                style={{
                  paddingLeft: "14px",
                  borderLeft: "2px solid var(--color-green-fairway)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--color-green-fairway)",
                    display: "block",
                    marginBottom: "2px",
                  }}
                >
                  Actionable AI Coach Cue & Drill
                </span>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--color-charcoal)",
                    lineHeight: "1.5",
                  }}
                >
                  {activePhaseData.drillTip}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── PGA Comparison + AI Coach ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
          }}
        >
          {/* PGA Comparison */}
          <div
            style={{
              backgroundColor: "var(--color-warm-white)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              padding: "28px",
            }}
          >
            <div style={{ marginBottom: "20px" }}>
              <p
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--color-charcoal-soft)",
                  fontFamily: "var(--font-mono)",
                  marginBottom: "4px",
                }}
              >
                Benchmark Comparison
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "20px",
                  fontWeight: "500",
                  color: "var(--color-charcoal)",
                  letterSpacing: "-0.01em",
                }}
              >
                My Swing vs.{" "}
                <span style={{ fontStyle: "italic" }}>PGA Reference Model</span>
              </h2>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "3px",
                    backgroundColor: "#3F5E38",
                    borderRadius: "2px",
                  }}
                />
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--color-charcoal-soft)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Your swing
                </span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "3px",
                    backgroundColor: "#A8843A",
                    borderRadius: "2px",
                  }}
                />
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--color-charcoal-soft)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  PGA benchmark
                </span>
              </div>
            </div>

            <div>
              {PGA_COMPARISONS.map((c) => (
                <ComparisonBar key={c.label} {...c} />
              ))}
            </div>

            {!showResults && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  backgroundColor: "var(--color-green-tint)",
                  borderRadius: "2px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--color-charcoal-soft)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Complete a swing to see comparison data
                </p>
              </div>
            )}
          </div>

          {/* AI Coach */}
          <div
            style={{
              backgroundColor: "var(--color-warm-white)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              padding: "28px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "20px",
                flexWrap: "wrap",
                gap: "14px",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--color-charcoal-soft)",
                    fontFamily: "var(--font-mono)",
                    marginBottom: "4px",
                  }}
                >
                  AI Coach
                </p>
                <h2
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "20px",
                    fontWeight: "500",
                    color: "var(--color-charcoal)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Coaching <span style={{ fontStyle: "italic" }}>Insights</span>
                </h2>
              </div>

              {/* Overall Score & Consistency Executive Summary in Coaching Insights */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  backgroundColor: "var(--color-canvas)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "4px",
                  padding: "8px 14px",
                }}
              >
                {/* Overall Score */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <ScoreRing score={overallScore} size={46} strokeWidth={4} />
                  <div>
                    <span
                      style={{
                        fontSize: "9px",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--color-charcoal-soft)",
                        fontFamily: "var(--font-mono)",
                        display: "block",
                      }}
                    >
                      Overall Score
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "3px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "17px",
                          fontWeight: "600",
                          color: "var(--color-charcoal)",
                        }}
                      >
                        {showResults ? overallScore : "—"}
                      </span>
                      <span
                        style={{
                          fontSize: "9px",
                          color: "var(--color-green-fairway)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {showResults ? "· Top 18%" : ""}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    width: "1px",
                    height: "32px",
                    backgroundColor: "var(--color-border)",
                  }}
                />

                {/* Consistency */}
                <div>
                  <span
                    style={{
                      fontSize: "9px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--color-charcoal-soft)",
                      fontFamily: "var(--font-mono)",
                      display: "block",
                    }}
                  >
                    Consistency
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "3px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: "17px",
                        fontWeight: "600",
                        color: "var(--color-charcoal)",
                      }}
                    >
                      {showResults ? `${consistencyScore}%` : "—"}
                    </span>
                    <span
                      style={{
                        fontSize: "9px",
                        color: "var(--color-charcoal-soft)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {showResults ? "· 12 swings" : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {COACH_INSIGHTS.map((insight, i) => (
                <div
                  key={insight.index}
                  className={showResults ? "animate-fade-in" : ""}
                  style={{
                    paddingTop: "16px",
                    paddingBottom: "20px",
                    borderBottom:
                      i < COACH_INSIGHTS.length - 1
                        ? "1px solid var(--color-border)"
                        : "none",
                    animationDelay: `${i * 0.15}s`,
                    opacity: showResults ? undefined : 0.4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "10px",
                      marginBottom: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--color-green-fairway)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {insight.index}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--color-charcoal-soft)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {insight.phase}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: "10px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--color-weak)",
                        backgroundColor: "var(--color-weak-light)",
                        padding: "1px 7px",
                        borderRadius: "2px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {insight.delta}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--color-charcoal)",
                      lineHeight: "1.6",
                      marginBottom: "8px",
                    }}
                  >
                    {insight.finding}
                  </p>
                  <div
                    style={{
                      paddingLeft: "12px",
                      borderLeft: "2px solid var(--color-green-fairway)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--color-charcoal-soft)",
                        lineHeight: "1.6",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: "var(--color-green-fairway)",
                          display: "block",
                          marginBottom: "2px",
                        }}
                      >
                        Recommendation
                      </span>
                      {insight.recommendation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            marginTop: "28px",
            paddingTop: "20px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--color-charcoal-soft)",
              letterSpacing: "0.06em",
            }}
          >
            MOTION CAPTURE AI GOLF ANALYTICS · v2.4.1 · Vision AI
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--color-charcoal-soft)",
              letterSpacing: "0.06em",
            }}
          >
            Session 12 of 12 this week · 847 total swings analyzed
          </span>
        </div>
      </main>
    </div>
  )
}
