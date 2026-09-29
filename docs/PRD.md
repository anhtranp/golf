# Product Requirements Document (PRD)

## Project: Kinematic Vision AI — Premium AI Golf Motion Dashboard
**Document Version:** 2.4.0  
**Status:** Approved / Active  
**Author:** AI Engineering & Biomechanics Lead  
**Classification:** Product & Engineering Specification  
**Target Environments:** Modern Web Browsers, High-Performance Simulators, Touchscreen Bays  

---

## 1. Executive Summary & Vision

### 1.1 Problem Statement
Traditional golf swing analysis systems (TrackMan, GCQuad, Gears Golf) require prohibitively expensive specialized hardware ($15,000–$50,000), specialized markers, or multi-camera setups that are inaccessible to the everyday golfer. Conversely, generic consumer mobile apps rely on clunky manual video scrubbing, suffer from severe latency, require cloud video uploads that compromise privacy, and fail to provide real-time biomechanical feedback during the swing.

### 1.2 Product Vision
**Kinematic Vision AI** is a browser-based, zero-install, privacy-first motion capture analytics studio. Utilizing cutting-edge on-device computer vision (Google MediaPipe WebAssembly + WebGL GPU acceleration), it converts any standard laptop, tablet, or external webcam into a professional-grade kinematic swing studio. It delivers:
1. Real-time 60 FPS skeletal tracking across 10 vital biomechanical zones.
2. Hands-free ergonomics with an expanded full-screen studio view designed for golfers standing 6–10 feet back.
3. Automated 6-phase swing detection with direct benchmark comparison to PGA Tour elite models.
4. Actionable AI coaching cues and targeted physical drills.

---

## 2. User Personas

### Persona A: The Serious Amateur (Handicap 5–18)
* **Goal:** Wants objective, real-time feedback on body rotation (shoulder coil vs. hip turn) to eliminate chronic slicing or early extension.
* **Pain Point:** Cannot tell if swing changes are occurring in real time without booking an expensive lesson.
* **Usage Behavior:** Sets laptop on a range table or golf bag 8 feet away, presses Spacebar to record, checks full-screen angle readouts between swings.

### Persona B: The PGA Teaching Professional
* **Goal:** Needs a clean, high-framerate visual aid during indoor bay lessons to demonstrate kinematic sequence discrepancies to students.
* **Pain Point:** Students struggle to grasp verbal cues without visual skeleton overlays and benchmark comparisons.
* **Usage Behavior:** Connects laptop to large monitor/projector in Full Screen Pro Studio Mode to review phase scores and coaching insights.

### Persona C: The Home Golf Simulator Enthusiast
* **Goal:** Desires a modern, aesthetically pleasing dashboard that integrates seamlessly with home hitting bay setups.
* **Pain Point:** Cluttered, dated simulator software with poor UI aesthetics and unintuitive navigation.
* **Usage Behavior:** Runs the dashboard in fullscreen mode on a dedicated bay touchscreen display.

---

## 3. System Architecture & Information Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER RUNTIME                                 │
│                                                                             │
│   ┌─────────────────────┐              ┌────────────────────────────────┐   │
│   │   Webcam Stream     │              │  Kinematic Demo Engine         │   │
│   │   (WebRTC 720p/60)  │              │  (Mathematical Physics Fallback│   │
│   └──────────┬──────────┘              └───────────────┬────────────────┘   │
│              │                                         │                    │
│              ▼                                         ▼                    │
│   ┌─────────────────────────────────────────────────────────────┐           │
│   │           MediaPipe Tasks Vision Landmarker (WASM)          │           │
│   │             33 Anatomical Point Coordinates                │           │
│   └──────────────────────────────┬──────────────────────────────┘           │
│                                  │                                          │
│                                  ▼                                          │
│   ┌─────────────────────────────────────────────────────────────┐           │
│   │          Pose Tracking & Kinematic Normalization            │           │
│   │         10 Golf Body Zones · Geometric Angle Math          │           │
│   └──────────────┬──────────────────────────────┬───────────────┘           │
│                  │                              │                           │
│                  ▼                              ▼                           │
│   ┌──────────────────────────────┐ ┌────────────────────────────┐           │
│   │  60 FPS HTML5 Canvas Overlay │ │ Live Telemetry State Engine│           │
│   │  Glowing Wireframe & Dots    │ │ Phase Detector & Recorder  │           │
│   └──────────────────────────────┘ └────────────┬───────────────┘           │
│                                                 │                           │
│                                                 ▼                           │
│   ┌─────────────────────────────────────────────────────────────┐           │
│   │                REACT 19 DASHBOARD INTERFACE                 │           │
│   │   • Full-Screen Studio HUD (Distance Optimized)             │           │
│   │   • 6-Phase Swing Timeline & Weakest Phase Drill Box        │           │
│   │   • PGA Tour Benchmark Comparison Gauges                    │           │
│   │   • AI Coach Circular Scoring Matrix & Actionable Cues      │           │
│   └─────────────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Functional Requirements (FR)

### FR-01: Optical Computer Vision & Video Stream Ingestion
* **FR-01.1:** The system shall request access to the user's video capture hardware via `navigator.mediaDevices.getUserMedia` with preferred resolution of 1280x720 at 60 FPS.
* **FR-01.2:** The system shall support video mirroring (`scale-x-[-1]`) to provide an intuitive mirror-like user experience.
* **FR-01.3:** The video element shall render with `playsInline`, `muted`, and `autoPlay` to guarantee non-blocking playback across all desktop and mobile browsers.

### FR-02: 10 Kinematic Body Zones Extraction
* **FR-02.1:** The system shall map raw 33-point MediaPipe landmarks into 10 explicit anatomical golf zones:
  1. `Head`: Nose / cranial coordinate (MediaPipe Landmark 0)
  2. `Chest`: Midpoint between left and right acromion shoulder processes
  3. `Stomach`: Midpoint between chest and pelvic mid-hip (abdominal core)
  4. `Shoulders`: Left and right shoulder joints (Landmarks 11, 12)
  5. `Arms`: Left and right elbow joints (Landmarks 13, 14)
  6. `Wrists`: Left and right carpal wrist joints (Landmarks 15, 16)
  7. `Hands`: Left and right index hand centers (Landmarks 19, 20)
  8. `Hips`: Left, right, and derived pelvic mid-hip (Landmarks 23, 24)
  9. `Knees`: Left and right patellar joints (Landmarks 25, 26)
  10. `Feet`: Left and right ankle/foot index lines (Landmarks 31, 32)
* **FR-02.2:** Each point shall maintain normalized 2D coordinates `(x, y)` in the range `[0.0, 1.0]` along with a confidence visibility weight.

### FR-03: Resilient Biomechanical Kinematic Fallback Engine
* **FR-03.1:** When camera access is unavailable, denied, or device hardware is absent, the system shall seamlessly fall back to an internal mathematical kinematic demo generator (`generateDemoGolfSwingPoints`).
* **FR-03.2:** The fallback generator shall model continuous, physically authentic golf swing kinematics cycling every 3.5 seconds across Address (0–20%), Backswing to Top (20–50%), Downswing to Impact (50–65%), Follow-through (65–90%), and Return (90–100%).

### FR-04: High-Performance Canvas Skeletal Rendering
* **FR-04.1:** Rendering shall execute on an overlay `<canvas>` synchronized to the browser's display refresh rate via `requestAnimationFrame`.
* **FR-04.2:** Canvas buffer dimensions (`width`, `height`) must dynamically match its CSS display bounding rectangle on every frame to prevent pixelation or blurring.
* **FR-04.3:** Skeletal bones shall render as anti-aliased green lines (`#22C55E`, 2.5px) with soft outer glow (`shadowBlur: 10px`).
* **FR-04.4:** Anatomical joints shall render with dual-layer concentric indicators: outer pulsing halo ring (8px), solid emerald disc (5px), and crisp white center pip (2px).
* **FR-04.5:** The system shall provide an interactive toggle to display or hide textual joint labels (`L. Shoulder`, `R. Hip`, etc.).

### FR-05: Real-Time Biomechanical Telemetry Calculation
* **FR-05.1:** The system shall compute the following angles on every frame:
  * **Shoulder Turn Angle:** `atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x) * (180 / π)`
  * **Pelvic Hip Rotation Angle:** `atan2(rightHip.y - leftHip.y, rightHip.x - leftHip.x) * (180 / π)`
  * **Spine Tilt Angle:** Angle of the cranial-to-pelvic spinal vector relative to vertical plane.
  * **Lead Arm Angle:** Flexion angle between shoulder, elbow, and wrist.
* **FR-05.2:** The telemetry state shall calculate an overall joint tracking confidence score based on the visibility weights of all 10 zones.

### FR-06: 6-Phase Swing State Machine & Automatic Detection
* **FR-06.1:** The system shall classify the current swing position into one of six canonical phases:
  1. `Address`: Resting athletic posture with neutral pelvic alignment.
  2. `Backswing`: Rotational coiling with increasing shoulder turn.
  3. `Top`: Peak shoulder turn (85°–100°) and maximum wrist hinge.
  4. `Downswing`: Rapid rotational unwinding initiated by pelvic rotation.
  5. `Impact`: Club delivery with forward shaft lean and cleared lead hip.
  6. `Follow-through`: High balanced deceleration finishing onto lead foot.
* **FR-06.2:** When a phase transition occurs, the system shall emit an `onPhaseDetected` event to update the dashboard timeline.

### FR-07: Dual Full-Screen & Viewport Expansion Architecture
* **FR-07.1:** The tracker shall implement a dual-mode expansion mechanism:
  * **Native Fullscreen:** Invokes `element.requestFullscreen()` on the container element.
  * **CSS Viewport Fallback:** If native fullscreen is rejected or restricted by iframe permissions, applies `fixed inset-0 z-[9999] w-screen h-screen` to expand over the entire viewport.
* **FR-07.2:** The component shall expose an imperative handle (`toggleFullscreen()`, `isFullscreen()`) to allow toggling from external controls.
* **FR-07.3:** Keyboard shortcuts shall be supported:
  * <kbd>F</kbd>: Toggle full screen / normal view.
  * <kbd>Esc</kbd>: Exit full screen.

### FR-08: Distance-Optimized Pro Studio HUD
* **FR-08.1:** In full-screen mode, angle typography shall automatically scale up (24px+ serif) to ensure legibility from a distance of 6–10 feet.
* **FR-08.2:** Each telemetry metric in fullscreen shall display its corresponding target benchmark (e.g. `PGA: 95°+`, `PGA: 45°`).
* **FR-08.3:** A floor stance alignment guide (`[Lead Foot]`, `Target Path`, `[Trail Foot]`) shall be displayed at the base of the screen.

### FR-09: Solo Practice Swing Capture Workflow & Generous Ergonomics
* **FR-09.1:** Clicking "Record Swing" or pressing <kbd>Space</kbd> shall trigger a generous preparation countdown (default 8 seconds; configurable to 5s, 8s, or 12s) providing the golfer ample time to walk 8–10 feet to the mat, grip the club, and assume athletic address posture.
* **FR-09.2:** The system shall synthesize Web Audio chimes at countdown ticks 3, 2, 1 and a crisp start chime ("BEEP — SWING!") at 0 so the golfer never has to glance back at the monitor while setting posture.
* **FR-09.3:** Following the countdown, the system shall capture swing kinematics across a generous 8-second window (default 8000ms; configurable to 6s, 8s, or 10s) with live seconds remaining and an interactive "Done Early" option.
* **FR-09.4:** A high-frequency trajectory frame buffer shall sample angular rotation, spine tilt, and arm lag every 50ms across the entire window, calculating peak dynamic metrics (`peakShoulderTurn`, `peakHipRotation`, `spineTilt`, `clubSpeed`).

### FR-10: PGA Tour Benchmark Comparison & AI Coaching Engine
* **FR-10.1:** The dashboard shall present side-by-side comparative bars measuring player metrics against PGA Tour elite standards (Hip Rotation, Shoulder Rotation, Tempo Ratio, Club Path, Hand Position, Wrist Lag).
* **FR-10.2:** The system shall render a circular SVG scoring ring displaying Overall Score out of 100 with percentile ranking and Consistency Index.
* **FR-10.3:** The system shall automatically identify the "Weakest Phase" and highlight it in terra-cotta red (`#C0503A`) with actionable coaching cues and prescribed physical drills.

### FR-11: Google Gemini AI Biomechanical Diagnostics (Option 2)
* **FR-11.1:** The system shall integrate with `@google/genai` utilizing the `gemini-2.5-flash` model with structured JSON output schema (`responseMimeType: "application/json"`).
* **FR-11.2:** The Gemini AI engine shall receive captured kinematic sequence telemetry, evaluate 6 swing phases (Address, Backswing, Top, Downswing, Impact, Follow-through), generate dynamic scores (0–100), quantify PGA Tour deltas, and produce 3 prioritized actionable coaching drills.
* **FR-11.3:** The system shall provide an in-app Gemini API Key configuration modal with live connection testing and local storage persistence.
* **FR-11.4:** If no Gemini API key is provided, the system shall automatically and silently fall back to an onboard dynamic algorithmic biomechanics engine, ensuring zero downtime and offline operation.

---

## 5. Non-Functional Requirements (NFR)

### NFR-01: Performance & Latency
* **NFR-01.1:** End-to-end computer vision inference latency shall not exceed 30ms per frame on modern hardware with WebGL GPU acceleration.
* **NFR-01.2:** Canvas wireframe rendering shall maintain a minimum of 60 frames per second without frame drops or visual stutter.
* **NFR-01.3:** Production JavaScript bundle size shall not exceed 300 kB (gzipped) for core application logic.

### NFR-02: Security, Privacy & Data Sovereignty
* **NFR-02.1:** All video frames from user webcams shall be processed in transient volatile RAM memory only.
* **NFR-02.2:** Zero raw video or audio data shall be transmitted over HTTP, WebSockets, or third-party cloud APIs.
* **NFR-02.3:** No user biometric data or identifying facial imagery shall be retained on persistent disk storage.

### NFR-03: Ergonomics & Usability
* **NFR-03.1:** Primary UI actions shall be executable without touching the keyboard once address posture is taken (using 3-2-1 countdown or single Spacebar press).
* **NFR-03.2:** Telemetry counters in Full Screen Pro mode shall satisfy minimum contrast ratio of 4.5:1 against the dark backdrop (WCAG AA).

### NFR-04: Cross-Platform & Browser Compatibility
* **NFR-04.1:** Full support for Google Chrome (v110+), Apple Safari (v16.4+), Mozilla Firefox (v115+), and Microsoft Edge (v110+).
* **NFR-04.2:** Support for arbitrary display aspect ratios (16:9, 16:10, 4:3, ultra-wide 21:9) with automatic canvas resize handling.

### NFR-05: Resilience & Error Handling
* **NFR-05.1:** If webcam permissions are blocked by browser security settings, the UI shall display a clear, non-blocking error banner with a one-click button to launch Demo Swing mode.
* **NFR-05.2:** Video stream tracks must be cleanly terminated upon component unmount to prevent lingering camera hardware indicator lights.

### NFR-06: Visual Design & Brand Aesthetics
* **NFR-06.1:** Aesthetic theme shall evoke a prestigious golf sanctuary (Augusta charcoal `#1D211C`, Fairway green `#3F5E38`, Brass gold `#A8843A`, and warm linen paper `#F7F8F5`).
* **NFR-06.2:** Typography hierarchy shall strictly adhere to:
  * Headers: Classic editorial serif (`Playfair Display` or modern high-contrast serif).
  * Data & Metrics: Clean tabular monospace (`DM Mono` / `Courier`).
  * Body copy: Geometric sans-serif (`DM Sans` / `Inter`).

---

## 6. Data Models & TypeScript Specifications

```typescript
export interface Point2D {
  x: number // Normalized 0.0 to 1.0
  y: number // Normalized 0.0 to 1.0
  visibility?: number // Confidence 0.0 to 1.0
}

export interface GolfBodyPoints {
  head: Point2D
  chest: Point2D
  stomach: Point2D
  leftShoulder: Point2D
  rightShoulder: Point2D
  leftElbow: Point2D
  rightElbow: Point2D
  leftWrist: Point2D
  rightWrist: Point2D
  leftHand: Point2D
  rightHand: Point2D
  midHip: Point2D
  leftHip: Point2D
  rightHip: Point2D
  leftKnee: Point2D
  rightKnee: Point2D
  leftFoot: Point2D
  rightFoot: Point2D
}

export interface SwingTelemetry {
  shoulderAngleDeg: number
  hipAngleDeg: number
  spineTiltDeg: number
  leadArmAngleDeg: number
  detectedPhase: 'Address' | 'Backswing' | 'Top' | 'Downswing' | 'Impact' | 'Follow-through'
  confidence: number
  allPartsTracked: boolean
}

export interface PhaseData {
  name: string
  order: string
  score: number
  keyMetric: string
  metricValue: string
  targetBenchmark: string
  status: 'Optimal' | 'Good' | 'Needs Work'
  biomechanicsFocus: string
  drillTip: string
  note: string
}
```

---

## 7. Verification & Acceptance Criteria

| ID | Test Scenario | Acceptance Criteria |
| :--- | :--- | :--- |
| **AC-01** | Camera Permission Granted | Webcam stream displays with overlaid green skeletal tracking wireframe within 2 seconds. |
| **AC-02** | Camera Permission Denied | Warning banner appears; demo kinematics activates automatically without throwing unhandled exceptions. |
| **AC-03** | Full Screen Toggle | Clicking Full Screen or pressing <kbd>F</kbd> expands the tracker to 100vw × 100vh; counters enlarge to 24px+. |
| **AC-04** | Full Screen Exit | Pressing <kbd>Esc</kbd> or clicking "Exit Full Screen" restores the default layout seamlessly. |
| **AC-05** | Spacebar Recording | Pressing <kbd>Space</kbd> starts 3-second countdown followed by 3.2s capture and dashboard update. |
| **AC-06** | Kinematic Joints | All 10 zones (Head, Chest, Stomach, Shoulders, Arms, Wrists, Hands, Hips, Knees, Feet) render with active green status pills. |

---

## 8. Future Roadmap

* **v2.5 (Q4 2026):** Multi-Camera Dual Angle Triangulation (Face-On + Down-The-Line synchronization via WebRTC).
* **v2.6 (Q1 2027):** High-Speed Shutter Mode (120/240 FPS support for compatible external USB3/Thunderbolt global-shutter webcams).
* **v2.7 (Q2 2027):** Generative Voice Audio Coaching (Real-time synthesized voice cue upon top-of-backswing transition).
