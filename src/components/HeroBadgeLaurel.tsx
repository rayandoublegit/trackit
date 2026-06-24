type HeroBadgeLaurelProps = {
  side: "left" | "right";
};

export function HeroBadgeLaurel({ side }: HeroBadgeLaurelProps) {
  const src =
    side === "left"
      ? "/images/hero-laurel-left.svg"
      : "/images/hero-laurel-right.svg";

  return (
    <img
      src={src}
      alt=""
      className="badge-laurel"
      aria-hidden="true"
      draggable={false}
    />
  );
}
