import React from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
// The claude.ai build renders the same app as web/ (Next.js); without a Kakao key it uses the drawn map.
import App from "../../web/src/App.jsx";
import "../../web/app/globals.css";

// Follow the viewer's theme: an explicit data-theme wins, otherwise the OS setting.
function applyTheme() {
  const root = document.documentElement;
  const dt = root.getAttribute("data-theme");
  const dark = dt ? dt === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}
applyTheme();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HeroUIProvider locale="ko-KR">
      <App />
    </HeroUIProvider>
  </React.StrictMode>
);
