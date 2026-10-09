import { motion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect } from "react";
import "./Counter.css";

export type CounterPlace = number | ".";

type CounterNumberProps = {
  motionValue: MotionValue<number>;
  number: number;
  height: number;
};

function CounterNumber({
  motionValue,
  number,
  height,
}: CounterNumberProps) {
  const y = useTransform(motionValue, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    return (offset > 5 ? offset - 10 : offset) * height;
  });

  return (
    <motion.span className="counter-number" style={{ y }}>
      {number}
    </motion.span>
  );
}

function normalizeNearInteger(value: number): number {
  const nearest = Math.round(value);
  const tolerance = 1e-9 * Math.max(1, Math.abs(value));
  return Math.abs(value - nearest) < tolerance ? nearest : value;
}

function valueAtPlace(value: number, place: number): number {
  return Math.floor(normalizeNearInteger(value / place));
}

type CounterDigitProps = {
  place: CounterPlace;
  value: number;
  height: number;
};

function CounterDigit({ place, value, height }: CounterDigitProps) {
  if (place === ".") {
    return (
      <span className="counter-digit counter-digit--decimal" style={{ height }}>
        .
      </span>
    );
  }

  const placeValue = valueAtPlace(value, place);
  const animatedValue = useSpring(placeValue);

  useEffect(() => {
    animatedValue.set(placeValue);
  }, [animatedValue, placeValue]);

  return (
    <span className="counter-digit" style={{ height }}>
      {Array.from({ length: 10 }, (_, number) => (
        <CounterNumber
          key={number}
          motionValue={animatedValue}
          number={number}
          height={height}
        />
      ))}
    </span>
  );
}

type CounterProps = {
  value: number;
  places: CounterPlace[];
  fontSize: number;
  gap: number;
};

export function Counter({ value, places, fontSize, gap }: CounterProps) {
  return (
    <span className="counter-container" aria-hidden="true">
      <span className="counter-counter" style={{ fontSize, gap }}>
        {places.map((place) => (
          <CounterDigit
            key={place}
            place={place}
            value={value}
            height={fontSize}
          />
        ))}
      </span>
    </span>
  );
}
