import { MapPin, ExternalLink } from 'lucide-react';

/**
 * Detecta se a string é um link de mapa (Google Maps, Apple Maps, waze, geo:)
 * ou coordenadas (-2.5,-44.3). Retorna URL Maps normalizada ou null se for texto livre.
 */
export function detectMapsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // Já é URL de algum Maps/Waze
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.[^/]+\/maps|maps\.google\.|www\.waze\.com|waze\.com|maps\.apple\.com)/i.test(s)) {
    return s;
  }

  // geo: URI
  if (/^geo:/i.test(s)) return s;

  // Par lat,lng (ex "-2.5308,-44.2567")
  const coordMatch = s.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (coordMatch) {
    return `https://www.google.com/maps/search/?api=1&query=${coordMatch[1]},${coordMatch[2]}`;
  }

  return null;
}

/**
 * Transforma qualquer endereço (texto OU link) em URL do Google Maps.
 * Se já é link Maps, retorna ele. Se é texto, faz search.
 */
export function toMapsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const direct = detectMapsUrl(raw);
  if (direct) return direct;
  const text = raw.trim();
  if (!text) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

interface AddressCellProps {
  address?: string | null;
  size?: number;
  maxWidth?: string;
}

/**
 * Renderiza endereço como link clicável que abre no Google Maps em nova aba.
 * Se o campo tiver um link Maps direto (ex. "maps.app.goo.gl/..."), usa esse link
 * e mostra ícone diferenciado pra indicar que é link nativo enviado pelo cliente.
 */
export function AddressCell({ address, size = 12, maxWidth = '260px' }: AddressCellProps) {
  if (!address) return <span>—</span>;

  const mapsUrl = toMapsUrl(address);
  const isNativeLink = detectMapsUrl(address) !== null;

  // Texto a exibir — se for URL longa, mostra só "📍 Abrir no Maps"
  const display = isNativeLink
    ? '📍 Localização enviada (abrir)'
    : address;

  return (
    <a
      href={mapsUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        color: 'var(--accent, #2563eb)',
        textDecoration: 'none',
        maxWidth,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      onClick={e => e.stopPropagation()}
      title={isNativeLink ? `Abrir localização enviada pelo cliente` : `Abrir no Google Maps: ${address}`}
    >
      {isNativeLink ? <ExternalLink size={size} /> : <MapPin size={size} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{display}</span>
    </a>
  );
}
