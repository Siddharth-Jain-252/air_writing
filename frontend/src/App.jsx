import { useEffect, useRef, useState, useCallback } from "react";

const BACKEND_URL = "https://siddharthjain252-airwriting.hf.space/predict";

function isOpenPalm(lm) {
  const indexUp  = lm[8].y  < lm[5].y  - 0.03;
  const middleUp = lm[12].y < lm[9].y  - 0.03;
  const ringUp   = lm[16].y < lm[13].y - 0.03;
  const pinkyUp  = lm[20].y < lm[17].y - 0.03;
  const thumbOut = Math.abs(lm[4].x - lm[5].x) > 0.05;
  return indexUp && middleUp && ringUp && pinkyUp && thumbOut;
}

function palmCenter(lm, w, h) {
  const tips = [4, 8, 12, 16, 20];
  const cx = tips.reduce((s, i) => s + lm[i].x, 0) / tips.length;
  const cy = tips.reduce((s, i) => s + lm[i].y, 0) / tips.length;
  return { x: (1 - cx) * w, y: cy * h };
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400&family=Lato:wght@300;400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .ad-root {
    min-height: 100vh;
    background: #f5f0e8;
    background-image:
      radial-gradient(ellipse 70% 50% at 10% 0%, rgba(210,180,120,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 50% 40% at 90% 100%, rgba(180,210,200,0.12) 0%, transparent 60%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2.5rem 1rem;
    font-family: 'Lato', sans-serif;
    color: #2c2416;
  }

  /* ── Header ── */
  .ad-header {
    text-align: center;
    margin-bottom: 2.5rem;
    opacity: 0;
    transform: translateY(14px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  .ad-header.in { opacity: 1; transform: translateY(0); }

  .ad-title {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(2.6rem, 5vw, 4rem);
    font-weight: 400;
    letter-spacing: 0.04em;
    color: #1a1208;
    line-height: 1;
  }
  .ad-title em {
    font-style: italic;
    color: #b06a10;
  }

  .ad-subtitle {
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.28em;
    color: #a89060;
    text-transform: uppercase;
    margin-top: 0.55rem;
  }

  .ad-rule {
    width: 48px;
    height: 1px;
    margin: 0.9rem auto 0;
    background: linear-gradient(90deg, transparent, #c8923a, transparent);
  }

  /* ── Layout ── */
  .ad-layout {
    display: flex;
    gap: 1.4rem;
    align-items: flex-start;
    width: 100%;
    max-width: 940px;
  }

  /* ── Canvas column ── */
  .ad-canvas-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.7s 0.12s ease, transform 0.7s 0.12s ease;
  }
  .ad-canvas-col.in { opacity: 1; transform: translateY(0); }

  .ad-canvas-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 640 / 480;
    border-radius: 4px;
    overflow: hidden;
    border: 1.5px solid #d4c4a0;
    box-shadow:
      0 2px 0 #e8d8b8,
      0 20px 60px rgba(100,70,20,0.14),
      inset 0 1px 0 rgba(255,255,255,0.7);
    background: #1a1208;
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .ad-canvas-wrap.erasing {
    border-color: #c8602a;
    box-shadow:
      0 2px 0 #e8d8b8,
      0 0 0 3px rgba(200,96,42,0.12),
      0 20px 60px rgba(100,70,20,0.14),
      inset 0 1px 0 rgba(255,255,255,0.7);
  }

  .ad-canvas-wrap canvas {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    display: block;
  }

  .ad-vignette {
    position: absolute; inset: 0; z-index: 20;
    pointer-events: none;
    border-radius: 4px;
    box-shadow: inset 0 0 70px rgba(0,0,0,0.35);
  }

  /* Status badge */
  .ad-badge {
    position: absolute; top: 12px; left: 12px; z-index: 30;
    display: flex; align-items: center; gap: 7px;
    background: rgba(250,245,235,0.88);
    border: 1px solid rgba(180,150,90,0.3);
    border-radius: 3px;
    padding: 5px 12px;
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    color: #7a6040;
    backdrop-filter: blur(6px);
    text-transform: uppercase;
  }
  .ad-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: background 0.4s;
  }

  /* Erase badge */
  .ad-erase-badge {
    position: absolute; top: 12px; right: 12px; z-index: 30;
    background: rgba(255,240,220,0.92);
    border: 1px solid rgba(200,96,42,0.35);
    border-radius: 3px;
    padding: 5px 12px;
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    color: #b04010;
    backdrop-filter: blur(6px);
    text-transform: uppercase;
  }

  /* Loading overlay */
  .ad-loading {
    position: absolute; inset: 0; z-index: 50;
    background: rgba(26,18,8,0.88);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 1rem;
  }
  .ad-spinner {
    width: 30px; height: 30px;
    border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,0.15);
    border-top-color: #e8a84a;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .ad-loading-txt {
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.22em;
    color: #8a7050;
    text-transform: uppercase;
  }

  /* Hint overlay */
  .ad-hint {
    position: absolute; inset: 0; z-index: 15;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 0.8rem;
    pointer-events: none;
  }
  .ad-hint-icon { font-size: 2.8rem; opacity: 0.55; }
  .ad-hint-txt {
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #c8b890;
    background: rgba(250,245,235,0.15);
    border: 1px solid rgba(255,255,255,0.15);
    padding: 6px 18px;
    border-radius: 3px;
  }

  /* ── Buttons ── */
  .ad-btn-row {
    display: flex;
    gap: 0.6rem;
  }

  .ad-btn {
    flex: 1;
    padding: 10px 0;
    font-family: 'DM Serif Display', serif;
    font-size: 0.95rem;
    letter-spacing: 0.08em;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
    border: 1.5px solid;
  }
  .ad-btn:disabled { opacity: 0.35; cursor: default; }

  .ad-btn-ghost {
    background: #faf5eb;
    border-color: #d4c4a0;
    color: #8a7050;
    box-shadow: 0 1px 0 #e8d8b8;
  }
  .ad-btn-ghost:hover:not(:disabled) {
    background: #f0e8d4;
    border-color: #b8a070;
    color: #5a3a10;
  }

  .ad-btn-primary {
    flex: 2;
    background: #1a1208;
    border-color: #3a2810;
    color: #e8c870;
    box-shadow: 0 1px 0 #0a0804, 0 2px 12px rgba(26,18,8,0.2);
  }
  .ad-btn-primary:hover:not(:disabled) {
    background: #2c1e0c;
    border-color: #c8923a;
    color: #f0d880;
  }

  /* ── Sidebar ── */
  .ad-sidebar {
    width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    opacity: 0;
    transform: translateX(14px);
    transition: opacity 0.7s 0.22s ease, transform 0.7s 0.22s ease;
  }
  .ad-sidebar.in { opacity: 1; transform: translateX(0); }

  /* ── Panel ── */
  .ad-panel {
    background: #fdfaf4;
    border: 1.5px solid #e0d0b0;
    border-radius: 4px;
    padding: 1rem;
    box-shadow: 0 1px 0 #f0e4c8, 0 4px 16px rgba(120,90,30,0.06);
    transition: border-color 0.25s, box-shadow 0.25s;
  }
  .ad-panel.erasing {
    border-color: #e0a880;
    box-shadow: 0 1px 0 #f0e4c8, 0 0 0 3px rgba(200,96,42,0.08), 0 4px 16px rgba(120,90,30,0.06);
  }

  .ad-panel-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #b09060;
    margin-bottom: 0.8rem;
  }
  .ad-panel-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e8d8b8;
  }
  .ad-panel-label.erasing-label { color: #c07040; }
  .ad-panel-label.erasing-label::after { background: #f0c8a0; }

  /* ── Swatches ── */
  .ad-swatch-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .ad-swatch {
    width: 26px; height: 26px;
    border-radius: 3px;
    cursor: pointer;
    border: 1.5px solid transparent;
    transition: transform 0.15s, box-shadow 0.15s;
    outline: none;
  }
  .ad-swatch:hover { transform: scale(1.12); }
  .ad-swatch.active {
    box-shadow: 0 0 0 2px #fdfaf4, 0 0 0 3.5px #c8923a;
  }

  .ad-custom-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 0.65rem;
  }
  .ad-custom-label {
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #b09060;
  }
  .ad-color-input {
    width: 28px; height: 28px;
    border-radius: 3px;
    border: 1.5px solid #d4c4a0;
    padding: 2px;
    cursor: pointer;
    background: transparent;
  }

  /* ── Sliders ── */
  .ad-slider-val {
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    color: #c8923a;
    display: block;
    margin-bottom: 0.45rem;
  }
  .ad-slider-val.erasing-val { color: #c8602a; }

  input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 3px;
    background: #e0d0b0;
    border-radius: 2px;
    outline: none;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 13px; height: 13px;
    border-radius: 50%;
    background: #c8923a;
    cursor: pointer;
    border: 2px solid #fdfaf4;
    box-shadow: 0 1px 4px rgba(120,70,10,0.25);
    transition: background 0.2s;
  }
  input[type=range].eraser-range::-webkit-slider-thumb { background: #c8602a; }
  input[type=range]::-moz-range-thumb {
    width: 13px; height: 13px;
    border-radius: 50%;
    background: #c8923a;
    cursor: pointer;
    border: 2px solid #fdfaf4;
  }

  .ad-slider-ends {
    display: flex;
    justify-content: space-between;
    font-family: 'DM Mono', monospace;
    font-size: 0.55rem;
    color: #c8b890;
    margin-top: 3px;
  }

  /* ── Gestures ── */
  .ad-gesture-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 7px;
    border-radius: 3px;
    font-family: 'DM Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.06em;
    color: #a09070;
    transition: background 0.2s, color 0.2s;
  }
  .ad-gesture-row.active-draw  { background: #eef6f0; color: #2a7a4a; }
  .ad-gesture-row.active-erase { background: #fef0e4; color: #b04010; }
  .ad-gesture-icon { font-size: 14px; width: 18px; text-align: center; }

  /* ── Response ── */
  .ad-response-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #b09060;
    margin-bottom: 0.4rem;
  }
  .ad-response-label::after { content: ''; flex: 1; height: 1px; background: #e8d8b8; }

  .ad-response-pre {
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-all;
    padding: 0.75rem;
    background: #faf5eb;
    border: 1.5px solid #e0d0b0;
    border-radius: 3px;
    box-shadow: inset 0 1px 4px rgba(120,90,30,0.05);
  }
  .ad-response-pre.ok    { color: #1a6a3a; }
  .ad-response-pre.error { color: #a02020; }

  /* ── Footer ── */
  .ad-footer {
    margin-top: 1.8rem;
    font-family: 'DM Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.22em;
    color: #c8b890;
    text-transform: uppercase;
  }

  /* ── Prediction result highlight ── */
  .ad-prediction {
    text-align: center;
    padding: 0.6rem;
    background: #f5f0e0;
    border: 1.5px solid #d4c090;
    border-radius: 3px;
    margin-top: 0.3rem;
  }
  .ad-prediction-digit {
    font-family: 'DM Serif Display', serif;
    font-size: 2.8rem;
    color: #1a1208;
    line-height: 1;
  }
  .ad-prediction-conf {
    font-family: 'DM Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    color: #a09060;
    text-transform: uppercase;
    margin-top: 3px;
  }
`;

export default function AirDraw() {
  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const mirrorRef     = useRef(null);
  const animFrameRef  = useRef(null);
  const lastPointRef  = useRef(null);
  const isDrawingRef  = useRef(false);
  const brushColorRef = useRef("#1a1208");
  const brushSizeRef  = useRef(5);
  const eraserSizeRef = useRef(40);

  const [status, setStatus]                   = useState("idle");
  const [brushColor, setBrushColor]           = useState("#1a1208");
  const [brushSize, setBrushSize]             = useState(5);
  const [eraserSize, setEraserSize]           = useState(40);
  const [backendResponse, setBackendResponse] = useState(null);
  const [handDetected, setHandDetected]       = useState(false);
  const [strokeCount, setStrokeCount]         = useState(0);
  const [gestureMode, setGestureMode]         = useState("idle");
  const [mounted, setMounted]                 = useState(false);

  const PALETTE = [
    "#1a1208","#c8923a","#b04010","#2a7a4a",
    "#1a4a8a","#7a3a8a","#c83050","#6a8a60",
  ];

  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);
  useEffect(() => { brushColorRef.current  = brushColor;  }, [brushColor]);
  useEffect(() => { brushSizeRef.current   = brushSize;   }, [brushSize]);
  useEffect(() => { eraserSizeRef.current  = eraserSize;  }, [eraserSize]);

  const onResults = useCallback((results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width: w, height: h } = canvas;

    if (!results.multiHandLandmarks?.length) {
      setHandDetected(false); setGestureMode("idle");
      lastPointRef.current = null; isDrawingRef.current = false;
      return;
    }

    setHandDetected(true);
    const lm = results.multiHandLandmarks[0];

    if (isOpenPalm(lm)) {
      setGestureMode("erase");
      isDrawingRef.current = false; lastPointRef.current = null;
      const { x, y } = palmCenter(lm, w, h);
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, eraserSizeRef.current, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fill();
      ctx.restore();
      return;
    }

    const tip = lm[8], pip = lm[6];
    const x = (1 - tip.x) * w, y = tip.y * h;
    const indexUp = tip.y < pip.y - 0.04;

    if (indexUp) {
      setGestureMode("draw");
      if (lastPointRef.current && isDrawingRef.current) {
        ctx.beginPath();
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = brushColorRef.current;
        ctx.lineWidth   = brushSizeRef.current;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.stroke();
      }
      if (!isDrawingRef.current) { isDrawingRef.current = true; setStrokeCount(c => c + 1); }
      lastPointRef.current = { x, y };
    } else {
      setGestureMode("idle");
      isDrawingRef.current = false; lastPointRef.current = null;
    }
  }, []);

  useEffect(() => {
    setStatus("loading");
    const loadScript = (src) => new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement("script");
      s.src = src; s.crossOrigin = "anonymous"; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    const init = async () => {
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
      const h = new window.Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
      h.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });
      h.onResults(onResults);
      const cam = new window.Camera(videoRef.current, {
        onFrame: async () => { await h.send({ image: videoRef.current }); },
        width: 640, height: 480,
      });
      await cam.start();
      setStatus("ready");
    };
    init().catch(e => { console.error(e); setStatus("error"); });
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [onResults]);

  useEffect(() => {
    if (status !== "ready") return;
    const draw = () => {
      const mirror = mirrorRef.current, video = videoRef.current;
      if (mirror && video && video.readyState >= 2) {
        const ctx = mirror.getContext("2d");
        ctx.save(); ctx.scale(-1, 1);
        ctx.drawImage(video, -mirror.width, 0, mirror.width, mirror.height);
        ctx.restore();
      }
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, [status]);

  const clearCanvas = () => {
    canvasRef.current.getContext("2d").clearRect(0, 0, 640, 480);
    setStrokeCount(0); setBackendResponse(null);
  };

  const sendDrawing = async () => {
    setStatus("sending"); setBackendResponse(null);
    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: canvasRef.current.toDataURL("image/png") }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBackendResponse(data); setStatus("sent");
    } catch (err) {
      setBackendResponse({ error: err.message }); setStatus("error");
    } finally {
      setTimeout(() => setStatus("ready"), 3000);
    }
  };

  const isErasing = gestureMode === "erase";
  const isReady   = status === "ready";

  const dotBg =
    status === "loading" || status === "sending" ? "#d4a017"
    : status === "error"  ? "#c03030"
    : status === "sent"   ? "#2a8a4a"
    : isErasing           ? "#c8602a"
    : handDetected        ? "#2a8a4a"
    :                       "#b0a080";

  const modeLabel =
    status === "idle"      ? "Initialising…"        :
    status === "loading"   ? "Loading hand model…"  :
    status === "sending"   ? "Sending…"             :
    status === "sent"      ? "Prediction received"  :
    status === "error"     ? "Connection error"     :
    isErasing              ? "Erasing"              :
    gestureMode === "draw" ? `Stroke ${strokeCount}`:
    handDetected           ? "Hand detected"        :
    strokeCount > 0        ? `${strokeCount} stroke${strokeCount !== 1 ? "s" : ""}` :
                             "Raise index finger to draw";

  const gestures = [
    { key: "draw",  icon: "☝️", label: "Index up → draw"   },
    { key: "erase", icon: "✋", label: "Open palm → erase"  },
    { key: "lift",  icon: "✊", label: "Fist → lift pen"    },
  ];

  return (
    <div className="ad-root">
      <style>{CSS}</style>

      {/* Header */}
      <div className={`ad-header ${mounted ? "in" : ""}`}>
        <h1 className="ad-title">Air <em>Draw</em></h1>
        <p className="ad-subtitle">Gesture-controlled canvas · Hand tracking</p>
        <div className="ad-rule" />
      </div>

      <div className="ad-layout">

        {/* ── Canvas column ── */}
        <div className={`ad-canvas-col ${mounted ? "in" : ""}`}>
          <div className={`ad-canvas-wrap ${isErasing ? "erasing" : ""}`}>
            <video ref={videoRef} style={{ display: "none" }} playsInline />
            <canvas ref={mirrorRef} width={640} height={480} style={{ zIndex: 1 }} />
            <canvas ref={canvasRef} width={640} height={480} style={{ zIndex: 2 }} />
            <div className="ad-vignette" />

            {/* Status badge */}
            <div className="ad-badge">
              <span className="ad-dot" style={{ background: dotBg }} />
              {modeLabel}
            </div>

            {/* Erase badge */}
            {isErasing && <div className="ad-erase-badge">erasing</div>}

            {/* Loading overlay */}
            {(status === "idle" || status === "loading") && (
              <div className="ad-loading">
                <div className="ad-spinner" />
                <p className="ad-loading-txt">Loading hand model</p>
              </div>
            )}

            {/* Hint */}
            {isReady && !handDetected && strokeCount === 0 && (
              <div className="ad-hint">
                <span className="ad-hint-icon">☝️</span>
                <p className="ad-hint-txt">Raise your index finger to draw</p>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="ad-btn-row">
            <button className="ad-btn ad-btn-ghost" onClick={clearCanvas} disabled={status === "sending"}>
              Clear
            </button>
            <button className="ad-btn ad-btn-primary" onClick={sendDrawing} disabled={!isReady || strokeCount === 0}>
              {status === "sending" ? "Sending…" : "Send drawing"}
            </button>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className={`ad-sidebar ${mounted ? "in" : ""}`}>

          {/* Colour */}
          <div className="ad-panel">
            <div className="ad-panel-label">Colour</div>
            <div className="ad-swatch-grid">
              {PALETTE.map(c => (
                <button key={c}
                  className={`ad-swatch ${brushColor === c ? "active" : ""}`}
                  onClick={() => setBrushColor(c)}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="ad-custom-row">
              <span className="ad-custom-label">Custom</span>
              <input type="color" className="ad-color-input" value={brushColor}
                onChange={e => setBrushColor(e.target.value)} />
            </div>
          </div>

          {/* Brush */}
          <div className="ad-panel">
            <div className="ad-panel-label">Brush</div>
            <span className="ad-slider-val">{brushSize}px</span>
            <input type="range" min={1} max={20} value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))} />
            <div className="ad-slider-ends"><span>fine</span><span>thick</span></div>
          </div>

          {/* Eraser */}
          <div className={`ad-panel ${isErasing ? "erasing" : ""}`}>
            <div className={`ad-panel-label ${isErasing ? "erasing-label" : ""}`}>Eraser</div>
            <span className={`ad-slider-val ${isErasing ? "erasing-val" : ""}`}>{eraserSize}px</span>
            <input type="range" min={10} max={80} value={eraserSize}
              className={isErasing ? "eraser-range" : ""}
              onChange={e => setEraserSize(Number(e.target.value))} />
            <div className="ad-slider-ends"><span>small</span><span>large</span></div>
          </div>

          {/* Gestures */}
          <div className="ad-panel">
            <div className="ad-panel-label">Gestures</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {gestures.map(({ key, icon, label }) => (
                <div key={key}
                  className={`ad-gesture-row ${gestureMode === key ? `active-${key}` : ""}`}>
                  <span className="ad-gesture-icon">{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Response */}
          {backendResponse && (
            <div>
              <div className="ad-response-label">Response</div>
              {backendResponse.prediction !== undefined && (
                <div className="ad-prediction">
                  <div className="ad-prediction-digit">{backendResponse.prediction}</div>
                  {backendResponse.confidence !== undefined && (
                    <div className="ad-prediction-conf">
                      {(backendResponse.confidence * 100).toFixed(1)}% confidence
                    </div>
                  )}
                </div>
              )}
              {backendResponse.error && (
                <pre className="ad-response-pre error">{JSON.stringify(backendResponse, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="ad-footer">{BACKEND_URL}</p>
    </div>
  );
}