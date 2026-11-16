/** Keep compact credits accessible without covering a newly loaded map. */
export function collapseMapAttribution(container: HTMLDivElement): void {
  const attribution = container.querySelector<HTMLDetailsElement>(".maplibregl-ctrl-attrib");
  if (!attribution) throw new Error("Cannot collapse map credits: the attribution control is missing.");
  attribution.classList.remove("maplibregl-compact-show");
  attribution.open = false;
}
