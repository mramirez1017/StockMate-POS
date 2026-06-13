import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

const SCAN_COOLDOWN_MS = 2000;

export default function BarcodeScannerModal({ open, onClose, onScan }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onScanRef = useRef(onScan);
  const lastScanRef = useRef({ code: "", at: 0 });
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Starting camera…");

  onScanRef.current = onScan;

  useEffect(() => {
    if (!open) return;

    setError(null);
    setHint("Starting camera…");
    lastScanRef.current = { code: "", at: 0 };

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 250,
      delayBetweenScanSuccess: SCAN_COOLDOWN_MS,
    });
    let mounted = true;

    void (async () => {
      const video = videoRef.current;
      if (!video) return;

      try {
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          video,
          (result) => {
            if (!mounted || !result) return;
            const code = result.getText().trim();
            if (!code) return;

            const now = Date.now();
            const last = lastScanRef.current;
            if (code === last.code && now - last.at < SCAN_COOLDOWN_MS) return;

            lastScanRef.current = { code, at: now };
            setHint(`Added: ${code}`);
            onScanRef.current(code);
            navigator.vibrate?.(40);
          },
        );

        if (!mounted) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setHint("Point the camera at a barcode");
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message.toLowerCase() : "";
        if (message.includes("permission") || message.includes("notallowed") || message.includes("denied")) {
          setError(
            "Camera permission denied. Allow camera access for this site in your browser settings, then try again.",
          );
        } else if (message.includes("notfound") || message.includes("devices")) {
          setError("No camera found on this device.");
        } else {
          setError("Could not open the camera. Type the barcode manually or use a Bluetooth scanner.");
        }
        setHint("");
      }
    })();

    return () => {
      mounted = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scanner"
    >
      <div className="safe-top flex shrink-0 items-center justify-between px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-base font-semibold">Scan barcode</p>
          <p className="truncate text-xs text-white/70">{hint}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-white/10 p-2.5 text-white transition hover:bg-white/20"
          aria-label="Close scanner"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          autoPlay
        />

        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
            <div className="relative aspect-[4/3] w-full max-w-sm">
              <div className="absolute inset-0 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]" />
              <div className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-emerald-400" />
              <div className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-emerald-400" />
              <div className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-emerald-400" />
              <div className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-emerald-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="max-w-sm rounded-xl border border-red-400/40 bg-red-950/90 p-4 text-center text-sm text-red-100">
              {error}
            </div>
          </div>
        )}
      </div>

      <div className="safe-bottom shrink-0 space-y-3 bg-black/90 px-4 py-4 text-center text-sm text-white/80">
        <p>Supports EAN, UPC, Code 128, Code 39, and QR codes.</p>
        <button type="button" onClick={onClose} className="btn-secondary w-full border-white/20 bg-white/10 text-white hover:bg-white/20">
          Close
        </button>
      </div>
    </div>
  );
}
