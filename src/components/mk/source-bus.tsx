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
    <section className="mk-panel flex flex-1 flex-col rounded-md p-2 sm:p-3">
      <header className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            kind === "program" ? "bg-program mk-tally-program" : "bg-preview",
          )}
        />
        <h2 className="mk-label text-foreground">{kind === "program" ? "Program" : "Preview"}</h2>
        <span className="mk-label ml-auto text-[9px]">
          {kind === "program" ? "On Air" : "Next"}
        </span>
      </header>
      <div className="grid flex-1 grid-cols-4 gap-1.5 md:grid-cols-8 sm:gap-2">
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
