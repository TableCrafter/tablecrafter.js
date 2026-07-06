import { describe, it, expect } from 'vitest';
import * as mod from './plugins';

describe('core/plugins module', () => {
  it('loads and exports createPluginRegistry', () => {
    expect(typeof mod.createPluginRegistry).toBe('function');
  });
});
