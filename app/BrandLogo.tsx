/**
 * Light/dark brand marks. Both assets are stacked and swapped with CSS so the
 * correct version shows for `data-theme` and `prefers-color-scheme` without a
 * flash or a client component.
 */
const ASSETS = {
  mark: {
    onLight: '/brand/mark-on-light.png',
    onDark: '/brand/mark-on-dark.png',
    width: 300,
    height: 102,
  },
  wordmark: {
    onLight: '/brand/wordmark-on-light.png',
    onDark: '/brand/wordmark-on-dark.png',
    width: 300,
    height: 36,
  },
} as const;

export function BrandLogo({
  variant,
  alt = 'Moto Deal Scout',
}: {
  variant: keyof typeof ASSETS;
  alt?: string;
}) {
  const asset = ASSETS[variant];
  return (
    <span className={`brand-logo brand-logo-${variant}`}>
      <img
        src={asset.onLight}
        alt={alt}
        className="brand-logo-on-light"
        width={asset.width}
        height={asset.height}
      />
      <img
        src={asset.onDark}
        alt=""
        className="brand-logo-on-dark"
        width={asset.width}
        height={asset.height}
        aria-hidden="true"
      />
    </span>
  );
}
