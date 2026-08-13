import { describe, expect, it } from 'vitest';
import {
  adFromNextData,
  listingFromAvitoAd,
  listingFromAvitoHtml,
} from '../../src/infrastructure/sources/avito/fetchAvitoListing.js';
import { listingImageFromHtml, parseAvitoSearchCards } from '../../src/infrastructure/sources/avito/parseAvitoSearchCards.js';
import { listingFromBikerDetail } from '../../src/infrastructure/sources/biker/fetchBikerListing.js';

describe('listingFromAvitoAd', () => {
  const url = 'https://www.avito.ma/fr/bourgogne/motos/BMW_GT_400_58415881.htm';

  it('maps price, year, mileage, cc and city from __NEXT_DATA__ ad JSON', () => {
    const listing = listingFromAvitoAd(
      {
        listId: '58415881',
        subject: 'BMW GT 400',
        description: 'À vendre',
        price: { value: 108000 },
        location: { city: { name: 'Casablanca' } },
        params: {
          primary: [],
          secondary: [
            { key: 'regdate', label: 'Année-Modèle', value: '2025' },
            { key: 'mileage_exact', label: 'Kilométrage', value: 7825 },
            { key: 'cylinder_size', label: 'Cylindrée (cm3)', value: 400 },
          ],
        },
        defaultImage: 'https://content.avito.ma/classifieds/images/101?t=images',
      },
      url,
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(listing).toMatchObject({
      sourceId: 'avito',
      externalId: '58415881',
      title: 'BMW GT 400',
      priceMAD: 108000,
      year: 2025,
      mileageKm: 7825,
      displacementCc: 400,
      city: 'Casablanca',
      imageUrl: 'https://content.avito.ma/classifieds/images/101?t=images',
    });
  });

  it('prefers classifieds photos over a seller imageUrl on the ad', () => {
    const listing = listingFromAvitoAd(
      {
        listId: '58415881',
        subject: 'BMW GT 400',
        price: { value: 108000 },
        imageUrl: 'https://content.avito.ma/users/42.jpg',
        images: ['https://content.avito.ma/classifieds/images/99?t=images'],
      },
      url,
    );
    expect(listing.imageUrl).toBe('https://content.avito.ma/classifieds/images/99?t=images');
  });

  it('rejects ads with no asking price', () => {
    expect(() =>
      listingFromAvitoAd({ listId: '1', subject: 'x', price: null }, url),
    ).toThrow(/no asking price/i);
  });

  it('reads the ad from page props', () => {
    const ad = adFromNextData({
      props: {
        pageProps: {
          componentProps: {
            adInfo: { ad: { listId: '9', subject: 'MT-07', price: { value: 70000 } } },
          },
        },
      },
    });
    expect(ad.listId).toBe('9');
  });

  it('listingFromAvitoHtml extracts __NEXT_DATA__ from rendered HTML', () => {
    const next = {
      props: {
        pageProps: {
          componentProps: {
            adInfo: {
              ad: {
                listId: '42',
                subject: 'MT-07',
                price: { value: 65000 },
                location: { city: { name: 'Rabat' } },
              },
            },
          },
        },
      },
    };
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></html>`;
    const listing = listingFromAvitoHtml(html, url);
    expect(listing).toMatchObject({
      externalId: '42',
      title: 'MT-07',
      priceMAD: 65000,
      city: 'Rabat',
    });
  });
});

describe('parseAvitoSearchCards', () => {
  it('maps card markup into listings', () => {
    const html = `
      <a data-testid="ad-card-v2-1" href="/fr/casa/motos/Yamaha_MT-07_111.htm">
        <h3>Yamaha MT-07</h3>
        <span title="Année-Modèle">2022</span>
        <span title="Kilométrage">12 000</span>
        <img src="https://example.com/a.jpg" />
        <span>65 000</span><span>DH</span>
        <span>Casablanca</span>
        <span>il y a 2 jours</span>
      </a>
    `;
    const listings = parseAvitoSearchCards(html, new Date('2026-01-01T00:00:00Z'));
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      sourceId: 'avito',
      externalId: '111',
      title: 'Yamaha MT-07',
      priceMAD: 65000,
      year: 2022,
      mileageKm: 12000,
      city: 'Casablanca',
      imageUrl: 'https://example.com/a.jpg',
    });
  });

  it('skips seller avatar imgs and uses the listing photo', () => {
    const html = `
      <a data-testid="ad-card-v2-1" href="/fr/casa/motos/Yamaha_MT-07_111.htm">
        <h3>Yamaha MT-07</h3>
        <img src="/phoenix-assets/imgs/profile/avatar.svg" />
        <img data-src="https://content.avito.ma/classifieds/images/99?t=images" src="" />
        <span>65 000</span><span>DH</span>
        <span>Casablanca</span>
        <span>il y a 2 jours</span>
      </a>
    `;
    const listings = parseAvitoSearchCards(html, new Date('2026-01-01T00:00:00Z'));
    expect(listings[0]?.imageUrl).toBe('https://content.avito.ma/classifieds/images/99?t=images');
  });

  it('prefers the listing photo when a seller portrait comes first in the card', () => {
    const html = `
      <a data-testid="ad-card-v2-1" href="/fr/casa/motos/Yamaha_MT-07_111.htm">
        <h3>Yamaha MT-07</h3>
        <img src="https://content.avito.ma/users/42.jpg" alt="seller" />
        <img src="https://content.avito.ma/classifieds/images/99?t=images" />
        <span>65 000</span><span>DH</span>
        <span>Casablanca</span>
        <span>il y a 2 jours</span>
      </a>
    `;
    const listings = parseAvitoSearchCards(html, new Date('2026-01-01T00:00:00Z'));
    expect(listings[0]?.imageUrl).toBe('https://content.avito.ma/classifieds/images/99?t=images');
  });

  it('uses __NEXT_DATA__ listing photo instead of a seller portrait on the card', () => {
    const next = {
      props: {
        pageProps: {
          ads: [
            {
              listId: '111',
              imageUrl: 'https://content.avito.ma/users/42.jpg',
              defaultImage: 'https://content.avito.ma/classifieds/images/101?t=images',
            },
          ],
        },
      },
    };
    const html = `
      <a data-testid="ad-card-v2-1" href="/fr/casa/motos/Yamaha_MT-07_111.htm">
        <h3>Yamaha MT-07</h3>
        <img src="https://content.avito.ma/users/42.jpg" />
        <span>65 000</span><span>DH</span>
        <span>Casablanca</span>
        <span>il y a 2 jours</span>
      </a>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script>
    `;
    const listings = parseAvitoSearchCards(html, new Date('2026-01-01T00:00:00Z'));
    expect(listings[0]?.imageUrl).toBe('https://content.avito.ma/classifieds/images/101?t=images');
  });

  it('fills imageUrl from __NEXT_DATA__ when the card only has an avatar', () => {
    const next = {
      props: {
        pageProps: {
          ads: [
            {
              listId: '111',
              defaultImage: 'https://content.avito.ma/classifieds/images/101?t=images',
            },
          ],
        },
      },
    };
    const html = `
      <a data-testid="ad-card-v2-1" href="/fr/casa/motos/Yamaha_MT-07_111.htm">
        <h3>Yamaha MT-07</h3>
        <img src="/phoenix-assets/imgs/profile/avatar.svg" />
        <span>65 000</span><span>DH</span>
        <span>Casablanca</span>
        <span>il y a 2 jours</span>
      </a>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script>
    `;
    const listings = parseAvitoSearchCards(html, new Date('2026-01-01T00:00:00Z'));
    expect(listings[0]?.imageUrl).toBe('https://content.avito.ma/classifieds/images/101?t=images');
  });
});

describe('listingImageFromHtml', () => {
  it('reads og:image on a listing page', () => {
    const html = `
      <meta property="og:image" content="https://content.avito.ma/classifieds/images/55?t=images" />
      <img src="/phoenix-assets/imgs/profile/avatar.svg" />
    `;
    expect(listingImageFromHtml(html)).toBe(
      'https://content.avito.ma/classifieds/images/55?t=images',
    );
  });
});

describe('listingFromBikerDetail', () => {
  it('maps marque/model/prix from the detail API', () => {
    const { listing, brand, model } = listingFromBikerDetail(
      {
        idannonce_moto: 4157,
        marque: 'BENELLI',
        model: 'TRK 502',
        titre: 'BENELLI TRK 502',
        prix: 72000,
        anneemodele: 2023,
        kilometrage: 12300,
        cylindre: '500',
        ville: 'CASABLANCA',
      },
      'https://www.biker.ma/annonce/detail-moto/BENELLI-TRK-502/4157',
    );

    expect(brand).toBe('BENELLI');
    expect(model).toBe('TRK 502');
    expect(listing).toMatchObject({
      sourceId: 'biker',
      externalId: '4157',
      priceMAD: 72000,
      year: 2023,
      mileageKm: 12300,
      displacementCc: 500,
      city: 'CASABLANCA',
    });
  });
});
