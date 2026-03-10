import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import QuickDeployDialog from '@/components/QuickDeployDialog';
import {
  PageSection,
  Title,
  Card,
  CardBody,
  Label,
  Button,
  Flex,
  FlexItem,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@patternfly/react-icons';
import { useClusterStore } from '@/store/useClusterStore';
import '@/openshift-components.css';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function Sparkline({ data, color = '#0066cc' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data) - 5;
  const max = Math.max(...data) + 5;
  const w = 160;
  const h = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="os-sparkline">
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const { nodes, pods, events, metrics, clusterInfo, fetchClusterData, startPolling, stopPolling } = useClusterStore();

  useEffect(() => {
    fetchClusterData();
    startPolling();
    return () => stopPolling();
  }, [fetchClusterData, startPolling, stopPolling]);

  const [deployOpen, setDeployOpen] = React.useState(false);
  const avgCpu = nodes.length > 0 ? Math.round(nodes.reduce((s, n) => s + n.cpu, 0) / nodes.length) : 0;
  const avgMem = nodes.length > 0 ? Math.round(nodes.reduce((s, n) => s + n.memory, 0) / nodes.length) : 0;

  const statusItems = [
    { label: 'Cluster', ok: true },
    { label: 'Control Plane', ok: true },
    { label: 'Operators', ok: true },
    { label: 'Dynamic Plugins', ok: true },
    { label: 'Insights', ok: true },
  ];

  return (
    <>
      {/* Greeting */}
      <PageSection className="os-overview__greeting">
        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }}>
          <FlexItem>
            <span className="os-overview__greeting-icon">&#x1f319;</span>
          </FlexItem>
          <FlexItem>
            <Title headingLevel="h1" size="xl">{getGreeting()}</Title>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection>
        <div className="os-overview__grid">

          {/* LEFT COLUMN: Details + Cluster Inventory */}
          <div className="os-overview__column">
            <Card>
              <CardBody>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="os-overview__section-header">
                  <FlexItem><strong className="os-overview__section-title">Details</strong></FlexItem>
                  <FlexItem>
                    <span className="os-overview__link" onClick={() => navigate('/administration/cluster-settings')}>View settings</span>
                  </FlexItem>
                </Flex>
                <Button variant="primary" size="sm" onClick={() => setDeployOpen(true)} className="os-overview__deploy-btn">
                  + Deploy Workload
                </Button>
                <DescriptionList isCompact>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Cluster API address</DescriptionListTerm>
                    <DescriptionListDescription className="os-overview__desc-sm">
                      {clusterInfo?.apiURL ?? 'https://api.cluster.example.com:6443'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Cluster ID</DescriptionListTerm>
                    <DescriptionListDescription className="os-overview__desc-mono">
                      03242ee9-8986-4f0f-acc0-65aad26ba6a5
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Infrastructure provider</DescriptionListTerm>
                    <DescriptionListDescription>
                      <strong className="os-overview__provider-value">{clusterInfo?.platform ?? 'AWS'}</strong>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>OpenShift version</DescriptionListTerm>
                    <DescriptionListDescription>{clusterInfo?.version ?? 'OpenShift 4.14.5'}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Update channel</DescriptionListTerm>
                    <DescriptionListDescription>{clusterInfo?.updateChannel ?? 'stable-4.14'}</DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <strong className="os-overview__inventory-title">Cluster inventory</strong>
                {[
                  { label: 'Nodes', count: nodes.length, color: '#0066cc', abbr: 'N', href: '/compute/nodes' },
                  { label: 'Pods', count: pods.length, color: '#009596', abbr: 'P', href: '/workloads/pods' },
                  { label: 'StorageClasses', count: 3, color: '#5752d1', abbr: 'SC', href: '/storage/storageclasses' },
                  { label: 'PersistentVolumeClaims', count: 4, color: '#f4c145', abbr: 'PVC', href: '/storage/persistentvolumeclaims' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="os-overview__inventory-row"
                    onClick={() => navigate(item.href)}
                  >
                    <span className="os-overview__inventory-badge" style={{ '--os-badge-bg': item.color } as React.CSSProperties}>
                      {item.abbr}
                    </span>
                    <span className="os-overview__inventory-label">{item.label}</span>
                    <span className="os-overview__inventory-count">{item.count}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          {/* CENTER COLUMN: Status + Cluster Utilization */}
          <div className="os-overview__column">
            <Card>
              <CardBody>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="os-overview__section-header">
                  <FlexItem><strong className="os-overview__section-title">Status</strong></FlexItem>
                  <FlexItem>
                    <span className="os-overview__link" onClick={() => navigate('/observe/alerts')}>
                      View alerts
                    </span>
                  </FlexItem>
                </Flex>
                <Flex spaceItems={{ default: 'spaceItemsLg' }} className="os-overview__status-row">
                  {statusItems.map((s) => (
                    <FlexItem key={s.label}>
                      <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                        <FlexItem>
                          <CheckCircleIcon color="var(--os-accent-green, #3e8635)" />
                        </FlexItem>
                        <FlexItem><span className="os-overview__status-label">{s.label}</span></FlexItem>
                      </Flex>
                    </FlexItem>
                  ))}
                </Flex>

                {/* Alerts */}
                {events.filter((e) => e.type === 'Warning').slice(0, 2).map((alert) => (
                  <div key={`${alert.timestamp}-${alert.reason}`} className="os-overview__alert-item">
                    <Flex alignItems={{ default: 'alignItemsFlexStart' }} spaceItems={{ default: 'spaceItemsSm' }}>
                      <FlexItem><ExclamationTriangleIcon color="var(--os-accent-yellow, #f0ab00)" /></FlexItem>
                      <FlexItem className="os-overview__alert-body">
                        <div className="os-overview__alert-reason">{alert.reason}</div>
                        <div className="os-overview__alert-time">
                          {new Date(alert.timestamp).toLocaleDateString()} {new Date(alert.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="os-overview__alert-message">
                          {alert.message}
                        </div>
                      </FlexItem>
                    </Flex>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="os-overview__section-header">
                  <FlexItem><strong className="os-overview__section-title">Cluster utilization</strong></FlexItem>
                  <FlexItem className="os-overview__filter-group">
                    <Label color="grey">Filter by Node type</Label>
                    <Label color="grey">1 hour</Label>
                  </FlexItem>
                </Flex>

                <div className="os-overview__utilization-header">
                  <span>Resource</span><span>Usage</span><span></span>
                </div>

                {/* CPU */}
                <div className="os-overview__utilization-row">
                  <div>
                    <div className="os-overview__utilization-label">CPU</div>
                    <div className="os-overview__utilization-sublabel">{avgCpu}% of {nodes.length * 4} cores</div>
                  </div>
                  <div className="os-overview__utilization-value">{(avgCpu / 100 * nodes.length * 4).toFixed(1)}</div>
                  <div><Sparkline data={metrics.map((m) => m.cpu)} color="#0066cc" /></div>
                </div>

                {/* Memory */}
                <div className="os-overview__utilization-row">
                  <div>
                    <div className="os-overview__utilization-label">Memory</div>
                    <div className="os-overview__utilization-sublabel">{(avgMem / 100 * 64).toFixed(1)} GiB / 64 GiB</div>
                  </div>
                  <div className="os-overview__utilization-value">{(avgMem / 100 * 64).toFixed(1)} GiB</div>
                  <div><Sparkline data={metrics.map((m) => m.memory)} color="#009596" /></div>
                </div>

                {/* Filesystem */}
                <div className="os-overview__utilization-row">
                  <div>
                    <div className="os-overview__utilization-label">Filesystem</div>
                    <div className="os-overview__utilization-sublabel">Filesystem data requires node metrics</div>
                  </div>
                  <div className="os-overview__utilization-value">--</div>
                  <div />
                </div>
              </CardBody>
            </Card>
          </div>

          {/* RIGHT COLUMN: Activity */}
          <Card>
            <CardBody>
              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="os-overview__activity-header">
                <FlexItem><strong className="os-overview__section-title">Activity</strong></FlexItem>
                <FlexItem>
                  <span className="os-overview__link" onClick={() => navigate('/home/events')}>
                    View all events
                  </span>
                </FlexItem>
              </Flex>

              <div className="os-overview__ongoing-section">
                <div className="os-overview__ongoing-title">Ongoing</div>
                <div className="os-overview__ongoing-empty">There are no ongoing activities.</div>
              </div>

              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="os-overview__recent-header">
                <FlexItem><span className="os-overview__recent-title">Recent events</span></FlexItem>
                <FlexItem><span className="os-overview__recent-pause">Pause</span></FlexItem>
              </Flex>

              <div className="os-overview__event-scroll">
                {events.slice(0, 15).map((event, i) => {
                  const badgeColor = event.type === 'Warning' ? '#f0ab00' : event.type === 'Error' ? '#c9190b' : '#009596';
                  const abbr = event.namespace === 'default' ? 'P' : event.namespace === 'production' ? 'P' : 'J';
                  return (
                    <div key={`${event.timestamp}-${i}`} className="os-overview__event-row">
                      <span className="os-overview__event-time">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="os-overview__event-badge" style={{ '--os-badge-bg': badgeColor } as React.CSSProperties}>
                        {abbr}
                      </span>
                      <span className="os-overview__event-message">
                        {event.message}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      </PageSection>

      <QuickDeployDialog open={deployOpen} onClose={() => setDeployOpen(false)} />
    </>
  );
}
