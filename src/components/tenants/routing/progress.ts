export type RoutingProgress = {
  receiving: boolean;
  relay: boolean;
  outbound: boolean;
  auth: boolean;
};

export function progressCount(rp: RoutingProgress): number {
  return [rp.receiving, rp.relay, rp.outbound, rp.auth].filter(Boolean).length;
}
