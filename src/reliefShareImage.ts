import { formatNumber, t } from "./i18n";

export type ReliefShareDetails = { cityName: string; discoveredKm: number };

/** Keeps the preview's framing and replaces its controls with a city-specific distance card. */
export function createReliefShareImage(
  artwork: HTMLCanvasElement,
  background: HTMLCanvasElement,
  details: ReliefShareDetails,
  scale: number,
): Promise<Blob> {
  const output = document.createElement("canvas");
  output.width = artwork.width;
  output.height = artwork.height;
  const context = output.getContext("2d");
  if (!context) throw new Error(t("The 3D image could not be encoded as PNG. Close and reopen your 3D map."));
  const width = output.width;
  const height = output.height;
  const font = getComputedStyle(artwork).fontFamily;
  const backgroundScale = Math.max(width / background.width, height / background.height);
  const backgroundWidth = background.width * backgroundScale;
  const backgroundHeight = background.height * backgroundScale;
  context.drawImage(background, (width - backgroundWidth) / 2, (height - backgroundHeight) / 2, backgroundWidth, backgroundHeight);
  context.fillStyle = "rgb(15 24 20 / .10)";
  context.fillRect(0, 0, width, height);
  context.save();
  context.shadowColor = "rgb(0 0 0 / .30)";
  context.shadowBlur = 12 * scale;
  context.shadowOffsetY = 16 * scale;
  context.drawImage(artwork, 0, 0);
  context.restore();
  const topGradient = context.createLinearGradient(0, 0, 0, 145 * scale);
  topGradient.addColorStop(0, "rgb(15 24 20 / .35)");
  topGradient.addColorStop(1, "transparent");
  context.fillStyle = topGradient;
  context.fillRect(0, 0, width, 145 * scale);
  const footerTop = height - 205 * scale;
  const footerGradient = context.createLinearGradient(0, footerTop, 0, height);
  footerGradient.addColorStop(0, "transparent");
  footerGradient.addColorStop(1, "rgb(15 24 20 / .65)");
  context.fillStyle = footerGradient;
  context.fillRect(0, footerTop, width, height - footerTop);
  context.fillStyle = "#f0eee6";
  context.shadowColor = "rgb(0 0 0 / .45)";
  context.shadowBlur = 12 * scale;
  context.font = `500 ${10 * scale}px ${font}`;
  let letterX = 24 * scale;
  for (const letter of t("Your city, as artwork").toUpperCase()) {
    context.fillText(letter, letterX, 36 * scale);
    letterX += context.measureText(letter).width + 1.8 * scale;
  }
  let titleSize = Math.max(28, Math.min(44, width / scale * .05)) * scale;
  context.font = `500 ${titleSize}px ${font}`;
  titleSize *= Math.min(1, (width - 48 * scale) / context.measureText(details.cityName).width);
  context.font = `500 ${titleSize}px ${font}`;
  context.fillText(details.cityName, 24 * scale, 80 * scale);
  context.textAlign = "center";
  context.font = `500 ${36 * scale}px ${font}`;
  const distance = details.discoveredKm < 1
    ? `${formatNumber(details.discoveredKm * 1000, 0)} m`
    : `${formatNumber(details.discoveredKm, 1)} km`;
  context.fillText(distance, width / 2, height - 112 * scale);
  context.font = `400 ${13 * scale}px ${font}`;
  context.fillText(t("New ground in {{city}}", { city: details.cityName }), width / 2, height - 84 * scale, width - 48 * scale);
  context.font = `500 ${11 * scale}px ${font}`;
  context.fillText("Hecate", width / 2, height - 48 * scale);
  context.fillStyle = "#d4dcd2";
  context.font = `400 ${9 * scale}px ${font}`;
  context.fillText("© OpenStreetMap · OpenMapTiles", width / 2, height - 22 * scale, width - 40 * scale);
  return new Promise<Blob>((resolve, reject) => {
    output.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error(t("The 3D image could not be encoded as PNG. Close and reopen your 3D map.")));
    }, "image/png");
  });
}
