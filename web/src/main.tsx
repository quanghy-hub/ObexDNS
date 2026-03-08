import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n/config";
import App from "./App.tsx";
import { OverlaysProvider } from "@blueprintjs/core";
import { BrowserRouter } from "react-router-dom";

createRoot(document.getElementById("root")!).render(
  <OverlaysProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </OverlaysProvider>
);
