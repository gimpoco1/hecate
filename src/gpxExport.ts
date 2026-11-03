import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { journeyToGpx } from "./gpx";
import type { Coordinate } from "./types";

/** Share on native platforms; download in browsers. Native files stay in the OS-managed cache. */
export async function exportJourneyGpx(points: Coordinate[]): Promise<"saved" | "cancelled"> {
  const xml = journeyToGpx(points);
  const filename = `hecate-journey-${new Date(points[0].recordedAt).toISOString().replace(/[:.]/g, "-")}.gpx`;
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: `gpx-${crypto.randomUUID()}/${filename}`, data: xml,
      directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true,
    });
    try {
      await Share.share({ files: [file.uri] });
    } catch (failure) {
      if (failure instanceof Error && failure.message === "Share canceled") return "cancelled";
      throw failure;
    }
    return "saved";
  }
  const url = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "saved";
}
