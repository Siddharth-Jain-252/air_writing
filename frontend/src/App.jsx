import { useEffect, useRef, useState, useCallback } from "react";

const BACKEND_URL = "http://127.0.0.1:8000/predict"; // ← change to your endpoint

export default function AirDraw() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mirrorRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastPointRef = useRef(null);
  const isDrawingRef = useRef(false);
  const brushColorRef = useRef("#ff0000");
  const brushSizeRef = useRef(4);

  const [status, setStatus] = useState("idle");
  const [brushColor, setBrushColor] = useState("#ff0000");
  const [brushSize, setBrushSize] = useState(4);
  const [backendResponse, setBackendResponse] = useState(null);
  const [handDetected, setHandDetected] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);

  const COLORS = ["#000000", "#ffffff", "#ff0000", "#008000", "#0000ff", "#ffff00", "#ff8800", "#800080"];

  useEffect(() => { brushColorRef.current = brushColor; }, [brushColor]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);

  // ── Hand tracking ────────────────────────────────────────────────────────────
  const onResults = useCallback((results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (!results.multiHandLandmarks?.length) {
      setHandDetected(false);
      lastPointRef.current = null;
      isDrawingRef.current = false;
      return;
    }

    setHandDetected(true);
    const lm = results.multiHandLandmarks[0];
    const tip = lm[8]; // index tip
    const pip = lm[6]; // index PIP
    const x = (1 - tip.x) * canvas.width;
    const y = tip.y * canvas.height;
    const indexUp = tip.y < pip.y - 0.04;

    if (indexUp) {
      if (lastPointRef.current && isDrawingRef.current) {
        ctx.beginPath();
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = brushColorRef.current;
        ctx.lineWidth = brushSizeRef.current;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      if (!isDrawingRef.current) {
        isDrawingRef.current = true;
        setStrokeCount((c) => c + 1);
      }
      lastPointRef.current = { x, y };
    } else {
      isDrawingRef.current = false;
      lastPointRef.current = null;
    }
  }, []); // stable — reads only refs, no state deps

  // ── Bootstrap MediaPipe ──────────────────────────────────────────────────────
  useEffect(() => {
    setStatus("loading");

    const loadScript = (src) =>
      new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) return res();
        const s = document.createElement("script");
        s.src = src;
        s.crossOrigin = "anonymous";
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });

    const init = async () => {
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");

      const hands = new window.Hands({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.6,
      });

      hands.onResults(onResults);

      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => { await hands.send({ image: videoRef.current }); },
        width: 640,
        height: 480,
      });

      await camera.start();
      setStatus("ready");
    };

    init().catch((e) => { console.error(e); setStatus("error"); });
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [onResults]);

  // ── Mirror webcam ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "ready") return;
    const draw = () => {
      const mirror = mirrorRef.current;
      const video = videoRef.current;
      if (mirror && video && video.readyState >= 2) {
        const ctx = mirror.getContext("2d");
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -mirror.width, 0, mirror.width, mirror.height);
        ctx.restore();
      }
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, [status]);

  // ── Clear ────────────────────────────────────────────────────────────────────
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setStrokeCount(0);
    setBackendResponse(null);
  };

  // ── Send ─────────────────────────────────────────────────────────────────────
  const sendDrawing = async () => {
    const composite = document.createElement("canvas");
    composite.width = 640;
    composite.height = 480;
    const ctx = composite.getContext("2d");
    ctx.drawImage(mirrorRef.current, 0, 0);
    ctx.drawImage(canvasRef.current, 0, 0);

    setStatus("sending");
    setBackendResponse(null);

    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: canvasRef.current.toDataURL("image/png")
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBackendResponse(data);
      setStatus("sent");
    } catch (err) {
      setBackendResponse({ error: err.message });
      setStatus("error");
    } finally {
      setTimeout(() => setStatus("ready"), 3000);
    }
  };

  const statusLabel = {
    idle: "Initializing…",
    loading: "Loading MediaPipe…",
    ready: strokeCount > 0 ? `${strokeCount} stroke${strokeCount !== 1 ? "s" : ""}` : "Raise index finger to draw",
    sending: "Sending…",
    sent: "Sent!",
    error: "Error",
  }[status];

  const statusDotColor =
    status === "loading" || status === "sending" ? "#f59e0b"
    : status === "error"  ? "#ef4444"
    : status === "sent"   ? "#22c55e"
    : handDetected        ? "#22c55e"
    :                       "#9ca3af";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <h1 className="text-2xl font-bold text-gray-800 mb-1">Air Draw</h1>
      <p className="text-sm text-gray-500 mb-5">Draw in the air with your index finger</p>

      {/* Main row: canvas column + sidebar column */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

        {/* ── Left column: canvas + buttons ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Canvas stack — status badge overlaid inside top-left corner */}
          <div style={{ position: "relative", width: 640, height: 480, border: "2px solid #9ca3af", borderRadius: 6, overflow: "hidden", background: "#000" }}>
            <video ref={videoRef} style={{ display: "none" }} playsInline />

            <canvas ref={mirrorRef} width={640} height={480}
              style={{ display: "block", position: "absolute", top: 0, left: 0 }} />

            <canvas ref={canvasRef} width={640} height={480}
              style={{ display: "block", position: "absolute", top: 0, left: 0, zIndex: 2 }} />

            {/* Status badge — top-left inside canvas */}
            <div style={{
              position: "absolute", top: 10, left: 10, zIndex: 6,
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(0,0,0,0.55)", borderRadius: 4,
              padding: "4px 10px", color: "#fff", fontSize: 13,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: statusDotColor, display: "inline-block" }} />
              {statusLabel}
            </div>

            {/* Loading overlay */}
            {(status === "idle" || status === "loading") && (
              <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #555", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
                <p style={{ color: "#fff", fontSize: 14 }}>Loading MediaPipe…</p>
              </div>
            )}

            {/* Finger hint */}
            {status === "ready" && !handDetected && strokeCount === 0 && (
              <div style={{ position: "absolute", inset: 0, zIndex: 4, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, pointerEvents: "none" }}>
                <span style={{ fontSize: 48 }}>☝️</span>
                <p style={{ color: "#fff", fontSize: 14, background: "rgba(0,0,0,0.5)", padding: "4px 12px", borderRadius: 4 }}>
                  Raise your index finger to start drawing
                </p>
              </div>
            )}
          </div>

          {/* Buttons — same width as canvas */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={clearCanvas}
              disabled={status === "sending"}
              style={{ flex: 1, padding: "8px 0", fontSize: 14, background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", color: "#374151", opacity: status === "sending" ? 0.4 : 1 }}
            >
              Clear
            </button>
            <button
              onClick={sendDrawing}
              disabled={status !== "ready" || strokeCount === 0}
              style={{ flex: 2, padding: "8px 0", fontSize: 14, fontWeight: 600, background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", opacity: (status !== "ready" || strokeCount === 0) ? 0.4 : 1 }}
            >
              {status === "sending" ? "Sending…" : "Send Drawing"}
            </button>
          </div>
        </div>

        {/* ── Right column: controls sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 200 }}>

          {/* Color palette */}
          <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>Color</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setBrushColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: 4,
                    backgroundColor: c,
                    // always show a gray border; active gets a blue ring; white gets a gray border so it's visible
                    border: brushColor === c
                      ? "3px solid #2563eb"
                      : c === "#ffffff" ? "2px solid #9ca3af" : "1px solid #d1d5db",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <label style={{ fontSize: 12, color: "#6b7280" }}>Custom</label>
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                style={{ width: 32, height: 32, cursor: "pointer", borderRadius: 4, border: "1px solid #d1d5db", padding: 2 }}
              />
            </div>
          </div>

          {/* Brush size */}
          <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>
              Brush — {brushSize}px
            </p>
            <input
              type="range" min={2} max={20} value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
              <span>Fine</span><span>Thick</span>
            </div>
          </div>

          {/* Gestures */}
          <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>Gestures</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#374151" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>☝️</span><span>Index up → draw</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>✊</span><span>Fist → lift pen</span></div>
            </div>
          </div>

          {/* Backend response */}
          {backendResponse && (
            <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>Response</p>
              <pre style={{
                fontSize: 12, overflowAuto: "auto", maxHeight: 150,
                whiteSpace: "pre-wrap", wordBreak: "break-all",
                color: backendResponse.error ? "#ef4444" : "#16a34a",
                margin: 0,
              }}>
                {JSON.stringify(backendResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: "#9ca3af" }}>Endpoint: {BACKEND_URL}</p>
    </div>
  );
} 