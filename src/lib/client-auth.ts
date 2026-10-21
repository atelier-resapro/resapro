import { normaliserTelephone } from './phone.ts';

export function telephoneMobileInternational(input: string): string | null {
  const tel = normaliserTelephone(input);
  return tel && /^0[67]/.test(tel) ? '+33' + tel.slice(1) : null;
}

export function messageErreurCode(code?: string): string {
  if (code === 'otp_expired' || code === 'otp_disabled' || code === 'validation_failed') {
    return 'Code incorrect ou expiré. Vérifiez les 6 chiffres ou demandez un nouveau code.';
  }
  if (code === 'over_request_rate_limit' || code === 'over_sms_send_rate_limit') {
    return 'Trop de tentatives. Patientez avant de réessayer.';
  }
  return 'Connexion impossible pour le moment. Veuillez réessayer.';
}
