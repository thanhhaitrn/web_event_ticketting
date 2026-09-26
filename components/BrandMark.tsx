// bars read as a sound wave; the tile takes --grad-brand, which each site sets to
// its own hero gradient, so the mark shifts palette with the site you are on
const BARS = [
  { x: 4.9, h: 10 },
  { x: 9.6, h: 17.5 },
  { x: 14.3, h: 5 },
  { x: 19, h: 14 },
];

export default function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 26 26" width={size} height={size}>
        {BARS.map((b) => (
          <rect key={b.x} x={b.x} y={13 - b.h / 2} width="2.4" height={b.h} rx="1.2" fill="#fff" />
        ))}
      </svg>
    </span>
  );
}
