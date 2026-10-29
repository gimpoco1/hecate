import { t } from "./i18n";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/** Native exports remain in the OS-managed cache so receiving apps can finish reading them. */
export async function saveReliefImage(blob: Blob, cityName: string): Promise<"saved" | "cancelled"> {
  const filename = `${cityName.replace(/[^\p{L}\p{N}-]+/gu, "-")}-hecate.png`;
  if (Capacitor.isNativePlatform()) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(t("Could not read the rendered PNG for saving.")));
      reader.onload = () => {
        if (typeof reader.result !== "string") reject(new Error(t("The rendered PNG is not a valid image.")));
        else resolve(reader.result.split(",")[1]);
      };
      reader.readAsDataURL(blob);
    });
    const path = `relief-${crypto.randomUUID()}/${filename}`;
    const file = await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ files: [file.uri] });
    } catch (failure) {
      if (failure instanceof Error && failure.message === "Share canceled") return "cancelled";
      throw failure;
    }
    return "saved";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "saved";
}
