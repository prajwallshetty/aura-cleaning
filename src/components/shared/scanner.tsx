"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ScannerProps {
  /** Called with the raw scanned/typed value and which input produced it. */
  onScan: (value: string, source: "keyboard" | "camera") => void | Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  /** Ignore repeat reads of the same code for this many ms. */
  debounceMs?: number;
  /**
   * "compact" is the small inline scanner used on workstation screens.
   * "workstation" is the large, full-attention scan surface for /scan: a
   * prominent Start/Stop Scanner button, an animated scanning frame, and a
   * live status line, with the keyboard/hardware-scanner input always ready
   * underneath.
   */
  variant?: "compact" | "workstation";
}

/**
 * Dual-mode garment scanner.
 *
 * Keyboard mode is the default because hardware barcode guns behave like
 * keyboards and are what most counters use; camera mode covers phones and
 * tablets on the shop floor. Both funnel into the same `onScan` callback.
 */
export function Scanner({
  onScan,
  placeholder = "Scan or type a garment code (e.g. G1001)",
  autoFocus = true,
  className,
  disabled,
  debounceMs = 1200,
  variant = "compact",
}: ScannerProps) {
  const [mode, setMode] = useState<"keyboard" | "camera">("keyboard");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const regionId = useId().replace(/:/g, "");

  const submit = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || disabled) return;

      const now = Date.now();
      if (
        lastScanRef.current.code === code &&
        now - lastScanRef.current.at < debounceMs
      ) {
        return;
      }
      lastScanRef.current = { code, at: now };

      setBusy(true);
      try {
        await onScan(code, mode);
      } finally {
        setBusy(false);
        setValue("");
        inputRef.current?.focus();
      }
    },
    [onScan, disabled, debounceMs, mode],
  );

  // Camera lifecycle. html5-qrcode touches the DOM directly, so it is loaded
  // lazily and always torn down when the mode changes or the view unmounts.
  useEffect(() => {
    if (mode !== "camera") return;

    let cancelled = false;
    setCameraError(null);
    setCameraStarting(true);

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const instance = new Html5Qrcode(regionId, { verbose: false });
        scannerRef.current = {
          stop: () => instance.stop(),
          clear: () => instance.clear(),
        };

        await instance.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            void submit(decoded);
          },
          () => {
            // Per-frame decode misses are expected; nothing to report.
          },
        );
        if (!cancelled) setCameraStarting(false);
      } catch (error) {
        if (!cancelled) {
          setCameraStarting(false);
          setCameraError(
            error instanceof Error
              ? error.message
              : "Unable to start the camera. Check browser permissions.",
          );
          setMode("keyboard");
        }
      }
    })();

    return () => {
      cancelled = true;
      const current = scannerRef.current;
      scannerRef.current = null;
      if (current) {
        current
          .stop()
          .then(() => current.clear())
          .catch(() => {
            /* already stopped */
          });
      }
    };
  }, [mode, regionId, submit]);

  const keyboardInput = (
    <div className="flex gap-2">
      <form
        className="relative flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(value);
        }}
      >
        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled || busy}
          autoComplete="off"
          spellCheck={false}
          className="h-12 pr-10 font-mono text-base uppercase"
          aria-label="Garment code"
        />
        {busy ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </form>
      {variant === "compact" ? (
        <Button
          type="button"
          variant={mode === "camera" ? "default" : "outline"}
          size="icon"
          className="h-12 w-12"
          onClick={() => setMode((m) => (m === "camera" ? "keyboard" : "camera"))}
          aria-label={mode === "camera" ? "Switch to keyboard entry" : "Scan with camera"}
          disabled={disabled}
        >
          {mode === "camera" ? <ScanLine /> : <Camera />}
        </Button>
      ) : null}
    </div>
  );

  if (variant === "workstation") {
    return (
      <div className={cn("space-y-3", className)}>
        <div
          className={cn(
            "relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-2xl border-2 transition-colors",
            mode === "camera"
              ? "border-primary/40 bg-black"
              : "border-dashed border-border bg-muted/30",
          )}
        >
          {mode === "camera" ? (
            <>
              <div id={regionId} className="w-full max-w-sm" />
              {!cameraStarting ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="scan-frame relative size-56 max-w-[70%]">
                    <span className="scan-frame-corner scan-frame-corner-tl" />
                    <span className="scan-frame-corner scan-frame-corner-tr" />
                    <span className="scan-frame-corner scan-frame-corner-bl" />
                    <span className="scan-frame-corner scan-frame-corner-br" />
                    <span className="scan-frame-laser" />
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                  <Loader2 className="size-6 animate-spin" />
                  <p className="text-sm">Starting camera…</p>
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute bottom-3 left-1/2 -translate-x-1/2"
                onClick={() => setMode("keyboard")}
              >
                <CameraOff /> Stop Scanner
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ScanLine className="size-8" />
              </span>
              <div>
                <p className="font-medium">Ready to scan</p>
                <p className="text-sm text-muted-foreground">
                  Start the camera, or scan/type below.
                </p>
              </div>
              <Button type="button" size="lg" onClick={() => setMode("camera")} disabled={disabled}>
                <Camera /> Start Scanner
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 text-sm font-medium">
          <span
            className={cn(
              "size-2 rounded-full",
              mode === "camera" ? "animate-pulse bg-success" : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          {mode === "camera" ? (cameraStarting ? "Starting…" : "Scanning…") : "Camera idle"}
        </div>

        {keyboardInput}

        {cameraError ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <CameraOff className="size-3.5" /> {cameraError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {keyboardInput}

      {mode === "camera" ? (
        <div className="overflow-hidden rounded-lg border border-border bg-black/90">
          <div id={regionId} className="mx-auto w-full max-w-sm" />
        </div>
      ) : null}

      {cameraError ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <CameraOff className="size-3.5" /> {cameraError}
        </p>
      ) : null}
    </div>
  );
}
