import { useMemo } from 'react';
import { mapToDisplayStatus } from '../lib/disposal-api';

export function useStatusMapper() {
  const mapStatus = useMemo(() => mapToDisplayStatus, []);
  return { mapStatus };
}
