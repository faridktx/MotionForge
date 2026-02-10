import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { registerOfflineServiceWorker } from "./lib/offline/offlinePack.js";
import "./styles.css";

void registerOfflineServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
