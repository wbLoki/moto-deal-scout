import { describe, expect, it } from 'vitest';
import { parseMoteurSearchCards } from '../../src/infrastructure/sources/moteur/parseMoteurSearchCards.js';

const HTML = `
<div id="ads-container">
  <div class="card ads-index-card">
    <a href="https://moteur.ma/fr/voiture/achat-voiture-occasion/detail-annonce/633646/audi-a5.html" class="link"></a>
    <img src="https://content.avito.ma/classifieds/images/10153570089?t=moteur_feed" class="ads-index-media-img" />
    <h5 class="ads-index-title">للبيع موديل 2024</h5>
    <div class="item-card9-desc">
      <a href="javascript:void(0);"><i class="fa fa-map-marker"></i> Agadir</a>
      <span class="timeago" data-time="2026-08-13 23:00:21">il y a 2 minutes</span>
    </div>
    <h4 class="ad-price-grid">Appeler pour le prix</h4>
    <div class="ad-meta">
      <span class="text-muted"><i class="fa fa-calendar"></i> 2024</span>
      <span class="text-muted"><i class="fa fa-cog"></i> Automatique</span>
      <span class="text-muted"><i class="fa fa-tachometer"></i> Diesel</span>
      <span class="text-muted"><i class="fa fa-road"></i> 48,600 km</span>
    </div>
  </div>
  <div class="card ads-index-card">
    <a href="/fr/voiture/achat-voiture-occasion/detail-annonce/633645/renault-clio.html" class="link"></a>
    <img src="https://content.avito.ma/classifieds/images/clio.jpg" class="ads-index-media-img" />
    <h5 class="ads-index-title">Renault Clio Diesel Manuelle 2017 à Sidi Bouzid</h5>
    <div class="item-card9-desc">
      <a href="javascript:void(0);"><i class="fa fa-map-marker"></i> Autre</a>
      <span class="timeago" data-time="2026-08-13 23:00:21">il y a 2 minutes</span>
    </div>
    <h4 class="ad-price-grid">117,000 MAD</h4>
    <p class="ad-desc">CLIO 4 TRÈS BONNE QUALITÉS</p>
    <div class="ad-meta">
      <span class="text-muted"><i class="fa fa-calendar"></i> 2017</span>
      <span class="text-muted"><i class="fa fa-cog"></i> Manuelle</span>
      <span class="text-muted"><i class="fa fa-tachometer"></i> Diesel</span>
      <span class="text-muted"><i class="fa fa-road"></i> 130,000 km</span>
    </div>
  </div>
</div>
`;

describe('parseMoteurSearchCards', () => {
  it('skips call-for-price cards and maps priced cards with fuel/gearbox', () => {
    const listings = parseMoteurSearchCards(HTML, new Date('2026-08-13T00:00:00Z'));
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      sourceId: 'moteur',
      externalId: '633645',
      title: 'Renault Clio Diesel Manuelle 2017 à Sidi Bouzid',
      priceMAD: 117000,
      year: 2017,
      mileageKm: 130000,
      vehicleType: 'car',
      fuelType: 'diesel',
      gearbox: 'manual',
      city: 'Autre',
      description: 'CLIO 4 TRÈS BONNE QUALITÉS',
    });
    expect(listings[0]?.url).toBe(
      'https://moteur.ma/fr/voiture/achat-voiture-occasion/detail-annonce/633645/renault-clio.html',
    );
    expect(listings[0]?.imageUrl).toContain('clio.jpg');
    expect(listings[0]?.postedAt?.toISOString()).toBe('2026-08-13T23:00:21.000Z');
  });

  it('uses the URL slug when the seller title has no Latin letters', () => {
    const html = `
      <div class="card ads-index-card">
        <a href="https://moteur.ma/fr/voiture/achat-voiture-occasion/detail-annonce/1/audi-a5.html"></a>
        <h5 class="ads-index-title">للبيع موديل 2024</h5>
        <h4 class="ad-price-grid">90,000 MAD</h4>
        <div class="ad-meta">
          <span><i class="fa fa-calendar"></i> 2024</span>
        </div>
      </div>
    `;
    const listings = parseMoteurSearchCards(html);
    expect(listings[0]).toMatchObject({
      externalId: '1',
      title: 'audi a5',
      priceMAD: 90000,
      year: 2024,
    });
  });

  it('uses the URL slug when the seller title is a generic slogan', () => {
    const html = `
      <div class="card ads-index-card">
        <a href="https://moteur.ma/fr/voiture/achat-voiture-occasion/detail-annonce/2/gwm-haval-h6.html"></a>
        <h5 class="ads-index-title">vend de voiture</h5>
        <h4 class="ad-price-grid">260,000 MAD</h4>
      </div>
    `;
    expect(parseMoteurSearchCards(html)[0]?.title).toBe('gwm haval h6');
  });
});
