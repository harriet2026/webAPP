import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import zh from '../../messages/zh.json';

const SOURCE = readFileSync(
  path.resolve(import.meta.dirname, '../../src/components/security/PolicyPipelinePage.tsx'),
  'utf8',
);
const CARD_RENDER = SOURCE.slice(
  SOURCE.indexOf('const renderPolicyCard'),
  SOURCE.indexOf('const getStageFlow'),
);

describe('GT-12094 RBL pipeline-card tooltip', () => {
  it('renders RBL description, blocking action, and pipeline termination exactly once', () => {
    expect(CARD_RENDER).toContain("policy.key === 'rbl'");
    expect(CARD_RENDER).toContain("t('pipeline.actionBlock')");
    expect(CARD_RENDER).toContain("t('pipeline.flowTerminateDesc')");
    // Tooltip variants must be one exclusive chain. A previous pair of
    // independent conditionals rendered rblDesc twice for every non-URL card.
    expect(CARD_RENDER).toContain(") : policy.key === 'content' ? (");

    expect(zh.pipeline.rblDesc).toBeTruthy();
    expect(zh.pipeline.actionBlock).toBeTruthy();
    expect(zh.pipeline.flowTerminateDesc).toBeTruthy();
  });
});
