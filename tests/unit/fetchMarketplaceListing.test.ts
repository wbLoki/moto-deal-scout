import { describe, expect, it } from 'vitest';
import {
  adFromNextData,
  listingFromAvitoAd,
} from '../../src/infrastructure/sources/avito/fetchAvitoListing.js';
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
    });
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
