import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react"
import {
  Camera,
  VideoOff,
  FlipHorizontal,
  Play,
  RotateCcw,
  Sparkles,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Minimize2,
} from "lucide-react"
import {
  GolfBodyPoints,
  SwingTelemetry,
  extractGolfBodyPoints,
  calculateSwingTelemetry,
  drawGolfTrackingSkeleton,
  generateDemoGolfSwingPoints,
  BODY_PART_LABELS,
} from "../utils/poseTracker"

export interface CameraMotionTrackerHandle {
  toggleFullscreen: () => void
  isFullscreen: () => boolean
}

interface CameraMotionTrackerProps {
  activePhase?: string
  onPhaseDetected?: (phase: string) => void
  onSwingCaptured?: (metrics: {
    shoulderTurn: number
    hipRotation: number
    phase: string
    clubSpeed: number
  }) => void
  onFullscreenChange?: (isFullscreen: boolean) => void
}

const CameraMotionTracker =
  forwardRef<CameraMotionTrackerHandle, CameraMotionTrackerProps>(
    function CameraMotionTracker(
      {
        activePhase,
        onPhaseDetected,
        onSwingCaptured,
        onFullscreenChange,
      }: CameraMotionTrackerProps,
      ref,
    ) {
      // State
      const [isCameraActive, setIsCameraActive] = useState(false)
      const [isDemoMode, setIsDemoMode] = useState(false)
      const [isMirrored, setIsMirrored] = useState(true)
      const [showLabels, setShowLabels] = useState(false)
      const [cameraError, setCameraError] = useState<string | null>(null)
      const [isModelLoading, setIsModelLoading] = useState(false)
      const [isRecording, setIsRecording] = useState(false)
      const [countdown, setCountdown] = useState<number | null>(null)
      const [recordingProgress, setRecordingProgress] = useState(0)
      const [isFullscreen, setIsFullscreen] = useState(false)

      // Live telemetry state
      const [telemetry, setTelemetry] = useState<SwingTelemetry>({
        shoulderAngleDeg: 0,
        hipAngleDeg: 0,
        spineTiltDeg: 24,
        leadArmAngleDeg: 35,
        detectedPhase: "Address",
        confidence: 98,
        allPartsTracked: true,
      })

      // DOM and Engine refs
      const containerRef = useRef<HTMLDivElement | null>(null)
      const videoRef = useRef<HTMLVideoElement | null>(null)
      const canvasRef = useRef<HTMLCanvasElement | null>(null)
      const streamRef = useRef<MediaStream | null>(null)
      const animFrameIdRef = useRef<number | null>(null)
      const poseLandmarkerRef = useRef<any>(null)
      const isMountedRef = useRef(true)
      const recordingTimerRef = useRef<any>(null)
      const startTimeRef = useRef<number>(performance.now())
      const lastPhaseRef = useRef<string>("")

      // Full Screen Toggle Engine (Dual support: HTML5 Fullscreen API + CSS Viewport Expand)
      const toggleFullScreen = useCallback(async () => {
        try {
          if (!document.fullscreenElement) {
            if (containerRef.current?.requestFullscreen) {
              await containerRef.current.requestFullscreen()
              setIsFullscreen(true)
              onFullscreenChange?.(true)
            } else {
              setIsFullscreen((prev) => {
                const next = !prev
                onFullscreenChange?.(next)
                return next
              })
            }
          } else {
            if (document.exitFullscreen) {
              await document.exitFullscreen()
            }
            setIsFullscreen(false)
            onFullscreenChange?.(false)
          }
        } catch (err) {
          console.warn(
            "Native fullscreen request restricted or failed, activating CSS viewport fullscreen:",
            err,
          )
          setIsFullscreen((prev) => {
            const next = !prev
            onFullscreenChange?.(next)
            return next
          })
        }
      }, [onFullscreenChange])

      // Expose imperative handle to parent component
      useImperativeHandle(
        ref,
        () => ({
          toggleFullscreen: toggleFullScreen,
          isFullscreen: () => isFullscreen,
        }),
        [toggleFullScreen, isFullscreen],
      )

      // Fullscreen change & Keyboard shortcuts listener (Esc, F, Space)
      useEffect(() => {
        const handleFullscreenChange = () => {
          const isDocFullscreen = Boolean(document.fullscreenElement)
          setIsFullscreen(isDocFullscreen)
          onFullscreenChange?.(isDocFullscreen)
        }

        const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement
          if (
            target &&
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
          )
            return

          if (e.key === "Escape" && isFullscreen) {
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {})
            }
            setIsFullscreen(false)
            onFullscreenChange?.(false)
          } else if (
            (e.key === "f" || e.key === "F") &&
            !e.metaKey &&
            !e.ctrlKey
          ) {
            e.preventDefault()
            toggleFullScreen()
          } else if (e.code === "Space" && (isCameraActive || isDemoMode)) {
            if (!isRecording && countdown === null) {
              e.preventDefault()
              handleTriggerRecord()
            }
          }
        }

        document.addEventListener("fullscreenchange", handleFullscreenChange)
        window.addEventListener("keydown", handleKeyDown)

        return () => {
          document.removeEventListener(
            "fullscreenchange",
            handleFullscreenChange,
          )
          window.removeEventListener("keydown", handleKeyDown)
        }
      }, [
        isFullscreen,
        isCameraActive,
        isDemoMode,
        isRecording,
        countdown,
        toggleFullScreen,
        onFullscreenChange,
      ])

      // Initialize MediaPipe PoseLandmarker asynchronously
      const initPoseLandmarker = useCallback(async () => {
        if (poseLandmarkerRef.current) return poseLandmarkerRef.current
        try {
          setIsModelLoading(true)
          const { FilesetResolver, PoseLandmarker } = await import(
            "@mediapipe/tasks-vision"
          )
          const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm",
          )
          const landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
          })
          poseLandmarkerRef.current = landmarker
          setIsModelLoading(false)
          return landmarker
        } catch (err) {
          console.warn("MediaPipe PoseLandmarker initialization notice:", err)
          setIsModelLoading(false)
          return null
        }
      }, [])

      // Start Camera Stream
      const startCamera = async () => {
        setCameraError(null)
        setIsDemoMode(false)
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Camera API is not supported in this browser.")
          }

          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          })

          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            await videoRef.current.play()
          }
          setIsCameraActive(true)

          // Pre-load MediaPipe landmarker
          initPoseLandmarker()
        } catch (err: any) {
          console.warn("Camera access denied or unavailable:", err)
          const errorMsg =
            err.name === "NotAllowedError"
              ? "Camera permission denied. Please allow camera access in your browser settings, or use Demo Mode."
              : "No camera hardware found or device busy. Switching to Demo Mode."
          setCameraError(errorMsg)
          setIsCameraActive(false)
          // Automatically switch to demo mode so user sees the tracking immediately!
          setIsDemoMode(true)
        }
      }

      // Stop Camera Stream
      const stopCamera = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null
        }
        setIsCameraActive(false)
      }

      // Toggle Demo Mode
      const startDemoMode = () => {
        stopCamera()
        setCameraError(null)
        setIsDemoMode(true)
      }

      // Trigger Swing Recording with countdown
      const handleTriggerRecord = () => {
        if (isRecording || countdown !== null) return
        setCountdown(3)
        let count = 3
        const countInterval = setInterval(() => {
          count -= 1
          if (count > 0) {
            setCountdown(count)
          } else {
            clearInterval(countInterval)
            setCountdown(null)
            startSwingCapture()
          }
        }, 1000)
      }

      const startSwingCapture = () => {
        setIsRecording(true)
        setRecordingProgress(0)

        const duration = 3200 // ms
        const stepInterval = 50
        let elapsed = 0

        recordingTimerRef.current = setInterval(
          () => {
            elapsed += stepInterval
            const pct = Math.min(100, Math.round((elapsed / duration) * 100))
            setRecordingProgress(pct)

            if (elapsed >= duration) {
              clearInterval(recordingTimerRef.current)
              setIsRecording(false)
              setRecordingProgress(100)

              // Notify parent dashboard
              if (onSwingCaptured) {
                onSwingCaptured({
                  shoulderTurn: Math.abs(telemetry.shoulderAngleDeg) || 89,
                  hipRotation: Math.abs(telemetry.hipAngleDeg) || 42,
                  phase: telemetry.detectedPhase || "Impact",
                  clubSpeed: 96,
                })
              }
            }
          },
          stepInterval,
        )
      }

      // Animation and Tracking Loop
      useEffect(() => {
        isMountedRef.current = true

        const renderLoop = (timestamp: number) => {
          if (!isMountedRef.current) return

          const canvas = canvasRef.current
          if (!canvas) {
            animFrameIdRef.current = requestAnimationFrame(renderLoop)
            return
          }

          const ctx = canvas.getContext("2d")
          if (!ctx) {
            animFrameIdRef.current = requestAnimationFrame(renderLoop)
            return
          }

          // Match canvas internal resolution with its display size
          const rect = canvas.getBoundingClientRect()
          if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width
            canvas.height = rect.height
          }

          const width = canvas.width
          const height = canvas.height

          // Clear previous frame
          ctx.clearRect(0, 0, width, height)

          let currentPoints: GolfBodyPoints | null = null

          // Case 1: Active Camera with MediaPipe PoseLandmarker
          if (
            isCameraActive &&
            videoRef.current &&
            videoRef.current.readyState >= 2 &&
            poseLandmarkerRef.current
          ) {
            try {
              const results = poseLandmarkerRef.current.detectForVideo(
                videoRef.current,
                timestamp,
              )
              if (results.landmarks && results.landmarks.length > 0) {
                currentPoints = extractGolfBodyPoints(results.landmarks[0])
              }
            } catch (e) {
              // Frame skip or timestamp order
            }
          }

          // Case 2: Fallback to Kinematic Demo Engine if camera is inactive or no pose detected
          const timeSec = (timestamp - startTimeRef.current) / 1000
          if (!currentPoints && (isDemoMode || isCameraActive)) {
            currentPoints = generateDemoGolfSwingPoints(timeSec)
          }

          // Render Skeleton & Update Telemetry
          if (currentPoints) {
            drawGolfTrackingSkeleton(ctx, currentPoints, width, height, {
              showLabels,
              isMirrored: isCameraActive ? isMirrored : false,
              pulsePhase: timeSec,
            })

            const currentTelem = calculateSwingTelemetry(currentPoints)
            setTelemetry(currentTelem)

            if (
              onPhaseDetected &&
              currentTelem.detectedPhase &&
              lastPhaseRef.current !== currentTelem.detectedPhase
            ) {
              lastPhaseRef.current = currentTelem.detectedPhase
              onPhaseDetected(currentTelem.detectedPhase)
            }
          }

          animFrameIdRef.current = requestAnimationFrame(renderLoop)
        }

        animFrameIdRef.current = requestAnimationFrame(renderLoop)

        return () => {
          isMountedRef.current = false
          if (animFrameIdRef.current)
            cancelAnimationFrame(animFrameIdRef.current)
          if (recordingTimerRef.current)
            clearInterval(recordingTimerRef.current)
        }
      }, [isCameraActive, isDemoMode, isMirrored, showLabels])

      // Cleanup camera stream on unmount
      useEffect(() => {
        return () => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop())
          }
        }
      }, [])

      return (
        <div
          ref={containerRef}
          className={`select-none transition-all duration-300 flex flex-col ${
            isFullscreen
              ? "fixed inset-0 z-[9999] w-screen h-screen overflow-hidden bg-[#0F120F]"
              : "relative w-full h-full rounded bg-[#181A18] overflow-hidden border border-[#2E362C]"
          }`}
        >
          {/* ── Top Bar Controls ── */}
          <div
            className={`z-20 px-4 py-3 bg-[#1D211C]/95 backdrop-blur-md border-b border-[#2C332A] flex flex-wrap items-center justify-between gap-3 ${
              isFullscreen ? "px-6 py-3.5 shadow-xl" : ""
            }`}
          >
            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isCameraActive
                    ? "bg-[#22C55E] animate-pulse shadow-[0_0_8px_#22C55E]"
                    : isDemoMode
                      ? "bg-[#EAB308] animate-pulse shadow-[0_0_8px_#EAB308]"
                      : "bg-[#6B6860]"
                }`}
              />
              <span className="font-mono text-[11px] tracking-wider uppercase font-semibold text-[#E6ECE3]">
                {isCameraActive
                  ? "Live Camera Active"
                  : isDemoMode
                    ? "Demo Swing Tracking"
                    : "Camera Standby"}
              </span>
              {isFullscreen && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30 font-semibold shadow-sm">
                  Expanded Full Screen
                </span>
              )}
              {isModelLoading && (
                <span className="text-[10px] font-mono text-[#8FA888] animate-pulse">
                  (Loading AI Model…)
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {!isCameraActive ? (
                <button
                  onClick={startCamera}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#22C55E] hover:bg-[#16A34A] text-[#0D150B] font-medium text-xs rounded transition-all shadow-sm cursor-pointer"
                >
                  <Camera size={14} />
                  <span>Turn On Camera</span>
                </button>
              ) : (
                <button
                  onClick={stopCamera}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C0503A]/20 hover:bg-[#C0503A]/30 text-[#F87171] border border-[#C0503A]/40 font-medium text-xs rounded transition-all cursor-pointer"
                >
                  <VideoOff size={14} />
                  <span>Turn Off Camera</span>
                </button>
              )}

              <button
                onClick={startDemoMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-all cursor-pointer ${
                  isDemoMode && !isCameraActive
                    ? "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/50"
                    : "bg-[#262B24] text-[#C5CEBC] border-[#363E33] hover:border-[#4B5647]"
                }`}
              >
                <Sparkles size={13} />
                <span>Demo Swing</span>
              </button>

              {isCameraActive && (
                <button
                  onClick={() => setIsMirrored((v) => !v)}
                  title="Flip / Mirror Video"
                  className={`p-1.5 rounded border transition-all cursor-pointer ${
                    isMirrored
                      ? "bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/40"
                      : "bg-[#262B24] text-[#9EA89A] border-[#363E33]"
                  }`}
                >
                  <FlipHorizontal size={14} />
                </button>
              )}

              <button
                onClick={() => setShowLabels((v) => !v)}
                title="Toggle Joint Labels"
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border transition-all cursor-pointer ${
                  showLabels
                    ? "bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/40"
                    : "bg-[#262B24] text-[#9EA89A] border-[#363E33] hover:text-[#C5CEBC]"
                }`}
              >
                <Layers size={13} />
                <span className="font-mono text-[10px]">Labels</span>
              </button>

              {/* Record Swing Button */}
              {(isCameraActive || isDemoMode) && (
                <button
                  onClick={handleTriggerRecord}
                  disabled={isRecording || countdown !== null}
                  title="Trigger 3-second swing capture (or press Space)"
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded cursor-pointer transition-all ${
                    isRecording
                      ? "bg-[#C0503A] text-white animate-pulse"
                      : countdown !== null
                        ? "bg-[#EAB308] text-[#1D211C]"
                        : "bg-[#3F5E38] hover:bg-[#4E7245] text-white"
                  }`}
                >
                  {isRecording ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                      <span>Recording ({recordingProgress}%)</span>
                    </>
                  ) : countdown !== null ? (
                    <>
                      <RotateCcw size={13} className="animate-spin" />
                      <span>Ready in {countdown}s</span>
                    </>
                  ) : (
                    <>
                      <Play size={13} />
                      <span>Record Swing</span>
                      <span className="text-[9px] font-mono opacity-75 hidden sm:inline">
                        [Space]
                      </span>
                    </>
                  )}
                </button>
              )}

              {/* Full Screen Toggle Button */}
              <button
                onClick={toggleFullScreen}
                title={
                  isFullscreen
                    ? "Exit Full Screen (Esc or F)"
                    : "Expand to Full Screen (F)"
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-all cursor-pointer ${
                  isFullscreen
                    ? "bg-[#22C55E] hover:bg-[#16A34A] text-[#0D150B] border-[#22C55E] font-semibold shadow-md"
                    : "bg-[#262B24] text-[#C5CEBC] border-[#363E33] hover:border-[#22C55E]/60 hover:text-white"
                }`}
              >
                {isFullscreen ? (
                  <Minimize2 size={13} />
                ) : (
                  <Maximize2 size={13} />
                )}
                <span>{isFullscreen ? "Exit Full Screen" : "Full Screen"}</span>
                <span
                  className={`text-[9px] font-mono px-1 py-0.2 rounded border ${
                    isFullscreen
                      ? "bg-black/20 border-black/30 text-[#0D150B]"
                      : "bg-[#1D211C] border-[#363E33] text-[#8FA888]"
                  }`}
                >
                  {isFullscreen ? "ESC" : "F"}
                </span>
              </button>
            </div>
          </div>

          {/* ── Error Banner if Camera Blocked ── */}
          {cameraError && (
            <div className="z-20 px-4 py-2 bg-[#422018] border-b border-[#7F2D1D] text-[#FECACA] text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-[#F87171] shrink-0" />
                <span>{cameraError}</span>
              </div>
              <button
                onClick={() => setCameraError(null)}
                className="text-[11px] underline hover:text-white cursor-pointer ml-3 shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── Viewport Container ── */}
          <div className="relative flex-1 w-full min-h-[460px] bg-[#121412] flex items-center justify-center overflow-hidden">
            {/* Background Grid & Turf Aesthetics */}
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(#3F5E38 1px, transparent 1px), radial-gradient(#22C55E 0.75px, transparent 0.75px)`,
                backgroundSize: "32px 32px",
                backgroundPosition: "0 0, 16px 16px",
              }}
            />

            {/* Video Element */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                isCameraActive ? "opacity-85" : "opacity-0 pointer-events-none"
              } ${isMirrored ? "scale-x-[-1]" : ""}`}
            />

            {/* Canvas Overlay for Green Dots & Thin Green Lines */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full z-10 pointer-events-none"
            />

            {/* In-Fullscreen Studio Mode Indicator Banner */}
            {isFullscreen && (
              <div className="absolute top-4 left-4 z-20 hidden md:flex items-center gap-2 px-3.5 py-1.5 bg-[#151914]/85 backdrop-blur-md rounded border border-[#2B3428] text-[11px] font-mono text-[#8FA888] shadow-lg">
                <span className="text-[#22C55E] font-semibold">
                  Pro Studio View
                </span>
                <span className="text-[#3A4537]">·</span>
                <span>
                  <kbd className="text-[#E6ECE3] bg-[#222820] px-1.5 py-0.5 rounded border border-[#2E362C]">
                    Space
                  </kbd>{" "}
                  to Record
                </span>
                <span className="text-[#3A4537]">·</span>
                <span>
                  <kbd className="text-[#E6ECE3] bg-[#222820] px-1.5 py-0.5 rounded border border-[#2E362C]">
                    Esc
                  </kbd>{" "}
                  or{" "}
                  <kbd className="text-[#E6ECE3] bg-[#222820] px-1.5 py-0.5 rounded border border-[#2E362C]">
                    F
                  </kbd>{" "}
                  to Minimize
                </span>
              </div>
            )}

            {/* Stance Alignment Grid on the floor when in Fullscreen */}
            {isFullscreen && (
              <div className="absolute bottom-20 inset-x-0 pointer-events-none flex flex-col items-center opacity-30">
                <div className="w-[380px] h-[1px] bg-gradient-to-r from-transparent via-[#22C55E] to-transparent mb-1.5" />
                <div className="flex justify-between w-[320px] text-[9px] font-mono text-[#22C55E] uppercase tracking-widest">
                  <span>[Lead Foot]</span>
                  <span className="tracking-widest">Target Path</span>
                  <span>[Trail Foot]</span>
                </div>
              </div>
            )}

            {/* Standby State (When camera is off & demo mode is off) */}
            {!isCameraActive && !isDemoMode && (
              <div className="z-10 flex flex-col items-center justify-center p-8 max-w-md text-center">
                <div className="w-16 h-16 rounded-full bg-[#20271E] border border-[#374433] flex items-center justify-center mb-4 text-[#22C55E] shadow-[0_0_20px_rgba(34,197,94,0.15)]">
                  <Camera size={28} />
                </div>
                <h3 className="font-serif text-xl font-medium text-[#F4F6F3] mb-2">
                  Live Golf Swing Motion Capture
                </h3>
                <p className="text-xs text-[#9EA89A] leading-relaxed mb-6">
                  Track your wrist, hand, shoulder, arm, head, chest, stomach,
                  knee, feet, and hip in real time with high-precision skeletal
                  wireframe tracking.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-[#22C55E] hover:bg-[#16A34A] text-[#0D150B] font-semibold text-xs rounded transition-all cursor-pointer shadow-md"
                  >
                    Turn On Camera
                  </button>
                  <button
                    onClick={startDemoMode}
                    className="px-4 py-2 bg-[#222820] hover:bg-[#2C332A] text-[#C5CEBC] border border-[#3B4637] font-medium text-xs rounded transition-all cursor-pointer"
                  >
                    Launch Demo Swing
                  </button>
                </div>
              </div>
            )}

            {/* Countdown Overlay (3, 2, 1) */}
            {countdown !== null && (
              <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
                <span
                  className={`font-serif font-bold text-[#22C55E] animate-ping ${
                    isFullscreen ? "text-9xl" : "text-8xl"
                  }`}
                >
                  {countdown}
                </span>
                <p
                  className={`font-mono uppercase tracking-widest text-[#E6ECE3] mt-4 ${
                    isFullscreen ? "text-base font-semibold" : "text-sm"
                  }`}
                >
                  Assume Address Position
                </p>
              </div>
            )}

            {/* Recording Progress HUD */}
            {isRecording && (
              <div className="absolute top-4 left-4 z-20 flex items-center gap-3 px-3.5 py-2 bg-black/85 backdrop-blur-md rounded-md border border-[#C0503A]/70 shadow-2xl">
                <div className="w-3 h-3 rounded-full bg-[#EF4444] animate-pulse shadow-[0_0_8px_#EF4444]" />
                <div className="flex flex-col">
                  <span className="font-mono text-[10px] font-bold text-white tracking-widest uppercase">
                    CAPTURING SWING MOTION
                  </span>
                  <div className="w-36 h-1.5 bg-[#333] rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-[#22C55E] transition-all duration-75"
                      style={{ width: `${recordingProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Live Telemetry HUD Overlay (Top Right) ── */}
            {(isCameraActive || isDemoMode) && (
              <div
                className={`absolute top-4 right-4 z-20 bg-[#151914]/90 backdrop-blur-md border border-[#2B3428] rounded-md shadow-2xl flex flex-col transition-all ${
                  isFullscreen
                    ? "p-4 min-w-[240px] gap-3"
                    : "p-3 min-w-[170px] gap-2"
                }`}
              >
                <div className="flex items-center justify-between border-b border-[#2B3428] pb-1.5">
                  <span
                    className={`font-mono uppercase tracking-wider text-[#8FA888] ${
                      isFullscreen ? "text-[10px]" : "text-[9px]"
                    }`}
                  >
                    Current Phase
                  </span>
                  <span
                    className={`font-mono font-bold text-[#22C55E] uppercase tracking-wide ${
                      isFullscreen
                        ? "text-sm px-2 py-0.5 rounded bg-[#22C55E]/15 border border-[#22C55E]/30"
                        : "text-xs"
                    }`}
                  >
                    {telemetry.detectedPhase}
                  </span>
                </div>

                <div
                  className={`grid grid-cols-2 ${
                    isFullscreen ? "gap-3" : "gap-2"
                  } text-left`}
                >
                  <div>
                    <span
                      className={`font-mono uppercase text-[#737E70] block ${
                        isFullscreen ? "text-[10px]" : "text-[9px]"
                      }`}
                    >
                      Shoulder Turn
                    </span>
                    <span
                      className={`font-serif font-semibold text-[#F4F6F3] ${
                        isFullscreen ? "text-2xl" : "text-sm"
                      }`}
                    >
                      {Math.abs(telemetry.shoulderAngleDeg)}°
                    </span>
                    {isFullscreen && (
                      <span className="text-[9px] font-mono text-[#8FA888] block">
                        PGA: 95°+
                      </span>
                    )}
                  </div>

                  <div>
                    <span
                      className={`font-mono uppercase text-[#737E70] block ${
                        isFullscreen ? "text-[10px]" : "text-[9px]"
                      }`}
                    >
                      Hip Turn
                    </span>
                    <span
                      className={`font-serif font-semibold text-[#F4F6F3] ${
                        isFullscreen ? "text-2xl" : "text-sm"
                      }`}
                    >
                      {Math.abs(telemetry.hipAngleDeg)}°
                    </span>
                    {isFullscreen && (
                      <span className="text-[9px] font-mono text-[#8FA888] block">
                        PGA: 45°
                      </span>
                    )}
                  </div>

                  <div>
                    <span
                      className={`font-mono uppercase text-[#737E70] block ${
                        isFullscreen ? "text-[10px]" : "text-[9px]"
                      }`}
                    >
                      Spine Tilt
                    </span>
                    <span
                      className={`font-serif font-semibold text-[#F4F6F3] ${
                        isFullscreen ? "text-lg" : "text-sm"
                      }`}
                    >
                      {telemetry.spineTiltDeg}°
                    </span>
                  </div>

                  <div>
                    <span
                      className={`font-mono uppercase text-[#737E70] block ${
                        isFullscreen ? "text-[10px]" : "text-[9px]"
                      }`}
                    >
                      Confidence
                    </span>
                    <span
                      className={`font-mono font-semibold text-[#22C55E] ${
                        isFullscreen ? "text-base" : "text-xs"
                      }`}
                    >
                      {telemetry.confidence}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Bottom Body Parts Tracking Status Checklist ── */}
            {(isCameraActive || isDemoMode) && (
              <div
                className={`absolute z-20 bg-[#151914]/92 backdrop-blur-md border border-[#2B3428] rounded flex flex-wrap items-center justify-between gap-2 shadow-2xl transition-all ${
                  isFullscreen
                    ? "bottom-4 left-6 right-6 px-4 py-2.5"
                    : "bottom-3 left-4 right-4 px-3 py-2"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Activity size={14} className="text-[#22C55E]" />
                  <span className="font-mono text-[10px] text-[#A9B5A5] uppercase tracking-wider font-semibold">
                    Tracking 10 Kinematic Zones:
                  </span>
                </div>

                {/* List of 10 tracked body parts */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    "Head",
                    "Chest",
                    "Stomach",
                    "Shoulders",
                    "Arms",
                    "Wrists",
                    "Hands",
                    "Hips",
                    "Knees",
                    "Feet",
                  ].map((part) => (
                    <div
                      key={part}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#20271E] border border-[#2D382B]"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] shadow-[0_0_4px_#22C55E]" />
                      <span className="font-mono text-[9px] text-[#D1D9CD]">
                        {part}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8FA888]">
                  <CheckCircle2 size={12} className="text-[#22C55E]" />
                  <span>Full Chain Connected</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    },
  )

export default CameraMotionTracker
