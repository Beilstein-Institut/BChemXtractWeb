/**
 * ThemeSwitch — 3-way theme selector (Light / Dark / System).
 *
 * Replaces the deleted ChemistryThemeSwitch (Phase 3, Task 7). Renders an
 * icon-only trigger that opens a glass DropdownMenu with the three modes
 * as checkbox items. The current selection is persisted to
 * `localStorage.bchemxtract-theme` by the shared ThemeProvider.
 */
import { Sun, Moon, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";

const LABELS = {
  light: "Light",
  dark: "Dark",
  system: "System",
} as const;

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            data-slot="theme-switch"
            variant="ghost"
            size="icon"
            aria-label={`Theme: ${LABELS[theme]}`}
          />
        }
      >
        <Icon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={theme === "light"}
          onCheckedChange={() => setTheme("light")}
        >
          Light
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={theme === "dark"}
          onCheckedChange={() => setTheme("dark")}
        >
          Dark
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={theme === "system"}
          onCheckedChange={() => setTheme("system")}
        >
          System
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
