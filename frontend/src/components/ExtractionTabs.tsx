/**
 * ExtractionTabs — local-state tabs wrapping the results area.
 *
 * Two triggers: `Structures (N)` and `Reactions` with an "Experimental" pill
 * badge. Default active is Structures. The children prop is rendered inside
 * the Structures tab panel (existing StructureBrowser stays here); the
 * Reactions tab panel mounts a ReactionsTab with the supplied props.
 * (Internal tab values and the `substanceCount` prop keep the "substances"
 * naming — only the visible label says "Structures", matching the rest of
 * the Browse page.)
 *
 * CRITICAL contract: tab state is LOCAL React state — never persisted
 * to the URL. URL params (?extraction=&page=&view=&sort=) continue to
 * own what the Substances tab looks like; the tab pick is transient view
 * state, like a collapsible section or a sort direction toggle. The tests
 * for this file spy on history.pushState / replaceState and assert zero
 * invocations across a full tab-switch cycle.
 */
import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ReactionsTab, type ReactionsTabProps } from "@/components/ReactionsTab";

export interface ExtractionTabsProps {
  /** Used inside the Structures tab trigger label: "Structures (N)". */
  substanceCount: number;
  /** Rendered inside the Structures tab panel (existing StructureBrowser). */
  children: ReactNode;
  /** Forwarded to ReactionsTab inside the Reactions tab panel. */
  reactionsTabProps: ReactionsTabProps;
}

export function ExtractionTabs({
  substanceCount,
  children,
  reactionsTabProps,
}: ExtractionTabsProps) {
  const [value, setValue] = useState<"substances" | "reactions">("substances");

  return (
    <Tabs
      value={value}
      onValueChange={(v) => setValue(v as "substances" | "reactions")}
      className="mt-6"
    >
      {/* min-h-9 (not h-9): a fixed height with overflow-x-auto makes the
          browser promote overflow-y to auto too, showing a spurious vertical
          scrollbar when content is a hair taller than 36px. min-height keeps
          the touch target without clipping, so no scrollbar appears. */}
      <TabsList className="min-h-9 w-full overflow-x-auto sm:w-fit">
        <TabsTrigger value="substances">
          <span className="flex items-center gap-2">
            Structures
            <span className="text-muted-foreground tabular-nums">({substanceCount})</span>
          </span>
        </TabsTrigger>
        <TabsTrigger value="reactions">
          <span className="flex items-center gap-2">
            Reactions
            <Badge
              variant="secondary"
              className={cn(
                // Hidden on phones so the two tabs fit without cropping; the
                // experimental warning still shows prominently in the
                // Reactions panel (ExperimentalBanner).
                "hidden h-5 px-1.5 text-micro font-semibold border-0 sm:inline-flex",
                "bg-amber-100 text-amber-900",
                "dark:bg-amber-900/30 dark:text-amber-200",
              )}
            >
              Experimental
            </Badge>
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="substances" className="mt-8">
        {children}
      </TabsContent>
      {/*
        keepMounted: reaction extraction runs on demand and its result lives in
        ReactionsTab's useReactions state. Without this the panel unmounts on
        every switch to Structures, discarding an already-extracted reaction and
        forcing the user to re-extract. Keeping it mounted (hidden) preserves
        that state — and lets an in-flight extraction finish across tab switches.
      */}
      <TabsContent value="reactions" keepMounted>
        <ReactionsTab {...reactionsTabProps} />
      </TabsContent>
    </Tabs>
  );
}
