import { useEffect, useRef, useState } from 'react';

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }
let scriptPromise: Promise<void> | undefined;
function loadScript() {
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { scriptPromise = undefined; script.remove(); reject(new Error('captcha')); };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export default function ClientCaptcha({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!sitekey) return;
    let disposed = false;
    let widget: string | undefined;
    loadScript().then(() => {
      if (disposed || !container.current || !window.turnstile) return;
      widget = window.turnstile.render(container.current, {
        sitekey, action: 'connexion-client', language: 'fr',
        callback: (token: string) => { setError(false); onToken(token); },
        'expired-callback': () => onToken(''),
        'error-callback': () => { onToken(''); setError(true); },
      });
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; if (widget) window.turnstile?.remove(widget); };
  }, [onToken, sitekey]);
  if (!sitekey) return <p role="alert">Connexion SMS indisponible : protection anti-robot non configurée.</p>;
  return <div><div ref={container} />{error && <p role="alert">Protection anti-robot indisponible. Rechargez la page pour réessayer.</p>}</div>;
}
