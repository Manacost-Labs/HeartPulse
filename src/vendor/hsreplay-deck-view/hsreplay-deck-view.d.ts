export as namespace HSReplayDeckView;
export = HSReplayDeckView;

declare const HSReplayDeckView: HSReplayDeckView.Api;

declare namespace HSReplayDeckView {
  type Target = string | Element;
  type DbfIds = string | Array<number | string>;
  type Rarity = "FREE" | "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "free" | "common" | "rare" | "epic" | "legendary" | string;
  type Connector = "plus" | "arrow" | "then" | "to" | string;
  type MulliganStatus = "keep" | "situational" | "replace" | "оставлять" | "ситуативно" | "менять" | string;
  type MatchupStatus = "favored" | "even" | "unfavored" | string;
  type MetaKind = "tier-1" | "tier-2" | "counter" | "meme" | "rising" | "falling" | string;
  type ArtScale = number | string;

  interface ArtFocus {
    x?: number | string;
    y?: number | string;
  }

  interface ArtCrop {
    position?: string;
    artPosition?: string;
    backgroundPosition?: string;
    objectPosition?: string;
    imagePosition?: string;
    focus?: ArtFocus;
    focusX?: number | string;
    focusY?: number | string;
    artFocusX?: number | string;
    artFocusY?: number | string;
    backgroundFocusX?: number | string;
    backgroundFocusY?: number | string;
    scale?: ArtScale;
    artScale?: ArtScale;
    zoom?: ArtScale;
    artSize?: string;
    backgroundSize?: string;
  }

  interface Options {
    locale?: string;
    dataUrl?: string;
    artBaseUrl?: string;
    artFormat?: string;
    className?: string;
    group?: boolean;
    sort?: boolean;
    clear?: boolean;
    showLegendaryAsStar?: boolean;
    showSingleCountBox?: boolean;
    imageFallbackFormat?: string;
    iconBadgeSingleCount?: boolean;
    archetypeArtBaseUrl?: string;
    archetypeArtFormat?: string;
    archetypeIconBaseUrl?: string;
    archetypeIconFormat?: string;
    stonePortraitArtBaseUrl?: string;
    stonePortraitArtFormat?: string;
    stonePortraitFrameImage?: string;
    synergyArtBaseUrl?: string;
    synergyArtFormat?: string;
    mulliganArtBaseUrl?: string;
    mulliganArtFormat?: string;
    matchupArtBaseUrl?: string;
    matchupArtFormat?: string;
    matchupIconBaseUrl?: string;
    matchupIconFormat?: string;
    costCurveMaxCost?: number;
    costCurveOverLabel?: string;
    costCurveShowTotal?: boolean;
  }

  interface Card extends ArtCrop {
    id?: string;
    cardId?: string;
    card_id?: string;
    dbfId?: number | string | null;
    dbf_id?: number | string | null;
    name?: string;
    title?: string;
    cardName?: string;
    cost?: number | string;
    rarity?: Rarity;
    elite?: boolean;
    count?: number | string;
    image?: string;
    imageUrl?: string;
    art?: string;
    src?: string;
    url?: string;
    href?: string;
    predicted?: boolean;
    [key: string]: unknown;
  }

  interface NormalizedCard {
    id: string;
    dbfId: number | string | null;
    name: string;
    cost: number;
    rarity: string;
    elite: boolean;
    count: number;
    image: string;
    artPosition: string;
    artSize: string;
    predicted: boolean;
  }

  interface Artwork extends ArtCrop {
    id?: string;
    cardId?: string;
    card_id?: string;
    image?: string;
    imageUrl?: string;
    art?: string;
    url?: string;
    src?: string;
    opacity?: number | string;
    [key: string]: unknown;
  }

  type ArtworkInput = string | Artwork;

  interface ArchetypeStat {
    label?: string;
    value?: string | number;
  }

  interface Archetype {
    name?: string;
    title?: string;
    icon?: ArtworkInput;
    iconUrl?: string;
    classIcon?: ArtworkInput;
    classIconUrl?: string;
    image?: string;
    iconCardId?: string;
    iconAlt?: string;
    className?: string;
    arts?: ArtworkInput[];
    artworks?: ArtworkInput[];
    cards?: ArtworkInput[];
    cardIds?: string[] | string;
    backgroundCards?: ArtworkInput[];
    stats?: ArchetypeStat[];
    url?: string;
    href?: string;
    label?: string;
    ariaLabel?: string;
    [key: string]: unknown;
  }

  interface StonePortrait extends Card {
    portrait?: string;
  }

  interface SynergyItem extends Card {
    label?: string;
    caption?: string;
    role?: string;
    note?: string;
  }

  interface SynergyResult {
    label?: string;
    value?: string;
    text?: string;
  }

  interface Synergy {
    title?: string;
    name?: string;
    subtitle?: string;
    description?: string;
    text?: string;
    eyebrow?: string;
    type?: string;
    category?: string;
    badge?: string;
    tag?: string;
    connector?: Connector;
    operator?: Connector;
    joiner?: Connector;
    items?: Array<SynergyItem | string | number>;
    cards?: Array<SynergyItem | string | number>;
    minions?: Array<SynergyItem | string | number>;
    cardIds?: string[] | string;
    sequence?: Array<SynergyItem | string | number>;
    result?: string | SynergyResult;
    outcome?: string | SynergyResult;
    payoff?: string | SynergyResult;
    url?: string;
    href?: string;
    label?: string;
    ariaLabel?: string;
    [key: string]: unknown;
  }

  interface MulliganItem extends Card {
    keepRate?: number | string;
    keep?: number | string;
    kept?: number | string;
    keepPercent?: number | string;
    keep_percentage?: number | string;
    winrate?: number | string;
    winRate?: number | string;
    wr?: number | string;
    status?: MulliganStatus;
    decision?: MulliganStatus;
    state?: MulliganStatus;
    label?: string;
    note?: string;
    reason?: string;
    caption?: string;
  }

  interface Mulligan {
    title?: string;
    name?: string;
    subtitle?: string;
    description?: string;
    text?: string;
    badge?: string;
    tag?: string;
    context?: string;
    cards?: Array<MulliganItem | string | number>;
    items?: Array<MulliganItem | string | number>;
    hand?: Array<MulliganItem | string | number>;
    cardIds?: string[] | string;
    url?: string;
    href?: string;
    label?: string;
    ariaLabel?: string;
    [key: string]: unknown;
  }

  interface MatchupCard extends Card {}

  interface Matchup {
    name?: string;
    title?: string;
    opponent?: string;
    className?: string;
    class?: string;
    hero?: string;
    icon?: ArtworkInput;
    iconUrl?: string;
    classIcon?: ArtworkInput;
    classIconUrl?: string;
    image?: string;
    winrate?: number | string;
    winRate?: number | string;
    wr?: number | string;
    value?: number | string;
    games?: number | string;
    matches?: number | string;
    count?: number | string;
    status?: MatchupStatus;
    result?: MatchupStatus;
    state?: MatchupStatus;
    note?: string;
    description?: string;
    cards?: Array<MatchupCard | string | number>;
    keyCards?: Array<MatchupCard | string | number>;
    items?: Array<MatchupCard | string | number>;
    cardIds?: string[] | string;
    url?: string;
    href?: string;
    label?: string;
    ariaLabel?: string;
    [key: string]: unknown;
  }

  interface MetaBadge {
    kind?: MetaKind;
    type?: MetaKind;
    status?: MetaKind;
    label?: string;
    badge?: string;
    tier?: string;
    title?: string;
    name?: string;
    value?: string | number;
    score?: string | number;
    winrate?: string | number;
    delta?: string | number;
    trend?: string | number;
    change?: string | number;
    description?: string;
    text?: string;
    note?: string;
    url?: string;
    href?: string;
    ariaLabel?: string;
    [key: string]: unknown;
  }

  interface CostBucket {
    cost?: number | string;
    mana?: number | string;
    label?: string;
    count?: number | string;
    value?: number | string;
    cards?: number | string;
  }

  type CostBuckets = Array<number | CostBucket> | Record<string, number | string>;

  interface CostCurve {
    title?: string;
    name?: string;
    subtitle?: string;
    description?: string;
    text?: string;
    badge?: string;
    tag?: string;
    cards?: Card[];
    deck?: Card[];
    items?: Card[];
    buckets?: CostBuckets;
    curve?: CostBuckets;
    costs?: CostBuckets;
    maxCost?: number;
    maxMana?: number;
    overLabel?: string;
    maxLabel?: string;
    url?: string;
    href?: string;
    label?: string;
    ariaLabel?: string;
    [key: string]: unknown;
  }

  type SynergyInput = Synergy | Array<SynergyItem | string | number> | string;
  type MulliganInput = Mulligan | Array<MulliganItem | string | number>;
  type CostCurveInput = CostCurve | Card[];

  interface Api {
    createArchetypeCard(archetype: Archetype | string, options?: Options): HTMLElement;
    createCostCurve(curve: CostCurveInput, options?: Options): HTMLElement;
    createIcon(card: Card, options?: Options): HTMLElement;
    createMatchupMiniCard(card: MatchupCard | string | number, options?: Options): HTMLElement;
    createMatchupRow(matchup: Matchup, options?: Options): HTMLElement;
    createMetaBadge(badge: MetaBadge, options?: Options): HTMLElement;
    createMulliganCard(mulligan: MulliganInput, options?: Options): HTMLElement;
    createMulliganItem(card: MulliganItem | string | number, options?: Options): HTMLElement;
    createSquareIcon(card: Card, options?: Options): HTMLElement;
    createStonePortrait(portrait: StonePortrait | string, options?: Options): HTMLElement;
    createSynergyCard(synergy: SynergyInput, options?: Options): HTMLElement;
    createSynergyItem(item: SynergyItem | string | number, options?: Options): HTMLElement;
    createTile(card: Card, options?: Options): HTMLElement;
    cardsFromDbfIds(dbfIds: DbfIds, options?: Options): Promise<Card[]>;
    groupCards(cards: Card[]): NormalizedCard[];
    loadCardDatabase(options?: Options): Promise<Map<number, Card>>;
    normalizeCard(card: Card): NormalizedCard;
    normalizeCostCurve(curve: CostCurveInput, options?: Options): CostCurve;
    normalizeMatchup(matchup: Matchup): Matchup;
    normalizeMatchupCard(card: MatchupCard | string | number): MatchupCard;
    normalizeMetaBadge(badge: MetaBadge): MetaBadge;
    normalizeMulligan(mulligan: MulliganInput): Mulligan;
    normalizeMulliganItem(item: MulliganItem | string | number): MulliganItem;
    normalizeStonePortrait(portrait: StonePortrait | string): StonePortrait;
    normalizeSynergy(synergy: SynergyInput): Synergy;
    normalizeSynergyItem(item: SynergyItem | string | number): SynergyItem;
    parseDeckCards(input: DbfIds): number[];
    renderCostCurve(target: Target, curve: CostCurveInput, options?: Options): HTMLElement;
    renderCostCurveFromDbfIds(target: Target, dbfIds: DbfIds, options?: Options): Promise<HTMLElement>;
    renderCostCurves(target: Target, curves: CostCurveInput[], options?: Options): HTMLElement;
    renderDeck(target: Target, cards: Card[], options?: Options): HTMLElement;
    renderDeckFromDbfIds(target: Target, dbfIds: DbfIds, options?: Options): Promise<HTMLElement>;
    renderArchetypes(target: Target, archetypes: Array<Archetype | string>, options?: Options): HTMLElement;
    renderIcons(target: Target, cards: Card[], options?: Options): HTMLElement;
    renderIconsFromDbfIds(target: Target, dbfIds: DbfIds, options?: Options): Promise<HTMLElement>;
    renderMatchups(target: Target, matchups: Matchup[], options?: Options): HTMLElement;
    renderMetaBadges(target: Target, badges: MetaBadge[], options?: Options): HTMLElement;
    renderMulligans(target: Target, mulligans: MulliganInput[], options?: Options): HTMLElement;
    renderSquareIcons(target: Target, cards: Card[], options?: Options): HTMLElement;
    renderSquareIconsFromDbfIds(target: Target, dbfIds: DbfIds, options?: Options): Promise<HTMLElement>;
    renderStonePortraits(target: Target, portraits: Array<StonePortrait | string>, options?: Options): HTMLElement;
    renderStonePortraitsFromDbfIds(target: Target, dbfIds: DbfIds, options?: Options): Promise<HTMLElement>;
    renderSynergies(target: Target, synergies: SynergyInput[], options?: Options): HTMLElement;
    sortCards(cards: Card[]): NormalizedCard[];
  }
}

declare global {
  interface Window {
    HSReplayDeckView: HSReplayDeckView.Api;
  }
}
