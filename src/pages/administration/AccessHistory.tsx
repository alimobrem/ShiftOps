import React, { useState, useEffect } from 'react';
import {
  PageSection, Title, Card, CardBody, Label,
  SearchInput, Toolbar, ToolbarContent, ToolbarItem, Pagination,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';

const BASE = '/api/kubernetes';

interface AccessRecord {
  user: string;
  identityProvider: string;
  lastTokenCreated: string;
  tokenExpiry: string;
  activeSessions: number;
  isServiceAccount: boolean;
  createdTimestamp: string;
}

function formatAge(ts: string): string {
  if (!ts || ts === '-') return '-';
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff)) return '-';
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

function timeUntil(ts: string): string {
  if (!ts || ts === '-') return '-';
  const diff = new Date(ts).getTime() - Date.now();
  if (isNaN(diff)) return '-';
  if (diff < 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(diff / 60000)}m`;
}

export default function AccessHistory() {
  const [records, setRecords] = useState<AccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;

    async function loadAccess() {
      const accessMap = new Map<string, AccessRecord>();

      // Fetch users
      try {
        const res = await fetch(`${BASE}/apis/user.openshift.io/v1/users`);
        if (res.ok) {
          const data = await res.json() as { items: Record<string, unknown>[] };
          for (const user of data.items ?? []) {
            const metadata = (user['metadata'] ?? {}) as Record<string, unknown>;
            const userName = String(metadata['name'] ?? '');
            const identities = (user['identities'] ?? []) as string[];
            const idp = identities.length > 0 ? identities[0].split(':')[0] : '-';
            accessMap.set(userName, {
              user: userName,
              identityProvider: idp,
              lastTokenCreated: '-',
              tokenExpiry: '-',
              activeSessions: 0,
              isServiceAccount: userName.startsWith('system:serviceaccount:'),
              createdTimestamp: String(metadata['creationTimestamp'] ?? '-'),
            });
          }
        }
      } catch { /* ignore */ }

      // Fetch OAuthAccessTokens
      try {
        const res = await fetch(`${BASE}/apis/oauth.openshift.io/v1/oauthaccesstokens`);
        if (res.ok) {
          const data = await res.json() as { items: Record<string, unknown>[] };
          for (const token of data.items ?? []) {
            const userName = String((token as Record<string, unknown>)['userName'] ?? '');
            const clientName = String((token as Record<string, unknown>)['clientName'] ?? '');
            const metadata = ((token as Record<string, unknown>)['metadata'] ?? {}) as Record<string, unknown>;
            const created = String(metadata['creationTimestamp'] ?? '-');
            const expiresIn = Number((token as Record<string, unknown>)['expiresIn'] ?? 0);
            const expiryTime = expiresIn > 0 ? new Date(new Date(created).getTime() + expiresIn * 1000).toISOString() : '-';

            const existing = accessMap.get(userName);
            if (existing) {
              existing.activeSessions++;
              if (existing.lastTokenCreated === '-' || new Date(created) > new Date(existing.lastTokenCreated)) {
                existing.lastTokenCreated = created;
                existing.tokenExpiry = expiryTime;
              }
            } else {
              accessMap.set(userName, {
                user: userName,
                identityProvider: clientName || '-',
                lastTokenCreated: created,
                tokenExpiry: expiryTime,
                activeSessions: 1,
                isServiceAccount: userName.startsWith('system:serviceaccount:'),
                createdTimestamp: '-',
              });
            }
          }
        }
      } catch { /* ignore */ }

      // Fetch identities for additional detail
      try {
        const res = await fetch(`${BASE}/apis/user.openshift.io/v1/identities`);
        if (res.ok) {
          const data = await res.json() as { items: Record<string, unknown>[] };
          for (const identity of data.items ?? []) {
            const providerName = String((identity as Record<string, unknown>)['providerName'] ?? '');
            const providerUser = (((identity as Record<string, unknown>)['providerUserInfo'] ?? (identity as Record<string, unknown>)['user']) ?? {}) as Record<string, unknown>;
            const userName = String(providerUser['name'] ?? (identity as Record<string, unknown>)['user'] ?? '');

            // Try to match by user reference
            const userRef = ((identity as Record<string, unknown>)['user'] ?? {}) as Record<string, unknown>;
            const userRefName = String(userRef['name'] ?? userName);

            const existing = accessMap.get(userRefName);
            if (existing && providerName) {
              existing.identityProvider = providerName;
            }
          }
        }
      } catch { /* ignore */ }

      if (!cancelled) {
        setRecords(Array.from(accessMap.values()));
        setLoading(false);
      }
    }

    loadAccess();
    return () => { cancelled = true; };
  }, []);

  // Filter
  const filtered = search
    ? records.filter((r) => r.user.toLowerCase().includes(search.toLowerCase()) || r.identityProvider.toLowerCase().includes(search.toLowerCase()))
    : records;

  // Sort
  const sortKeys = ['user', 'identityProvider', 'lastTokenCreated', 'tokenExpiry', 'activeSessions'];
  let sorted = filtered;
  if (sortIndex !== null && sortKeys[sortIndex]) {
    const key = sortKeys[sortIndex] as keyof AccessRecord;
    sorted = [...filtered].sort((a, b) => {
      const aVal = String(a[key]);
      const bVal = String(b[key]);
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }

  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  const serviceAccountCount = records.filter((r) => r.isServiceAccount).length;
  const humanCount = records.length - serviceAccountCount;
  const expiredTokens = records.filter((r) => r.tokenExpiry !== '-' && new Date(r.tokenExpiry).getTime() < Date.now()).length;
  const highSessionUsers = records.filter((r) => r.activeSessions > 5).length;

  const onSort = (_event: React.MouseEvent, index: number, direction: 'asc' | 'desc') => {
    setSortIndex(index);
    setSortDirection(direction);
  };

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">Access History</Title>
        <p className="os-text-muted">Who logged in, active sessions, token status, and identity providers</p>
      </PageSection>

      <PageSection>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <Card style={{ flex: 1, minWidth: 140 }}>
            <CardBody style={{ textAlign: 'center', padding: '12px 16px' }}>
              <Title headingLevel="h3" size="2xl">{humanCount}</Title>
              <div className="os-text-muted" style={{ fontSize: 12 }}>Human Users</div>
            </CardBody>
          </Card>
          <Card style={{ flex: 1, minWidth: 140 }}>
            <CardBody style={{ textAlign: 'center', padding: '12px 16px' }}>
              <Title headingLevel="h3" size="2xl">{serviceAccountCount}</Title>
              <div className="os-text-muted" style={{ fontSize: 12 }}>Service Accounts</div>
            </CardBody>
          </Card>
          <Card style={{ flex: 1, minWidth: 140 }}>
            <CardBody style={{ textAlign: 'center', padding: '12px 16px' }}>
              <Title headingLevel="h3" size="2xl" style={{ color: expiredTokens > 0 ? '#c9190b' : undefined }}>{expiredTokens}</Title>
              <div className="os-text-muted" style={{ fontSize: 12 }}>Expired Tokens</div>
            </CardBody>
          </Card>
          <Card style={{ flex: 1, minWidth: 140 }}>
            <CardBody style={{ textAlign: 'center', padding: '12px 16px' }}>
              <Title headingLevel="h3" size="2xl" style={{ color: highSessionUsers > 0 ? '#f0ab00' : undefined }}>{highSessionUsers}</Title>
              <div className="os-text-muted" style={{ fontSize: 12 }}>High Session Users</div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardBody>
            <Toolbar>
              <ToolbarContent>
                <ToolbarItem>
                  <SearchInput
                    placeholder="Search by user or provider..."
                    value={search}
                    onChange={(_e, val) => { setSearch(val); setPage(1); }}
                    onClear={() => { setSearch(''); setPage(1); }}
                  />
                </ToolbarItem>
                <ToolbarItem variant="pagination" align={{ default: 'alignEnd' }}>
                  <Pagination
                    itemCount={filtered.length}
                    perPage={perPage}
                    page={page}
                    onSetPage={(_e, p) => setPage(p)}
                    onPerPageSelect={(_e, pp) => { setPerPage(pp); setPage(1); }}
                    isCompact
                  />
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>

            <Table aria-label="Access history table" variant="compact">
              <Thead>
                <Tr>
                  {['User', 'Identity Provider', 'Last Token Created', 'Token Expiry', 'Active Sessions'].map((title, i) => (
                    <Th key={title} sort={{ sortBy: sortIndex !== null ? { index: sortIndex, direction: sortDirection } : { direction: sortDirection }, onSort, columnIndex: i }}>
                      {title}
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {loading ? (
                  <Tr><Td colSpan={5}><span className="os-text-muted">Loading access data...</span></Td></Tr>
                ) : paginated.length === 0 ? (
                  <Tr><Td colSpan={5}><span className="os-text-muted">No access records found.</span></Td></Tr>
                ) : (
                  paginated.map((record) => {
                    const isExpired = record.tokenExpiry !== '-' && new Date(record.tokenExpiry).getTime() < Date.now();
                    return (
                      <Tr key={record.user}>
                        <Td dataLabel="User">
                          <strong>{record.user}</strong>
                          {record.isServiceAccount && <Label color="grey" isCompact style={{ marginLeft: 6 }}>SA</Label>}
                        </Td>
                        <Td dataLabel="Identity Provider">{record.identityProvider}</Td>
                        <Td dataLabel="Last Token Created">{formatAge(record.lastTokenCreated)}</Td>
                        <Td dataLabel="Token Expiry">
                          {isExpired ? (
                            <Label color="red" isCompact>Expired</Label>
                          ) : record.tokenExpiry !== '-' ? (
                            <span>{timeUntil(record.tokenExpiry)} remaining</span>
                          ) : '-'}
                        </Td>
                        <Td dataLabel="Active Sessions">
                          {record.activeSessions}
                          {record.activeSessions > 5 && <Label color="orange" isCompact style={{ marginLeft: 6 }}>High</Label>}
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
}
