import { createRoot } from "react-dom/client";
import "./lib/monaco";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
