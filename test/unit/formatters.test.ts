import { describe, it, expect } from 'vitest';
import { formatJournals, formatIssue } from '../../src/utils/formatters.js';
import type { Journal, RedmineIssue } from '../../src/client/types.js';

function journal(id: number, notes?: string, created_on = `2026-07-1${id}T00:00:00Z`): Journal {
  return {
    id,
    user: { id: 1, name: `User${id}` },
    notes,
    created_on,
    private_notes: false,
  };
}

const notes = (out: string) => [...out.matchAll(/^- .*?\): (.*)$/gm)].map((m) => m[1]);

describe('formatJournals', () => {
  it('returns empty string when journals not fetched (undefined)', () => {
    expect(formatJournals(undefined)).toBe('');
  });

  it('returns "Comments: none" when fetched but no note-bearing journals', () => {
    expect(formatJournals([journal(1), journal(2, '   ')])).toBe('\nComments: none');
  });

  it('shows only the count when includeJournals is false', () => {
    const js = [journal(1, 'a'), journal(2, 'b'), journal(3, 'c')];
    expect(formatJournals(js, { includeJournals: false })).toBe(
      '\nComments: 3 total (not shown — pass include_journals=true)'
    );
  });

  it('counts only note-bearing journals', () => {
    const js = [journal(1, 'has note'), journal(2), journal(3, 'also note')];
    const out = formatJournals(js, { includeJournals: false });
    expect(out).toContain('2 total');
  });

  it('renders newest first by default and respects limit', () => {
    const js = [journal(1, 'oldest'), journal(2, 'middle'), journal(3, 'newest')];
    const out = formatJournals(js, { includeJournals: true, journalsLimit: 2 });
    expect(out).toContain('Comments: 3 total (showing 0-1, newest first)');
    expect(out).toContain('newest');
    expect(out).toContain('middle');
    expect(out).not.toContain('oldest');
  });

  it('honors ascending order', () => {
    const js = [journal(1, 'oldest'), journal(2, 'newest')];
    const out = formatJournals(js, { includeJournals: true, journalsOrder: 'asc', journalsLimit: 1 });
    expect(out).toContain('oldest first');
    expect(out).toContain('oldest');
    expect(out).not.toContain('newest');
  });

  it('applies offset window', () => {
    const js = [journal(1, 'c0-old'), journal(2, 'c1'), journal(3, 'c2-new')];
    const out = formatJournals(js, { includeJournals: true, journalsOffset: 1, journalsLimit: 1 });
    // desc order: [c2-new, c1, c0-old]; offset 1 => c1
    expect(out).toContain('showing 1-1');
    expect(out).toContain('c1');
    expect(out).not.toContain('c2-new');
    expect(out).not.toContain('c0-old');
  });

  it('reports out-of-range offset', () => {
    const js = [journal(1, 'a'), journal(2, 'b')];
    const out = formatJournals(js, { includeJournals: true, journalsOffset: 5 });
    expect(out).toBe('\nComments: 2 total (offset 5 exceeds range)');
  });

  it('truncates long notes and appends a drill-down marker', () => {
    const long = 'x'.repeat(50);
    const js = [journal(1, long)];
    const out = formatJournals(js, { includeJournals: true, journalNotesMaxChars: 10 });
    expect(out).toContain('xxxxxxxxxx …(+40 chars truncated');
    expect(out).toContain('journals_offset=0 journals_limit=1 journals_order=desc journal_notes_max_chars=0 for full');
  });

  it('does not truncate when cap is 0 (unlimited escape hatch)', () => {
    const long = 'y'.repeat(50);
    const js = [journal(1, long)];
    const out = formatJournals(js, { includeJournals: true, journalNotesMaxChars: 0 });
    expect(out).toContain(long);
    expect(out).not.toContain('truncated');
  });

  it('marker reflects journals_order for asc drill-down', () => {
    const long = 'z'.repeat(50);
    const js = [journal(1, long), journal(2, 'short')];
    const out = formatJournals(js, {
      includeJournals: true,
      journalsOrder: 'asc',
      journalNotesMaxChars: 10,
    });
    // asc order keeps [j1(long), j2(short)]; offset 0 is the long note → truncated
    expect(out).toContain('journals_order=asc');
    expect(out).toContain('journals_offset=0');
  });

  // Redmine reverses journals when the API user's comments_sorting preference is desc.
  describe.each([
    ['oldest first', [journal(1, 'old'), journal(2, 'mid'), journal(3, 'new')]],
    ['newest first', [journal(3, 'new'), journal(2, 'mid'), journal(1, 'old')]],
  ])('when the API returns journals %s', (_, js) => {
    it.each([
      ['asc', 0, ['old', 'mid', 'new']],
      ['asc', 1, ['mid', 'new']],
      ['desc', 0, ['new', 'mid', 'old']],
      ['desc', 1, ['mid', 'old']],
    ] as const)('journals_order=%s offset=%i', (journalsOrder, journalsOffset, expected) => {
      const out = formatJournals(js, { includeJournals: true, journalsOrder, journalsOffset });
      expect(notes(out)).toEqual(expected);
    });
  });

  it('breaks created_on ties by id', () => {
    const at = '2026-07-11T00:00:00Z';
    const js = [journal(6, 'second', at), journal(5, 'first', at)];
    const out = formatJournals(js, { includeJournals: true, journalsOrder: 'asc' });
    expect(notes(out)).toEqual(['first', 'second']);
  });

  it('compares created_on as instants, not strings', () => {
    const js = [
      journal(1, 'later', '2026-07-11T00:30:00Z'),
      journal(2, 'earlier', '2026-07-11T09:00:00+09:00'),
    ];
    const out = formatJournals(js, { includeJournals: true, journalsOrder: 'asc' });
    expect(notes(out)).toEqual(['earlier', 'later']);
  });
});

describe('formatIssue with options', () => {
  const baseIssue = {
    id: 1,
    subject: 'S',
    project: { name: 'P' },
    status: { name: 'New' },
    priority: { name: 'Normal' },
    author: { name: 'A' },
    done_ratio: 0,
    description: 'D'.repeat(1000),
  } as unknown as RedmineIssue;

  it('returns full description when no cap given', () => {
    const out = formatIssue(baseIssue);
    expect(out).toContain('D'.repeat(1000));
  });

  it('truncates description when descriptionMaxChars set', () => {
    const out = formatIssue(baseIssue, { descriptionMaxChars: 100 });
    expect(out).not.toContain('D'.repeat(200));
    expect(out).toContain('...');
  });

  it('omits any Comments line when issue has no journals field', () => {
    const out = formatIssue(baseIssue);
    expect(out).not.toContain('Comments');
  });

  it('lists attachments with the id needed to download them', () => {
    const out = formatIssue({
      ...baseIssue,
      attachments: [
        { id: 41201, filename: 'shot.png', filesize: 91972, content_type: 'image/png' },
        { id: 41202, filename: 'notes', filesize: 10 },
      ],
    } as unknown as RedmineIssue);

    expect(out).toContain('Attachments (2):');
    expect(out).toContain('- #41201 shot.png (91972 bytes, image/png)');
    expect(out).toContain('- #41202 notes (10 bytes)');
  });

  it('omits the Attachments section when there are none', () => {
    expect(formatIssue(baseIssue)).not.toContain('Attachments');
    expect(formatIssue({ ...baseIssue, attachments: [] })).not.toContain('Attachments');
  });
});
