import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { getDeptAttachees, getDeptCheckins } from '../../api/attachee';
import { formatEAT, formatTimeEAT } from '../../lib/datetime';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { Table, THead, TH, TBody, TR, TD } from '../../components/ui/Table';

export default function AttacheesPage() {
  const [attachees, setAttachees] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDeptAttachees(), getDeptCheckins()])
      .then(([a, c]) => {
        setAttachees(a.data.attachees);
        setCheckins(c.data.checkins);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  if (attachees.length === 0 && checkins.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No attachees yet"
        description="Ask an administrator to create attachee accounts for your department."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">Attachees</h2>
        <p className="mt-1 text-sm text-subtle">{attachees.length} in your department</p>
      </div>

      {attachees.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachees.map((a) => (
            <span key={a.id} className="rounded-full bg-accentSoft px-3 py-1 text-sm text-brand-600">
              {a.name}
            </span>
          ))}
        </div>
      )}

      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-ink">Recent Check-ins</h3>
        {checkins.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No check-ins yet" description="Attachee check-ins will appear here." />
        ) : (
          <Table>
            <THead>
              <TH>Attachee</TH>
              <TH>Date</TH>
              <TH>Check-in</TH>
              <TH>Check-out</TH>
              <TH>Status</TH>
            </THead>
            <TBody>
              {checkins.map((c, i) => (
                <TR key={c.id} index={i}>
                  <TD className="font-medium">{c.attachee_name}</TD>
                  <TD>{formatEAT(c.check_in, 'd MMM yyyy')}</TD>
                  <TD>{formatTimeEAT(c.check_in)}</TD>
                  <TD>{c.check_out ? formatTimeEAT(c.check_out) : '—'}</TD>
                  <TD>
                    <Badge variant={c.check_out ? 'gray' : 'green'}>
                      {c.check_out ? 'Out' : 'In'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
