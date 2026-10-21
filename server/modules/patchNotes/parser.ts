import type {
  PatchNotesChange, PatchNotesEntry, PatchNotesGeneralChanges, PatchNotesMode, PatchNotesPictureSection,
} from './contract.js';
import {
  AFTER, ARMOR_ROW, ARMOR_TABLE, BEFORE, CHANGE_HEADING, COLLAPSE_HINT, COMMENT, COST_LINE, FOOTER, GENERAL_HEADING, NEW_COST,
  QUALIFIER, cleanArticleText, entryId, modeOf, numberChange, sameName, statedChanges,
} from './articleText.js';

export { cleanArticleText, splitStatedCard, statedChanges } from './articleText.js';

type ArticleSection = { level?: unknown; title?: unknown };

/** A card a name resolved to. `name` is set when the catalog spells it differently from the article. */
export type ResolvedPatchCard = {
  id: string;
  cardClass: string | null;
  cardType?: string | null;
  name?: string;
  renderUrl?: string | null;
};

/**
 * Card lookup by name within a mode; `null` when the name is unknown or
 * ambiguous. The subtitle tells a lesser trinket from the greater one of the same name.
 */
export type PatchCardResolver = (name: string, context?: { mode: PatchNotesMode; subtitle: string | null }) => ResolvedPatchCard | null;

type Statement = { name: string | null; qualifier: string | null; note: string | null; extra: PatchNotesChange[] };
type ParsedArticle = {
  entries: PatchNotesEntry[];
  missingBefore: number;
  pictureSections: PatchNotesPictureSection[];
  generalChanges: PatchNotesGeneralChanges[];
};

/** Line-by-line state of one article: the current mode, card name and open heading. */
class ArticleReader {
  readonly entries: PatchNotesEntry[] = [];
  readonly pictureSections: PatchNotesPictureSection[] = [];
  readonly generalChanges: PatchNotesGeneralChanges[] = [];
  missingBefore = 0;
  private readonly used = new Set<string>();
  private current: { mode: PatchNotesMode; label: string | null } = { mode: 'constructed', label: null };
  private costGroup: string | null = null;
  private name: string | null = null;
  private qualifier: string | null = null;
  private note: string[] = [];
  private extra: PatchNotesChange[] = [];
  private pendingBefore: string | null = null;
  private pending: Statement | null = null;
  private open: { title: string; mode: PatchNotesMode; empty: boolean } | null = null;
  private general: PatchNotesGeneralChanges | null = null;

  constructor(
    private readonly headings: Set<string>,
    private readonly modeHeadings: Set<string>,
    private readonly resolve: PatchCardResolver,
  ) {}

  private push(entryName: string, subtitle: string | null, changes: PatchNotesChange[], entryNote: string | null) {
    if (!changes.length) return;
    // A side mode keeps its name next to a hero-power owner: "Дуэли · Бранн Бронзобород".
    const effectiveSubtitle = [this.current.label, subtitle].filter(Boolean).join(' · ') || null;
    const card = this.resolve(entryName, { mode: this.current.mode, subtitle: effectiveSubtitle });
    const displayName = card?.name || entryName;
    this.entries.push({
      id: entryId(this.current.mode, effectiveSubtitle, entryName, this.used), name: displayName,
      sourceName: sameName(displayName, entryName) ? null : entryName, mode: this.current.mode,
      cardId: card?.id ?? null, cardClass: card?.cardClass ?? null, cardType: card?.cardType ?? null,
      renderUrl: card?.renderUrl ?? null, format: null, subtitle: effectiveSubtitle, changes, note: entryNote,
    });
    if (this.open) this.open.empty = false;
  }

  private statement(): Statement {
    return { name: this.name, qualifier: this.qualifier, note: this.note.join(' ') || null, extra: this.extra };
  }

  /** "Новая стоимость" stated without a following before/after pair is an entry of its own. */
  private flushExtra() {
    if (this.name && this.extra.length) {
      this.missingBefore += 1;
      this.push(this.name, this.qualifier, this.extra, this.note.join(' ') || null);
    }
    this.extra = [];
  }

  private closeHeading() {
    if (this.open?.empty) this.pictureSections.push({ mode: this.open.mode, title: this.open.title });
    this.open = null;
    this.general = null;
  }

  /** "До изменения", "После", developer comments, stated new costs and hero-power owners. */
  private readStatement(line: string): boolean {
    const before = line.match(BEFORE);
    if (before) {
      this.pendingBefore = before[1];
      this.pending = this.statement();
      this.extra = [];
      return true;
    }
    const after = line.match(AFTER);
    if (after) {
      const source = this.pending ?? this.statement();
      if (source.name) {
        if (this.pendingBefore === null) this.missingBefore += 1;
        const stated = statedChanges(this.pendingBefore, after[1]);
        const labels = new Set(stated.map(change => change.label));
        this.push(source.name, source.qualifier, [...source.extra.filter(change => !labels.has(change.label)), ...stated], source.note);
      }
      this.pendingBefore = null;
      this.pending = null;
      this.name = null;
      this.qualifier = null;
      this.note = [];
      this.extra = [];
      return true;
    }
    const comment = line.match(COMMENT);
    if (comment) {
      if (this.name) this.note.push(comment[1]);
      if (this.open) this.open.empty = false;
      return true;
    }
    const newCost = line.match(NEW_COST);
    if (newCost && this.name) {
      this.extra.push({ label: 'Стоимость', after: Number(newCost[1]), better: 'lower' });
      return true;
    }
    const qualified = line.match(QUALIFIER);
    if (qualified && this.name && !this.qualifier) {
      this.qualifier = qualified[1];
      return true;
    }
    return false;
  }

  /** The hero armor table and "Name: a → b" trinket cost lists. */
  private readBattlegroundsTable(line: string): boolean {
    if (this.current.mode !== 'battlegrounds') return false;
    const armor = line.match(ARMOR_TABLE);
    if (armor) {
      for (const row of armor[1].matchAll(ARMOR_ROW)) {
        this.push(cleanArticleText(row[1]), 'Броня героя', [
          ...numberChange('Броня, соло', Number(row[2]), Number(row[3]), 'higher'),
          ...numberChange('Броня, дуэты', Number(row[4]), Number(row[5]), 'higher'),
        ], null);
      }
      return true;
    }
    const cost = line.match(COST_LINE);
    if (cost && this.costGroup) {
      this.push(cost[1], this.costGroup, numberChange('Стоимость', Number(cost[2]), Number(cost[3]), 'lower'), null);
      return true;
    }
    return false;
  }

  /** Headings switch the mode and open a change section; anything else is content of the open one. */
  private readHeadingOrContent(line: string) {
    if (this.headings.has(line)) {
      if (this.modeHeadings.has(line)) this.current = modeOf(line, this.current);
      if (CHANGE_HEADING.test(line) || GENERAL_HEADING.test(line)) {
        this.closeHeading();
        this.open = { title: line, mode: this.current.mode, empty: true };
        if (GENERAL_HEADING.test(line)) {
          this.general = { mode: this.current.mode, lines: [] };
          this.generalChanges.push(this.general);
        }
      } else if (this.modeHeadings.has(line)) {
        this.closeHeading();
      } else if (this.open) {
        // A card-name heading (h4) under a change heading is that heading's content.
        this.open.empty = false;
      }
    } else if (this.open) {
      this.open.empty = false;
      // Sentences under "Общие изменения" are rule changes; card names have no final stop.
      if (this.general && /[.!]$/.test(line)) this.general.lines.push(line);
    }
  }

  /** Returns `false` at the article footer, after which nothing is read. */
  read(line: string): boolean {
    if (FOOTER.test(line)) return false;
    if (this.readStatement(line) || this.readBattlegroundsTable(line)) return true;
    this.flushExtra();
    this.readHeadingOrContent(line);
    const upper = line.toLocaleUpperCase('ru-RU');
    if (upper.includes('СТОИМОСТ') && upper.includes('АКСЕССУАР')) {
      this.costGroup = upper.includes('БОЛЬШ') ? 'Большой аксессуар' : upper.includes('МАЛ') ? 'Малый аксессуар' : 'Аксессуар';
    } else if (line === upper && /[А-ЯЁ]{4}/.test(line)) {
      this.costGroup = null;
    }
    this.name = line;
    this.qualifier = null;
    this.note = [];
    return true;
  }

  finish(): ParsedArticle {
    this.flushExtra();
    this.closeHeading();
    return {
      entries: this.entries, missingBefore: this.missingBefore, pictureSections: this.pictureSections,
      generalChanges: this.generalChanges.filter(group => group.lines.length > 0),
    };
  }
}

/**
 * Reads card changes from the article text. A change is either a card name
 * followed by "До изменения"/"После" lines, a "Name: a → b" cost line of a
 * Battlegrounds trinket list, or a row of the hero armor table. Lines that
 * fit none of these (introductions, card lists in images) are skipped, but a
 * change heading with nothing under it is reported in `pictureSections`, so
 * the page can say those changes exist only as pictures in the article.
 */
export function parsePatchArticle(contentText: string, sections: ArticleSection[], resolve: PatchCardResolver): ParsedArticle {
  const titles = sections.map(section => ({
    level: String(section?.level ?? ''), title: cleanArticleText(String(section?.title ?? '')),
  })).filter(section => section.title);
  const reader = new ArticleReader(
    new Set(titles.filter(section => /^h[2-4]$/.test(section.level)).map(section => section.title)),
    new Set(titles.filter(section => section.level === 'h2' || section.level === 'h3').map(section => section.title)),
    resolve,
  );
  for (const raw of contentText.split('\n')) {
    const line = cleanArticleText(raw);
    if (!line || COLLAPSE_HINT.test(line)) continue;
    if (!reader.read(line)) break;
  }
  return reader.finish();
}
