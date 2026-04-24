import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Register our custom font-size utilities (defined in src/styles/tokens.css)
 * with tailwind-merge. Without this, twMerge sees `text-micro` / `text-caption`
 * as unknown `text-*` utilities and lumps them into the same conflict group
 * as `text-<color>` — which silently strips color classes like
 * `text-secondary-foreground` when a custom size is also applied.
 * See regression: Badge variant="secondary" + className="text-micro" was
 * rendering with the default foreground color because twMerge removed
 * `text-secondary-foreground`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "micro",
            "caption",
            "body-sm",
            "body-md",
            "body-lg",
            "mono-sm",
            "display-lg",
            "display-xl",
            "display-2xl",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
