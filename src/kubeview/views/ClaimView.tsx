/**
 * ClaimView — handles shared view links. Clones the view to the
 * current user's account and redirects to the new view.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Loader2 } from 'lucide-react';
import { useCustomViewStore } from '../store/customViewStore';

export default function ClaimView() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) {
      setError('Invalid share link');
      return;
    }

    useCustomViewStore.getState().claimSharedView(shareToken).then((newId) => {
      if (newId) {
        navigate(`/custom/${newId}`, { replace: true });
      } else {
        setError('This share link is invalid or has expired.');
      }
    });
  }, [shareToken, navigate]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 gap-4">
        <LayoutDashboard className="w-12 h-12 text-slate-600" />
        <p className="text-slate-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-950 gap-4">
      <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      <p className="text-slate-400">Cloning dashboard to your account...</p>
    </div>
  );
}
