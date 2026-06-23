/**
 * CommandPalette — Spotlight-style neomorphic modal.
 *
 * Apple-Spotlight inspired command palette: a centered fixed-position
 * card with a large search input at the top, a 4-column grid of
 * chemistry-flavored shortcut tiles below (shown while the query is
 * empty), and a live results list that filters the global command set
 * as soon as the user types.
 *
 * The surface is neomorphic — see `--shadow-neu-*` tokens in
 * `styles/tokens.css`. The raised outer pillow, carved inset icon
 * well, and soft result-icon bumps all share the same vocabulary as
 * the inline search bars in `AppHeader`, `SearchFilter`, and the
 * `HistoryList` toolbar.
 *
 * Keyboard:
 *   - ⌘K / Ctrl+K toggles open/closed.
 *   - Esc closes the palette (and clears the query on the way out).
 *   - Enter on any visible result / shortcut runs its action.
 *
 * Motion is driven by `motion/react` (framer-motion's successor
 * package, already pinned). A short spring pop for the card and an
 * opacity crossfade for the backdrop. `useReducedMotion` short-
 * circuits to a no-op transition when the user asks for less motion.
 *
 * Stable data-slot hooks (relied on by e2e + unit tests):
 *   - data-slot="command-palette"            (overlay root)
 *   - data-slot="command-palette-input"      (search input)
 *   - data-slot="command-palette-shortcuts"  (tile grid)
 *   - data-slot="command-palette-results"    (results list)
 *   - data-slot="command-item"               (each clickable item; also
 *       carries data-value so tests can select nav-browse)
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  FlaskConicalIcon,
  InfoIcon,
  LayoutGridIcon,
  LaptopIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  Trash2Icon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useTheme } from "@/hooks/useTheme";
import { navigate } from "@/lib/router";

type IconNode = React.ReactNode;

interface SpotlightShortcut {
  id: string;
  /** Also used as the item's `data-value` hook. */
  value: string;
  label: string;
  icon: IconNode;
  action: () => void;
}

interface SpotlightCommand {
  id: string;
  /** Also used as the item's `data-value` hook. */
  value: string;
  label: string;
  description: string;
  icon: IconNode;
  action: () => void;
}

interface PaletteBodyArgs {
  query: string;
  normalisedQuery: string;
  filteredCommands: SpotlightCommand[];
  shortcuts: SpotlightShortcut[];
  reduceMotion: boolean;
  onRun: (action: () => void) => void;
}

/**
 * Render one of three mutually-exclusive palette bodies:
 *  - no query         → shortcut tile grid
 *  - query + matches  → animated results list
 *  - query + no match → "no commands match" empty state
 *
 * Pulled out of the render body so the top-level JSX reads as a flat
 * sequence rather than a two-level nested ternary.
 */
function renderPaletteBody({
  query,
  normalisedQuery,
  filteredCommands,
  shortcuts,
  reduceMotion,
  onRun,
}: PaletteBodyArgs) {
  if (!normalisedQuery) {
    return (
      <div data-slot="command-palette-shortcuts" className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-6">
        {shortcuts.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onRun(s.action)}
            data-slot="command-item"
            data-value={s.value}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl px-2 py-4",
              "bg-surface text-foreground transition-transform",
              "shadow-[var(--shadow-neu-raised)]",
              "hover:-translate-y-0.5 active:translate-y-0 active:shadow-[var(--shadow-neu-pressed)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-10 place-content-center rounded-full",
                "bg-surface text-primary shadow-[var(--shadow-neu-inset)]",
              )}
            >
              {s.icon}
            </span>
            <span className="text-xs font-medium">{s.label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (filteredCommands.length === 0) {
    return (
      <p
        data-slot="command-palette-empty"
        className="px-5 py-8 text-center text-sm text-foreground-muted"
      >
        No commands match “{query}”.
      </p>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Matching commands"
      data-slot="command-palette-results"
      className="max-h-[60vh] overflow-y-auto p-2 sm:max-h-[50vh]"
    >
      {filteredCommands.map((cmd, i) => (
        <motion.button
          key={cmd.id}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onRun(cmd.action)}
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={reduceMotion ? {} : { opacity: 1, y: 0 }}
          transition={{ delay: i * 0.02 }}
          data-slot="command-item"
          data-value={cmd.value}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none",
            "transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted",
            "focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span
            className={cn(
              "grid size-9 place-content-center rounded-xl",
              "bg-surface text-primary shadow-[var(--shadow-neu-soft)]",
            )}
          >
            {cmd.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-foreground">{cmd.label}</span>
            <span className="block truncate text-xs text-foreground-muted">{cmd.description}</span>
          </span>
          <ChevronRightIcon className="size-4 text-foreground-muted" aria-hidden="true" />
        </motion.button>
      ))}
    </div>
  );
}

interface CommandPaletteProps {
  /**
   * Mount open. Used by DeferredCommandPalette so the first ⌘K press
   * that lazy-loads this chunk also opens the palette — otherwise the
   * user would need to press ⌘K twice to see it (once to trigger the
   * chunk download, once to open). Default false preserves the
   * original behavior when mounted eagerly.
   */
  initiallyOpen?: boolean;
}

/**
 * Mount once at app root. Listens for Cmd/Ctrl+K globally; the palette
 * renders nothing when closed and a full-screen overlay when open.
 */
export function CommandPalette({ initiallyOpen = false }: CommandPaletteProps = {}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState("");
  const { setTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcut({ key: "k", meta: true }, (e) => {
    // Prevent the browser default (Firefox: focus URL bar, Safari:
    // reset search). Palette always wins.
    e.preventDefault();
    setOpen((v) => !v);
  });

  function close() {
    setOpen(false);
    setQuery("");
  }

  /** Run `action` and dismiss. Used by every tile + result row. */
  function run(action: () => void) {
    action();
    close();
  }

  // Auto-focus the input whenever the palette opens. `autoFocus` on the
  // <input> is too early when Motion is mid-enter, so we defer a tick.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  // Local Escape handler for the palette. Bound only while open so we
  // don't collide with other Esc listeners at rest.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const shortcuts: SpotlightShortcut[] = [
    {
      id: "sc-extract",
      value: "nav-extract",
      label: "Extract",
      icon: <FlaskConicalIcon className="size-5" aria-hidden="true" />,
      action: () => navigate("/"),
    },
    {
      id: "sc-browse",
      value: "nav-browse",
      label: "Browse",
      icon: <LayoutGridIcon className="size-5" aria-hidden="true" />,
      action: () => navigate("/browse"),
    },
    {
      id: "sc-history",
      value: "nav-history",
      label: "History",
      icon: <ClockIcon className="size-5" aria-hidden="true" />,
      action: () => navigate("/history"),
    },
    {
      id: "sc-about",
      value: "nav-about",
      label: "About",
      icon: <InfoIcon className="size-5" aria-hidden="true" />,
      action: () => navigate("/about"),
    },
  ];

  const commands: SpotlightCommand[] = [
    {
      id: "cmd-nav-extract",
      value: "nav-extract",
      label: "Go to Extract",
      description: "Upload and extract structures",
      icon: <FlaskConicalIcon className="size-4" aria-hidden="true" />,
      action: () => navigate("/"),
    },
    {
      id: "cmd-nav-browse",
      value: "nav-browse",
      label: "Go to Browse",
      description: "Browse extracted structures",
      icon: <LayoutGridIcon className="size-4" aria-hidden="true" />,
      action: () => navigate("/browse"),
    },
    {
      id: "cmd-nav-history",
      value: "nav-history",
      label: "Go to History",
      description: "View past extractions",
      icon: <ClockIcon className="size-4" aria-hidden="true" />,
      action: () => navigate("/history"),
    },
    {
      id: "cmd-nav-about",
      value: "nav-about",
      label: "Go to About",
      description: "Project info and credits",
      icon: <InfoIcon className="size-4" aria-hidden="true" />,
      action: () => navigate("/about"),
    },
    {
      id: "cmd-theme-light",
      value: "theme-light",
      label: "Light theme",
      description: "Switch to light mode",
      icon: <SunIcon className="size-4" aria-hidden="true" />,
      action: () => setTheme("light"),
    },
    {
      id: "cmd-theme-dark",
      value: "theme-dark",
      label: "Dark theme",
      description: "Switch to dark mode",
      icon: <MoonIcon className="size-4" aria-hidden="true" />,
      action: () => setTheme("dark"),
    },
    {
      id: "cmd-theme-system",
      value: "theme-system",
      label: "System theme",
      description: "Follow OS preference",
      icon: <LaptopIcon className="size-4" aria-hidden="true" />,
      action: () => setTheme("system"),
    },
    {
      id: "cmd-export-csv",
      value: "action-export-csv",
      label: "Export CSV",
      description: "Download the current table as CSV",
      icon: <DownloadIcon className="size-4" aria-hidden="true" />,
      action: () => navigate("/browse"),
    },
    {
      id: "cmd-clear-history",
      value: "action-clear-history",
      label: "Clear history",
      description: "Open history to delete extractions",
      icon: <Trash2Icon className="size-4" aria-hidden="true" />,
      action: () => navigate("/history"),
    },
  ];

  const normalisedQuery = query.trim().toLowerCase();
  const filteredCommands = normalisedQuery
    ? commands.filter((c) =>
        (c.label + " " + c.description).toLowerCase().includes(normalisedQuery),
      )
    : [];

  // Motion variants — short-circuited to an identity when the user
  // prefers reduced motion.
  const backdropAnim = reduceMotion
    ? { initial: false, animate: {}, exit: {} }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
  const popupAnim = reduceMotion
    ? { initial: false, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, y: -20, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -10, scale: 0.98 },
        transition: { type: "spring" as const, stiffness: 380, damping: 32 },
      };

  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          key="palette-overlay"
          {...backdropAnim}
          transition={{ duration: 0.15 }}
          role="presentation"
          data-slot="command-palette"
          onClick={close}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh]"
        >
          {/* Backdrop layer — soft dimming + blur behind the palette. */}
          <div
            aria-hidden="true"
            data-slot="command-palette-backdrop"
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
          />

          {/* Palette card */}
          <motion.div
            key="palette-card"
            {...popupAnim}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            data-slot="command-palette-card"
            className={cn(
              "relative z-[1] w-[min(92vw,40rem)] overflow-hidden rounded-3xl",
              "bg-surface text-foreground",
              "shadow-[var(--shadow-neu-raised)]",
              // Subtle inner highlight — makes the card feel lit from above.
              "before:pointer-events-none before:absolute before:inset-0",
              "before:rounded-[inherit] before:shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
              "dark:before:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
            )}
          >
            {/* Search input row */}
            <div className="relative flex h-16 items-center gap-3 border-b border-border/50 px-5">
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 place-content-center rounded-full bg-surface",
                  "shadow-[var(--shadow-neu-inset)] text-foreground-muted",
                )}
              >
                <SearchIcon className="size-4" />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands…"
                aria-label="Search commands"
                data-slot="command-palette-input"
                className={cn(
                  "flex-1 bg-transparent text-lg outline-none",
                  "placeholder:text-foreground-muted",
                )}
              />
            </div>

            {/* Three mutually-exclusive body states — resolved by {@link renderPaletteBody}
                to avoid a nested ternary in JSX. */}
            {renderPaletteBody({
              query,
              normalisedQuery,
              filteredCommands,
              shortcuts,
              reduceMotion: !!reduceMotion,
              onRun: run,
            })}

            {/* Bottom hint */}
            <div
              data-slot="command-palette-hint"
              className={cn(
                "flex items-center justify-between gap-2 border-t border-border/50",
                "px-5 py-2 text-xs text-foreground-muted",
              )}
            >
              <span>⌘K to toggle</span>
              <span>Esc to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
