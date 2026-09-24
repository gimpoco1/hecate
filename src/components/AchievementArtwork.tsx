import { useEffect, useState } from "react";
import { HecateMark } from "./Icons";

export function AchievementArtwork({
  image,
  title,
  size = 64,
}: {
  image: string;
  title: string;
  size?: number;
}) {
  const [missing, setMissing] = useState(false);

  useEffect(() => setMissing(false), [image]);

  return (
    <span
      className={`achievement-artwork${missing ? " achievement-artwork--fallback" : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      title={title}
    >
      {missing ? (
        <HecateMark size={Math.round(size * 0.52)} />
      ) : (
        <img
          src={image}
          alt=""
          width={size}
          height={size}
          onError={() => setMissing(true)}
        />
      )}
    </span>
  );
}
