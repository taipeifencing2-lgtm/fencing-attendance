import { useRef, useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HoldButtonProps extends Omit<ButtonProps, "onClick"> {
  onHoldComplete: () => void;
  holdMs?: number;
  children: ReactNode;
}

/** 長按指定毫秒後觸發,避免誤觸 */
export function HoldButton({ onHoldComplete, holdMs = 2000, children, className, disabled, ...rest }: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setHolding(false);
    setProgress(0);
  };

  const tick = () => {
    if (startRef.current == null) return;
    const elapsed = performance.now() - startRef.current;
    const pct = Math.min(100, (elapsed / holdMs) * 100);
    setProgress(pct);
    if (elapsed >= holdMs) {
      if (!triggeredRef.current) {
        triggeredRef.current = true;
        onHoldComplete();
      }
      stop();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const start = (e: React.SyntheticEvent) => {
    if (disabled) return;
    e.preventDefault();
    triggeredRef.current = false;
    setHolding(true);
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <Button
      {...rest}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("relative overflow-hidden select-none touch-none", className)}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-primary-foreground/20 transition-[width] pointer-events-none"
        style={{ width: `${progress}%` }}
      />
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
        {holding && <span className="text-xs opacity-80">按住中… {Math.round(progress)}%</span>}
      </span>
    </Button>
  );
}
