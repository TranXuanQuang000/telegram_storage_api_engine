import Image from "next/image";

export function StoryCover({
  src,
  title,
  priority = false,
  className = "",
}: {
  src: string | null;
  title: string;
  priority?: boolean;
  className?: string;
}) {
  if (src) {
    return (
      <span className={`story-cover ${className}`}>
        <Image src={src} alt={`Bìa ${title}`} fill sizes="(max-width: 640px) 38vw, 180px" priority={priority} unoptimized />
      </span>
    );
  }

  return (
    <span className={`story-cover story-cover--fallback ${className}`} role="img" aria-label={`Bìa chữ của ${title}`}>
      <span>{title}</span>
    </span>
  );
}

