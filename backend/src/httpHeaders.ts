// Todas as inferências e os cadastros usam recursos do próprio servidor.
// Impede também o envio automático de telemetria por bibliotecas de terceiros.
export const LOCAL_HTTP_HEADERS = {
  'Content-Security-Policy': "connect-src 'self'; object-src 'none'; base-uri 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
} as const
