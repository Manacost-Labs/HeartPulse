import { registerHooks } from 'node:module';

// Preloaded by the page-text renderer: components import `.css` files Node cannot load, and their styles are not text.
registerHooks({
  resolve(target, context, nextResolve) {
    return target.endsWith('.css')
      ? { url: 'data:text/javascript,export{}', shortCircuit: true }
      : nextResolve(target, context);
  },
});
