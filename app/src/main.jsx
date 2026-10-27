import React from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
import App from "./App.jsx";
import "./index.css";

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
