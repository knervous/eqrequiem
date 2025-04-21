import qrg from "./qrg.webp";
import qeynos2 from "./qeynos2.webp";
import qeynos from "./qeynos.webp";

export const getSplashImage = () => {
  const splash = Math.floor(Math.random() * 3);
  let splashImage = qrg;
  if (splash === 0) {
    splashImage = qeynos;
  } else if (splash === 1) {
    splashImage = qeynos2;
  } else {
    splashImage = qrg;
  }
  return splashImage;
};
