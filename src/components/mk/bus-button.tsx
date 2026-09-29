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
        "mk-button flex h-full min-h-[3.25rem] w-full flex-col items-center justify-center gap-0.5 rounded-sm px-1 py-1.5 sm:min-h-[4.5rem]",
        lit === "program" && "mk-lit-program",
        lit === "preview" && "mk-lit-preview",
        !scene && "opacity-55",
      )}
      aria-pressed={lit !== null}
      aria-label={`${label}${scene ? ` — ${scene}` : " — unmapped"}`}
    >
      <span className="text-sm leading-none tracking-[0.1em] sm:text-base">{label}</span>
      <span
        className={cn(
          "max-w-full truncate font-mono text-[9px] leading-none tracking-wide opacity-70 sm:text-[10px]",
          !lit && "text-muted-foreground",
        )}
      >
        {scene ?? "UNMAPPED"}
      </span>
    </button>
  );
}
