import type { CSSProperties, ReactNode } from 'react';

/**
 * Marketplace CDNs (Avito especially) often 403 Next's `/_next/image` proxy.
 * Load listing thumbs directly in the browser so referrer/cookies match a
 * normal page request.
 */
export function ListingImage({
  src,
  alt,
  className,
  fill,
  width,
  height,
}: {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
}): ReactNode {
  const style: CSSProperties | undefined = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%' }
    : undefined;

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={style}
      {...(fill ? undefined : { width, height })}
    />
  );
}
