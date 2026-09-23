import { StarIcon } from "./Icons";

export function CityLevelStars({ level }: { level: number }) {
  return (
    <span
      className="city-level-stars"
      aria-label={
        level > 0
          ? `${level} of 3 city stars earned`
          : "No city stars earned yet"
      }
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
