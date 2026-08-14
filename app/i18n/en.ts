import type { DealTierLevel } from '../../src/domain/services/dealTier.js';
import type { SortKey } from '../../src/domain/entities/DealSort.js';
import type { DealTab } from '../../src/domain/interfaces/ListingRepository.js';
import type { ModelRequestStatus } from '../../src/domain/entities/ModelRequest.js';

export type SignInFeature = 'follow' | 'save' | 'aiEstimate' | 'aiReader';

export type ErrorKey =
  | 'not_signed_in'
  | 'invalid_credentials'
  | 'email_taken'
  | 'signup_failed'
  | 'account_created_login'
  | 'invalid_email'
  | 'password_too_short'
  | 'name_required'
  | 'no_password'
  | 'wrong_password'
  | 'email_in_use'
  | 'name_update_failed'
  | 'email_change_failed'
  | 'password_change_failed'
  | 'passwords_mismatch'
  | 'save_failed'
  | 'check_inputs'
  | 'evaluate_failed'
  | 'ai_unavailable'
  | 'ai_estimate_failed'
  | 'paste_more'
  | 'ai_reader_unavailable'
  | 'scan_link_failed'
  | 'paste_avito_biker'
  | 'read_listing_failed'
  | 'request_failed'
  | 'watchlist_save_failed'
  | 'invalid_phone'
  | 'whatsapp_update_failed'
  | 'generic';

export const en = {
  meta: {
    description: 'Good motorcycle deals from Moroccan marketplaces, scored and filtered.',
  },
  common: {
    loading: 'Loading…',
    menu: 'Menu',
    mainNav: 'Main',
    close: 'Close',
    prev: 'Prev',
    next: 'Next',
    pagination: 'Pagination',
    optional: 'Optional',
    any: 'Any',
    min: 'Min',
    max: 'Max',
    from: 'From',
    to: 'To',
    reset: 'Reset',
    remove: 'Remove',
    theme: 'Theme',
    darkMode: 'Dark mode',
    lightMode: 'Light mode',
    language: 'Language',
  },
  locale: {
    en: 'EN',
    fr: 'FR',
    switchToEn: 'Switch to English',
    switchToFr: 'Switch to French',
  },
  nav: {
    compare: 'Compare a bike',
    compareCar: 'Compare a car',
    motos: 'Motos',
    cars: 'Cars',
    notifications: 'Notifications',
    notificationsUnread: (n: number) => `Notifications (${n} unread)`,
    profile: 'Profile',
    requests: 'Model requests',
    admin: 'Admin',
    logOut: 'Log out',
    signIn: 'Sign in',
    createAccount: 'Create account',
    accountAria: (email: string) => `Account: ${email}`,
  },
  auth: {
    loginSubtitle: 'Sign in to see deals matched to your budget.',
    signupSubtitle: 'Create an account to track deals in your budget.',
    noAccount: 'No account?',
    createOne: 'Create one',
    haveAccount: 'Already have an account?',
    email: 'Email',
    password: 'Password',
    nameOptional: 'Name (optional)',
    signingIn: 'Signing in…',
    creatingAccount: 'Creating account…',
    orContinueWith: 'or continue with',
    welcome: 'Welcome',
    onboardingSubtitle:
      'Create your first search (budget and year, optional brands). You’ll get a feed and alerts for matching deals, and you can add more searches anytime on your profile.',
  },
  home: {
    bannerBefore: 'Browse every deal free. ',
    bannerStrong: 'Create an account',
    bannerAfter:
      ' to save searches, bookmark listings and get alerted the moment a matching deal appears.',
    footer:
      'Data scraped from Avito.ma and Biker.ma. Prices can contain seller typos — always verify on the listing before acting.',
    trackedModels: (n: number) =>
      `Listings across ${n} tracked model${n === 1 ? '' : 's'}, tagged by how good the deal is (price, mileage, year and city). Best deals first.`,
    scanNow: 'Scan now',
    comingSoon: 'Coming soon',
    scanSoonTitle: 'On-demand scans are coming soon for members.',
  },
  filters: {
    title: 'Filters',
    budget: 'Budget (MAD)',
    year: 'Model year',
    mileage: 'Mileage (km)',
    displacement: 'Displacement (cc)',
    fuel: 'Fuel',
    gearbox: 'Gearbox',
    allFuels: 'All fuels',
    allGearboxes: 'All gearboxes',
    essence: 'Petrol',
    diesel: 'Diesel',
    hybrid: 'Hybrid',
    electric: 'Electric',
    lpg: 'LPG',
    manual: 'Manual',
    automatic: 'Automatic',
    dealRating: 'Deal rating',
    brand: 'Brand',
    city: 'City',
    allRatings: 'All ratings',
    allBrands: 'All brands',
    allCities: 'All cities',
    rangeInvalid: 'Max must be greater than or equal to min.',
    listingCount: (n: number) => `${n} ${n === 1 ? 'listing' : 'listings'}`,
    noMatch: 'No deals match your filters.',
    checkFilters: 'Check your filter values.',
    searchPlaceholder: 'Search by brand, model or city…',
    searchAria: 'Search deals',
    sortBy: 'Sort by',
    nSelected: (n: number) => (n === 1 ? '1 selected' : `${n} selected`),
  },
  sort: {
    newest: 'Newest first',
    oldest: 'Oldest first',
    'price-asc': 'Price: low → high',
    'price-desc': 'Price: high → low',
    score: 'Best deal',
  } satisfies Record<SortKey, string>,
  tiers: {
    hot: 'Hot deal',
    great: 'Very good deal',
    good: 'Good deal',
    okay: 'Okay',
    bad: 'Bad deal',
    calibrating: 'Calibrating',
  } satisfies Record<DealTierLevel, string>,
  tabs: {
    daily: 'Daily deals',
    watched: 'Your searches',
    saved: 'Saved',
    all: 'All deals',
  } satisfies Record<DealTab, string>,
  tabsShort: {
    daily: 'Daily',
    watched: 'Searches',
    saved: 'Saved',
    all: 'All',
  } satisfies Record<DealTab, string>,
  empty: {
    daily: 'No new listings today yet — the daily scan runs each morning.',
    saved: 'No saved bikes yet — tap the bookmark on any card to save it here.',
    savedCar: 'No saved cars yet — tap the bookmark on any card to save it here.',
    watchedNoListings: 'No listings match your saved searches right now.',
    watchedLead: "You haven't saved a search yet — create one on your ",
    watchedTail: '.',
    all: 'No listings in your range yet. Widen your budget/year, or wait for the next daily scan.',
    noSearch: (q: string) => `No deals match “${q}”.`,
  },
  card: {
    noImage: 'No image',
    yearNa: 'Year n/a',
    kmNa: 'km n/a',
    match: (pct: number) => `match ${pct}%`,
    viewListing: 'View listing',
    backToFeed: 'Back to deals',
    posted: 'Posted',
    today: 'Today',
    yesterday: 'Yesterday',
    daysAgo: (n: number) => `${n} days ago`,
    follow: 'Follow this model',
    save: 'Save this bike',
    unwatch: (label: string) => `Unwatch ${label}`,
    watch: (label: string) => `Watch ${label}`,
    unsave: (label: string) => `Unsave ${label}`,
    saveNamed: (label: string) => `Save ${label}`,
    score: (n: number) => `Score ${n}/100`,
    firstOwner: 'First owner',
    ww: 'WW',
    customsCleared: 'Customs cleared',
    accidented: 'Accidented',
    neverAccidented: 'Never accidented',
    marketLoading: 'Loading market prices…',
    marketEmpty: 'Not enough ads for this model and year yet.',
    marketTitle: (model: string, year: string | number) => `${model} ${year}`,
    marketBand: (low: string, high: string, n: number) =>
      `${low}–${high} MAD (${n} ad${n === 1 ? '' : 's'})`,
    marketSamples: (n: number) => `${n} ad${n === 1 ? '' : 's'}`,
    marketThisListing: (price: string, median: string) =>
      `This listing: ${price} MAD · median ${median} MAD`,
    saveThisSearch: 'Save this search',
    searchSaved: 'Search saved.',
  },
  listing: {
    details: 'Details',
    market: 'Market prices',
    year: 'Year',
    mileage: 'Mileage',
    city: 'City',
    fuel: 'Fuel',
    gearbox: 'Gearbox',
    condition: 'Condition',
    viewOn: (source: string) => `View on ${source}`,
    belowMarket: 'Below typical prices',
    inMarket: 'In the typical range',
    aboveMarket: 'Above typical prices',
    photoOf: (i: number, n: number) => `${i} / ${n}`,
    prevPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
  },
  range: {
    title: 'Your range',
    hint: 'Used as the default window when you save a new search, and to filter All / Daily.',
    save: 'Save range',
    saving: 'Saving…',
    saved: 'Range saved — your deals are filtered to it.',
  },
  profile: {
    title: 'Profile',
    subtitle: 'Manage your account and saved searches.',
    loading: 'Loading profile…',
    account: 'Account',
    savedSearches: 'Saved searches',
    savedSearchesHint:
      'The dashboard’s “Your searches” tab and alerts use these filters. Bookmarks stay separate.',
    whatsapp: 'WhatsApp alerts',
    whatsappHint:
      'Free accounts get one WhatsApp a week when we find a matching deal. Coming soon.',
    phone: 'Phone (E.164)',
    whatsappOptIn: 'Send alerts on WhatsApp',
    saveWhatsApp: 'Save WhatsApp settings',
    whatsappUpdated: 'WhatsApp settings saved.',
    invalidPhone: 'Enter a phone number in E.164 format, like +212612345678.',
    searchName: 'Name',
    newSearch: 'New search',
    createSearch: 'Save search',
    deleteSearch: 'Delete',
    noSearches: 'No saved searches yet.',
    searchSummary: (budget: string, years: string) => `${budget} MAD · ${years}`,
  },
  account: {
    name: 'Name',
    displayName: 'Display name',
    saveName: 'Save name',
    email: 'Email',
    newEmail: 'New email',
    currentPassword: 'Current password',
    changeEmail: 'Change email',
    password: 'Password',
    newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    changePassword: 'Change password',
    oauthHint: (email: string) =>
      `You signed in with a social account, so your email (${email}) and password are managed by that provider.`,
    nameUpdated: 'Name updated.',
    emailUpdated: 'Email updated. Use it next time you sign in.',
    passwordChanged: 'Password changed.',
  },
  notifications: {
    title: 'Notifications',
    subtitleLead: 'Alerts for deals that match your saved searches. Manage searches on your ',
    subtitleTail: '.',
    empty:
      "No notifications yet — save a search and we'll alert you when a matching deal appears.",
    priceDrop: 'Price drop',
    priceDropFrom: (oldPrice: string) => `Price drop from ${oldPrice} MAD`,
    newDeal: 'New deal matching a saved search',
    justNow: 'just now',
    minutesAgo: (n: number) => `${n}m ago`,
    hoursAgo: (n: number) => `${n}h ago`,
    daysAgo: (n: number) => `${n}d ago`,
  },
  requests: {
    title: 'Request a model',
    subtitle:
      "Suggest a motorcycle model for the scanner to track. An admin reviews and approves it before it's added to the daily scan.",
    subtitleCar:
      "Suggest a car model for the scanner to track. An admin reviews and approves it before it's added to the daily scan.",
    yourRequests: (n: number) => `Your requests (${n})`,
    none: "You haven't requested any models yet.",
    brand: 'Brand',
    model: 'Model',
    note: 'Note (optional)',
    notePlaceholder: 'Why, or any detail for the admin',
    brandPlaceholder: 'e.g. Honda',
    modelPlaceholder: 'e.g. CB500X',
    submitting: 'Submitting…',
    submit: 'Request model',
    submitted: 'Request submitted — pending admin approval.',
    alreadyTracked: (brand: string, model: string) =>
      `${brand} ${model} is already tracked — you can follow it from your profile.`,
    inCatalog: (brand: string, model: string) =>
      `${brand} ${model} is already in our catalog — it will appear automatically once one comes up for sale.`,
    status: {
      pending: 'pending',
      approved: 'approved',
      rejected: 'rejected',
    } satisfies Record<ModelRequestStatus, string>,
  },
  compare: {
    title: 'Compare your bike',
    titleCar: 'Compare your car',
    subtitle:
      "Enter a bike's details to see how good the deal is — the same rating we put on every listing — and get a suggested fair price. No account needed; sign in to unlock AI estimates for un-tracked bikes and pasted ads.",
    subtitleCar:
      "Enter a car's details to see how good the deal is — the same rating we put on every listing — and get a suggested fair price. No account needed; sign in to unlock AI estimates for un-tracked cars and pasted ads.",
    brand: 'Brand',
    model: 'Model',
    year: 'Year',
    mileage: 'Mileage (km)',
    displacement: 'Displacement (cc)',
    price: 'Asking price (MAD)',
    city: 'City',
    selectBrand: 'Select a brand…',
    selectModel: 'Select a model…',
    pickBrandFirst: 'Pick a brand first',
    cityPlaceholder: 'Optional — e.g. Casablanca',
    pricePlaceholder: 'Optional — for a rating',
    pickBrandModel: 'Pick a brand and model to evaluate.',
    evaluating: 'Evaluating…',
    evaluate: 'Evaluate',
    pasteSummary: 'Or paste a listing link / ad text',
    pasteSummaryGuest: 'Or paste a listing link / ad text (sign in)',
    pasteHint:
      'Paste an Avito or Biker listing link to scan it live, or the ad text and let AI read it.',
    pastePlaceholder: 'Paste the ad text here…',
    scanning: 'Scanning…',
    parseEvaluate: 'Parse & evaluate',
    evaluation: 'Evaluation',
    notMatchedLead: (brand: string, model: string) =>
      `We couldn't match “${brand} ${model}” to a model we price. You can `,
    notMatchedLink: 'request it',
    notMatchedTail: ' — or get an AI estimate now.',
    calibratingHint:
      "We don't have enough recent listings for a fair price yet — get an AI estimate in the meantime.",
    readFromAd: 'Read from the ad',
    aiEstimate: 'AI estimate',
    confidence: (level: 'low' | 'medium' | 'high') => `confidence: ${level}`,
    disclaimer: 'Not from our market data — an AI estimate. Verify before acting.',
    estimateAi: 'Estimate with AI (beta)',
    estimating: 'Estimating…',
    notFound: 'Model not found in tracked criteria.',
    calibratingMatched: (brand: string, model: string) =>
      `Matched ${brand} ${model}, but no fair price range yet.`,
    enterPrice: 'Enter an asking price to get a deal rating.',
    fairPrice: 'Fair price:',
    fairPriceAi: 'Fair price (AI estimate):',
    somethingWrong: 'Something went wrong.',
    aiFailed: 'The AI estimate failed.',
    couldntRead: "Couldn't read that listing.",
  },
  signInModal: {
    follow: {
      title: 'Sign in to follow models',
      body: 'Create a free account to save searches, and get alerted the moment a matching deal appears.',
    },
    save: {
      title: 'Sign in to save bikes',
      body: 'Create a free account to save bikes, and get alerted the moment a matching deal appears.',
    },
    aiEstimate: {
      title: 'Sign in to get AI price estimates',
      body: 'Create a free account to get AI price estimates, and get alerted the moment a matching deal appears.',
    },
    aiReader: {
      title: 'Sign in to use the AI listing reader',
      body: 'Create a free account to use the AI listing reader, and get alerted the moment a matching deal appears.',
    },
  } satisfies Record<SignInFeature, { title: string; body: string }>,
  watchlist: {
    search: 'Search models to follow…',
    noModels: 'No models are being tracked yet. Check back after the admin adds some.',
    noMatch: 'No matching models.',
    saved: 'Saved.',
    saveContinue: 'Save & continue',
    saveChanges: 'Save changes',
    skip: 'Skip for now',
    saving: 'Saving…',
  },
  errors: {
    not_signed_in: 'Not signed in.',
    invalid_credentials: 'Invalid email or password.',
    email_taken: 'An account with this email already exists.',
    signup_failed: 'Sign-up failed.',
    account_created_login: 'Account created — please log in.',
    invalid_email: 'Enter a valid email address.',
    password_too_short: 'Password must be at least 8 characters.',
    name_required: 'Name is required.',
    no_password: 'This account has no password set.',
    wrong_password: 'Current password is incorrect.',
    email_in_use: 'That email is already in use.',
    name_update_failed: 'Failed to update name.',
    email_change_failed: 'Failed to change email.',
    password_change_failed: 'Failed to change password.',
    passwords_mismatch: 'New passwords do not match.',
    save_failed: 'Failed to save.',
    check_inputs: 'Please check your inputs and try again.',
    evaluate_failed: 'Something went wrong evaluating this bike. Try again.',
    ai_unavailable: "AI estimates aren't configured yet.",
    ai_estimate_failed: 'The AI estimate failed. Try again.',
    paste_more: 'Paste a bit more of the ad text.',
    ai_reader_unavailable: "The AI reader isn't configured yet.",
    scan_link_failed: 'Could not scan that listing link.',
    paste_avito_biker: 'Paste an Avito.ma or Biker.ma listing link.',
    read_listing_failed: "Couldn't read that listing. Try again.",
    request_failed: 'Failed to submit request.',
    watchlist_save_failed: 'Failed to save.',
    invalid_phone: 'Enter a phone number in E.164 format, like +212612345678.',
    whatsapp_update_failed: 'Failed to save WhatsApp settings.',
    generic: 'Something went wrong. Try again.',
  } satisfies Record<ErrorKey, string>,
};

export type Dictionary = typeof en;
