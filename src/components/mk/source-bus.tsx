import { BusButton } from "@/components/mk/bus-button";
import { CAM_COUNT, camLabel, type CamIndex } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface SourceBusProps {
  kind: "program" | "preview";
  active: CamIndex | null;
  camScenes: (string | null)[];
  onSelect: (cam: CamIndex) => void;
}

export function SourceBus({ kind, active, camScenes, onSelect }: SourceBusProps) {
  return (
    <section className="mk-panel flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1">
      <div className="flex w-[4.2rem] shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            kind === "program" ? "bg-program shadow-[0_0_7px_var(--color-program)]" : "bg-preview shadow-[0_0_7px_var(--color-preview)]",
          )}
        />
        <h2 className="mk-label text-[9px] text-foreground">{kind === "program" ? "Program" : "Preview"}</h2>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 md:grid-cols-8">
        {Array.from({ length: CAM_COUNT }, (_, index) => (
          <BusButton
            key={index}
            label={camLabel(index)}
            scene={camScenes[index] ?? null}
            lit={active === index ? kind : null}
            onSelect={() => onSelect(index)}
          />
        ))}
      </div>
    </section>
  );
}
