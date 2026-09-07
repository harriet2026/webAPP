/**
 * The embedded intent-engine page owns its scrolling inside the pipeline
 * workspace drawer. Keep the form body and action bar as separate flex rows so
 * the action bar never has to overlap the final intent card to stay visible.
 */
export const intentEngineEmbeddedLayoutClasses = {
  root: 'h-full min-h-0 p-6',
  card: 'h-full min-h-0 gap-0 pb-0',
  content: 'flex min-h-0 flex-1 flex-col p-0',
  stack: 'flex min-h-0 flex-1 flex-col',
  body: 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6',
  footer: 'shrink-0',
} as const;
