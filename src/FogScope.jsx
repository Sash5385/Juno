import { ThemeContext } from "./theme.js";
import { FOG_STYLE } from "./uiStyles";

// Накладає стиль «Туман» на дочірні компоненти (вікна, що відкриваються поверх календаря).
export default function FogScope({ children }) {
  return <ThemeContext.Provider value={FOG_STYLE.theme}>{children}</ThemeContext.Provider>;
}
