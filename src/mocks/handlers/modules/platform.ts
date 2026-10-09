/** Data Integration, Governance and Roadmap module handlers (shared platform generator). */
import { round } from '@/lib/stats';
import { formatNumber } from '@/lib/format';
import { BUDGET, BUDGET_TOTAL, FEEDS, PHASES, PROVIDERS, ROLES, SUB_PHASES, budgetSpent, phaseProgress, platformSummary, programmeMonth, qualityDims, subPhaseProgress } from '../../generators/platform';
import { categories, col, kpi, table, type ModuleHandlers } from '../build';

export const roadmap: ModuleHandlers = {
  summary: () => {
    const m = programmeMonth();
    const p = [1, 2, 3].map((x) => phaseProgress(x as 1 | 2 | 3));
    const overall = round((p[0].actual * 9 + p[1].actual * 15 + p[2].actual * 12) / 36, 0);
    const spent = budgetSpent().reduce((s, b) => s + b.spent, 0);
    const done = SUB_PHASES.filter((s) => subPhaseProgress(s).status === 'Completed').length;
    return [
      kpi('progress', 'programmeProgress', overall, { label: 'Overall Progress', sublabel: `Month ${Math.min(m, 36)} of 36`, delta: overall - round(((Math.min(m, 36)) / 36) * 100, 0), deltaUnit: ' pp', deltaLabel: 'vs plan' }),
      kpi('phase', 'programmeProgress', null, { label: 'Current Phase', sublabel: PHASES.find((ph) => m >= ph.from && m <= ph.to)?.months ?? 'Complete', text: PHASES.find((ph) => m >= ph.from && m <= ph.to)?.name.split(':')[1].trim() ?? 'Complete' }),
      kpi('milestones', 'programmeProgress', done, { label: 'Sub-phases Completed', sublabel: `of ${SUB_PHASES.length}`, unit: '' }),
      kpi('budget', 'budgetSpent', spent, { label: 'Budget Spent', sublabel: `of R ${formatNumber(BUDGET_TOTAL, 0)} million`, deltaLabel: `${round((spent / BUDGET_TOTAL) * 100, 0)}% of total` }),
      kpi('feeds', 'recordsIngested', platformSummary().active, { label: 'Data Feeds Live', sublabel: `of ${FEEDS.length} planned`, unit: '' }),
      kpi('risks', 'damAlerts', 6, { label: 'Open Programme Risks', sublabel: '2 high, 4 medium', goodDirection: 'down' }),
    ];
  },
  table: {
    phases: () =>
      table(
        'phases',
        [col.text('id', 'Phase'), col.text('name', 'Name'), col.text('months', 'Months'), col.bar('actual', 'Progress', '%'), col.num('planned', 'Planned', '%'), col.cls('status', 'Status', 'progress'), col.text('deliverables', 'Key deliverables')],
        SUB_PHASES.map((s) => {
          const pr = subPhaseProgress(s);
          return { id: s.id, phase: s.phase, name: s.name, months: `M${s.from}–M${s.to}`, actual: pr.actual, planned: pr.planned, status: pr.status, deliverables: s.deliverables.join(' · ') };
        }),
      ),
    'spec-phases': () =>
      table(
        'spec-phases',
        [col.text('name', 'Phase'), col.text('months', 'Months'), col.bar('actual', 'Progress', '%'), col.text('focus', 'Scope (spec §24)')],
        PHASES.map((p) => ({ name: p.name, months: p.months, actual: phaseProgress(p.id).actual, focus: p.focus })),
      ),
    resources: () =>
      table(
        'resources',
        [col.text('role', 'Role'), col.text('required', 'Required (FTE)'), col.num('allocated', 'Allocated'), col.num('gap', 'Gap')],
        ROLES.map((r) => {
          const min = Number(r.required.split('–')[0]);
          return { ...r, gap: Math.max(0, min - r.allocated) };
        }),
      ),
  },
  breakdown: {
    budget: () => categories('budget', 'R million', BUDGET.map((b) => b.name.split(' (')[0]), [{ key: 'planned', name: 'Budget', values: BUDGET.map((b) => b.planned) }], { colors: BUDGET.map((b) => b.color), center: { value: `R${formatNumber(BUDGET_TOTAL, 0)}M`, label: 'Total' } }),
    'budget-actual': () => {
      const spent = budgetSpent();
      return categories('budget-actual', 'R million', BUDGET.map((b) => b.name.split(' (')[0]), [
        { key: 'planned', name: 'Planned (36 months)', values: BUDGET.map((b) => b.planned), color: '#94A3B8' },
        { key: 'spent', name: 'Spent to date', values: spent.map((s) => s.spent), color: '#1565C0' },
      ]);
    },
  },
};

export const governance: ModuleHandlers = {
  table: {
    quality: () => {
      const q = qualityDims();
      const s = platformSummary();
      return table('quality', [col.text('dimension', 'Dimension'), col.num('value', 'Score', '%')], [
        { dimension: 'Completeness', value: q.completeness },
        { dimension: 'Accuracy', value: q.accuracy },
        { dimension: 'Timeliness', value: q.timeliness },
        { dimension: 'Consistency', value: q.consistency },
        { dimension: 'Validity', value: q.validity },
        { dimension: 'Active data feeds', value: round((s.active / s.feeds) * 100, 0) },
        { dimension: 'Metadata complete', value: s.metadata },
        { dimension: 'Open issues', value: s.openIssues },
      ]);
    },
    providers: () =>
      table(
        'providers',
        [col.text('name', 'Provider'), col.text('type', 'Type'), col.num('feeds', 'Feeds'), col.num('online', 'Online'), col.text('protocol', 'Protocol'), col.text('format', 'Format'), col.text('cadence', 'Cadence')],
        PROVIDERS.map((p) => ({ name: p.short, type: p.type, feeds: p.feeds, online: FEEDS.filter((f) => f.provider === p.id && f.status === 'Online').length, protocol: p.protocol, format: p.format, cadence: p.cadence })),
      ),
  },
};
