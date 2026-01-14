import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const hideSplashScreen = () => {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.style.transition = 'opacity 0.3s ease-out';
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 300);
  }
};

createRoot(document.getElementById("root")!).render(<App />);

window.addEventListener('load', () => {
  setTimeout(hideSplashScreen, 100);
});
