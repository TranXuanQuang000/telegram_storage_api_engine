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
        <span className="story-cover__led" aria-hidden="true" />
        <Image
          src={src}
          alt={`Bìa ${title}`}
          fill
          sizes="(max-width: 640px) 44vw, (max-width: 1120px) 24vw, 180px"
          priority={priority}
          unoptimized
          style={{ objectFit: "cover", objectPosition: "center top" }}
        />
      </span>
    );
  }

  return (
    <span className={`story-cover story-cover--fallback ${className}`} role="img" aria-label={`Bìa chữ của ${title}`}>
      <span className="story-cover__led" aria-hidden="true" />
      <span>{title}</span>
    </span>
  );
}
