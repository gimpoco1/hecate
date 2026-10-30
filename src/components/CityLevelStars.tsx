import { t, useAppTranslation } from "../i18n";
import { StarIcon } from "./Icons";

export function CityLevelStars({
  level,
  decorative = false,
}: {
  level: number;
  decorative?: boolean;
}) {
  useAppTranslation();
  return (
    <span
      className="city-level-stars"
      aria-hidden={decorative || undefined}
      aria-label={decorative
        ? undefined
        : level > 0
          ? t("{{value0}} of 3 city stars earned", { value0: level })
          : t("No city stars earned yet")}
    >
      {[1, 2, 3].map((star) => (
        <span
          key={star}
          className={star <= level ? "city-level-stars__earned" : ""}
        >
          <StarIcon size={10} strokeWidth={1.8} />
        </span>
      ))}
    </span>
  );
}
