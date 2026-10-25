import type { GbapSession } from '../hooks/useGbapSession';
import { CompaniesSurface as CustomerCompaniesDatabase } from './LegacyCompaniesSurface';
import './company-table-resize.css';

type CompaniesSurfaceProps = { session: GbapSession; search?: string };

/**
 * Customer Company owns one canonical working surface.
 *
 * The full-maintenance customer database is the page entry point because it already
 * owns search/filtering, sortable/reorderable columns, saved views, company detail,
 * editing and deletion. Development progress is shown inside the company detail
 * drawer instead of rendering a second competing customer table above it.
 */
export function CompaniesSurface({ session, search = '' }: CompaniesSurfaceProps) {
  return <CustomerCompaniesDatabase session={session} search={search} />;
}
