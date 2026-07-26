'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  configured: boolean;
}

export function AntivirusStatusCard({ configured }: Props) {
  return (
    <Card data-testid="antivirus-status-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Antivirus</CardTitle>
        <Badge variant={configured ? 'default' : 'secondary'}>
          {configured ? 'Configured' : 'Not Configured'}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground">
          {configured ? 'Antivirus server is configured and ready.' : 'No antivirus server configured.'}
        </div>
      </CardContent>
    </Card>
  );
}
