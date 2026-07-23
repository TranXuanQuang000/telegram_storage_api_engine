import Link from "next/link";

export function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link className={`brand-mark${inverted ? " brand-mark--inverted" : ""}`} href="/" aria-label="Mực — Trang chủ">
      <span className="brand-mark__stamp" aria-hidden="true">M</span>
      <span className="brand-mark__word">Mực</span>
    </Link>
  );
}

