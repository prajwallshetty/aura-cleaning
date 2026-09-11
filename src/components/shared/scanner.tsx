"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ScannerProps {
  /** Called with the raw scanned/typed value. */
  onScan: (value: string) => void | Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  /** Ignore repeat reads of the same code for this many ms. */
  debounceMs?: number;
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
}: ScannerProps) {
  const [mode, setMode] = useState<"keyboard" | "camera">("keyboard");
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
        await onScan(code);
      } finally {
        setBusy(false);
        setValue("");
        inputRef.current?.focus();
      }
    },
    [onScan, disabled, debounceMs],
  );

  // Camera lifecycle. html5-qrcode touches the DOM directly, so it is loaded
  // lazily and always torn down when the mode changes or the view unmounts.
  useEffect(() => {
    if (mode !== "camera") return;

    let cancelled = false;
    setCameraError(null);

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
      } catch (error) {
        if (!cancelled) {
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

  return (
    <div className={cn("space-y-3", className)}>
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
        <Button
          type="button"
          variant={mode === "camera" ? "default" : "outline"}
          size="icon"
          className="h-12 w-12"
          onClick={() => setMode((m) => (m === "camera" ? "keyboard" : "camera"))}
          aria-label={mode === "camera" ? "Switch to keyboard entry" : "Scan with camera"}
          disabled={disabled}
        >
          {mode === "camera" ? <Keyboard /> : <Camera />}
        </Button>
      </div>

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
