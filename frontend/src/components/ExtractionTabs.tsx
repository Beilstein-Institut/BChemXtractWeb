/**
 * ExtractionTabs — local-state tabs wrapping the results area (Plan 10 D-08).
 *
 * Two triggers: `Structures (N)` and `Reactions` with an "Experimental" pill
 * badge. Default active is Structures. The children prop is rendered inside
 * the Structures tab panel (existing StructureBrowser stays here); the
 * Reactions tab panel mounts a ReactionsTab with the supplied props.
 * (Internal tab values and the `substanceCount` prop keep the "substances"
 * naming — only the visible label says "Structures", matching the rest of
 * the Browse page.)
 *
 * CRITICAL D-08 contract: tab state is LOCAL React state — never persisted
 * to the URL. Phase 6 URL params (?extraction=&page=&view=&sort=) continue to
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
      <TabsList className="h-9 w-full sm:w-fit">
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
                "h-5 px-1.5 text-micro font-semibold border-0",
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
      <TabsContent value="reactions">
        <ReactionsTab {...reactionsTabProps} />
      </TabsContent>
    </Tabs>
  );
}
