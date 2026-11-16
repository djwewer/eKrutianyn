'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { KURIN_DEACTIVATED_MESSAGE, isKurinDeactivated } from '@/lib/api-client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: { theme: string; size: string }) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;

    async function handleCredential(response: { credential: string }) {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential }),
      });
      if (res.ok) {
        queryClient.clear();
        router.push('/');
        router.refresh();
        return;
      }
      const body = res.status === 403 ? await res.json().catch(() => null) : null;
      if (isKurinDeactivated(body)) setError(KURIN_DEACTIVATED_MESSAGE);
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (window.google && buttonRef.current) {
        window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
        window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large' });
      }
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [router, queryClient, clientId]);

  if (!clientId) return null;

  return (
    <div className="space-y-2">
      <div ref={buttonRef} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
