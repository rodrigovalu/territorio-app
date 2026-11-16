export const colors = {
  bg: '#0E1116',
  panel: '#161B22',
  line: '#262D36',
  ink: '#E8EDF2',
  mute: '#8B96A3',
  accent: '#FF6A2B',
  danger: '#F43F5E',
  success: '#4ADE80',
};

/** Paleta que o usuário pode escolher (mesmos valores aceitos pelo banco). */
export const RUNNER_COLORS = [
  '#3B82F6', '#22C55E', '#E879F9', '#FACC15', '#06B6D4', '#F43F5E',
  '#A78BFA', '#FB923C', '#14B8A6', '#84CC16', '#EC4899', '#6366F1',
];

/** Converte #RRGGBB em rgba com transparência (para os territórios no mapa). */
export function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const mapStyleDark = [
  { elementType: 'geometry', stylers: [{ color: '#1d2329' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8b96a3' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0e1116' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3540' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4552' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b2a3d' }] },
];
