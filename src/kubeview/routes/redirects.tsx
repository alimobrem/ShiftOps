import { Route, Navigate } from 'react-router-dom';

export function redirectRoutes() {
  return (
    <>
      <Route path="software" element={<Navigate to="/create" replace />} />
      <Route path="morning-report" element={<Navigate to="/inbox" replace />} />
      <Route path="troubleshoot" element={<Navigate to="/inbox" replace />} />
      <Route path="config-compare" element={<Navigate to="/admin" replace />} />
    </>
  );
}
