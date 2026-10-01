import { cn } from "@/lib/utils";

interface BusButtonProps {
  label: string;
  scene: string | null;
  lit: "program" | "preview" | null;
  onSelect: () => void;
}

export function BusButton({ label, scene, lit, onSelect }: BusButtonProps) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        // Fire on press, not on click: live production needs zero added latency.
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        "mk-button flex h-9 min-w-0 flex-col items-center justify-center gap-[3px] rounded-[3px] px-1",
        lit === "program" && "mk-lit-program",
        lit === "preview" && "mk-lit-preview",
        !scene && !lit && "opacity-70",
      )}
      aria-pressed={lit !== null}
      aria-label={`${label}${scene ? ` — ${scene}` : " — unmapped"}`}
    >
      <span className="text-[13px] leading-none tracking-[0.1em]">{label}</span>
      <span className="max-w-full truncate font-mono text-[7px] leading-none tracking-wide opacity-70">
        {scene ?? "UNMAPPED"}
      </span>
    </button>
  );
}
