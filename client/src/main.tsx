import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const hideSplashScreen = () => {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.style.transition = 'opacity 0.2s ease-out';
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 200);
  }
};

// Render the React app
createRoot(document.getElementById("root")!).render(<App />);

// Hide splash screen once the app is ready
// Use both load event and immediate check for cases where load already fired
if (document.readyState === 'complete') {
  hideSplashScreen();
} else {
  window.addEventListener('load', hideSplashScreen, { once: true });
}
