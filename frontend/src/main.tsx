import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Dismiss the boot splash (declared in index.html) once React has mounted.
// Wait one frame so the app has painted underneath before we fade the splash
// out — there's no minimum display time, so a fast load dismisses it at once.
requestAnimationFrame(() => {
  const splash = document.getElementById("boot-splash");
  if (!splash) return;
  splash.classList.add("is-hiding");
  splash.addEventListener("transitionend", () => splash.remove(), { once: true });
  // Fallback removal if no transition fires (reduced-motion, or already hidden).
  setTimeout(() => splash.remove(), 400);
});
