import { formatNumber } from "./i18n";

export function formatDiscoveryPercentage(percentage: number): string {
  if (percentage > 0 && percentage < 0.1) return `<${formatNumber(0.1, 1)}%`;
  if (percentage < 10) return `${formatNumber(percentage, 1)}%`;
  return `${Math.round(percentage)}%`;
}
