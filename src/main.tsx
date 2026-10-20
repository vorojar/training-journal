import { createRoot } from "react-dom/client";
import App from "./execution/app";
import CloudRoot, { cloudMode } from "./cloud/root";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  cloudMode() ? <CloudRoot /> : <App />,
);
