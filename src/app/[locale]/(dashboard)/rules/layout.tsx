import { ReplicaBanner } from '@/components/rules/replica-banner';

// Task 9b: mounts the replica-mode banner above every page under rules/*.
// There is no other shared layout under rules/ today; this is deliberately
// the smallest possible addition — a bare Fragment, no wrapper div, no extra
// styling here. ReplicaBanner returns null on any node that is not an active
// replica (the default), and a null child of a Fragment contributes no DOM
// node at all, so this layout is a complete no-op for every node except an
// active replica: standalone/primary pages render byte-for-byte as they did
// before this file existed. See replica-banner.tsx for why its `mb-8` (not a
// wrapper here) is what keeps the page header flush when the banner IS shown.
export default function RulesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ReplicaBanner />
      {children}
    </>
  );
}
