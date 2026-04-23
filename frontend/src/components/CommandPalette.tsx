/**
 * CommandPalette — ⌘K floating glass dialog (Phase 3 Task 14).
 *
 * A global command palette bound to Cmd/Ctrl+K. Composes the Base UI
 * `CommandDialog` primitive from `components/ui/command.tsx` (already
 * glass-skinned in Task 6) with:
 *
 * - a search input that filters commands live via `cmdk`
 * - a Navigation group covering the four top-level routes
 * - a Theme group that mirrors ThemeSwitch (light / dark / system)
 *
 * Keyboard: ↑/↓ navigates, Enter executes, Esc closes. Selecting any item
 * triggers its action and closes the palette. Running the global `k+meta`
 * shortcut a second time toggles it shut.
 *
 * The component renders no UI when `open=false` thanks to the underlying
 * Dialog's portal, so it's cheap to mount globally from `App.tsx`.
 */
import { useCallback, useState } from "react";
import {
  CompassIcon,
  FlaskConicalIcon,
  InfoIcon,
  LayersIcon,
  LaptopIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTheme } from "@/components/theme-provider";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { navigate } from "@/lib/router";

/**
 * Mount once at app root. Listens for Cmd/Ctrl+K globally; no trigger
 * button is rendered in the palette itself — callers can expose one
 * separately if desired.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useKeyboardShortcut({ key: "k", meta: true }, (e) => {
    // Prevent the browser's default Ctrl/Cmd+K (focus the URL bar in
    // Firefox, reset search in Safari) so the palette always wins.
    e.preventDefault();
    setOpen((v) => !v);
  });

  const close = useCallback(() => setOpen(false), []);

  /** Run `action` and dismiss the palette. Used by every CommandItem. */
  const run = useCallback(
    (action: () => void) => {
      action();
      close();
    },
    [close],
  );

  return (
    <CommandDialog
      data-slot="command-palette"
      open={open}
      onOpenChange={setOpen}
    >
      <CommandInput
        data-slot="command-palette-input"
        placeholder={"Search commands\u2026"}
      />
      <CommandList data-slot="command-palette-list">
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem
            value="nav-extract"
            onSelect={() => run(() => navigate("/"))}
          >
            <FlaskConicalIcon aria-hidden="true" />
            <span>Extract</span>
            <CommandShortcut>G E</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="nav-browse"
            onSelect={() => run(() => navigate("/browse"))}
          >
            <CompassIcon aria-hidden="true" />
            <span>Browse</span>
            <CommandShortcut>G B</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="nav-history"
            onSelect={() => run(() => navigate("/history"))}
          >
            <LayersIcon aria-hidden="true" />
            <span>History</span>
            <CommandShortcut>G H</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="nav-about"
            onSelect={() => run(() => navigate("/about"))}
          >
            <InfoIcon aria-hidden="true" />
            <span>About</span>
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem
            value="theme-light"
            data-checked={theme === "light"}
            onSelect={() => run(() => setTheme("light"))}
          >
            <SunIcon aria-hidden="true" />
            <span>Light</span>
          </CommandItem>
          <CommandItem
            value="theme-dark"
            data-checked={theme === "dark"}
            onSelect={() => run(() => setTheme("dark"))}
          >
            <MoonIcon aria-hidden="true" />
            <span>Dark</span>
          </CommandItem>
          <CommandItem
            value="theme-system"
            data-checked={theme === "system"}
            onSelect={() => run(() => setTheme("system"))}
          >
            <LaptopIcon aria-hidden="true" />
            <span>System</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
