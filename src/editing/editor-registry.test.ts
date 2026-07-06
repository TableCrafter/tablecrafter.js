/**
 * editing/editor-registry.test.ts
 *
 * Unit tests for EditorRegistry (Issue #366).
 * Environment: jsdom (via vitest.config.ts).
 */

import { describe, it, expect } from 'vitest';
import { createEditorRegistry, editorRegistry } from './index';

// ---------------------------------------------------------------------------
// createEditorRegistry()
// ---------------------------------------------------------------------------

describe('createEditorRegistry()', () => {
  it('built-in editors present and sorted', () => {
    const reg = createEditorRegistry();
    expect(reg.keys()).toEqual([
      'boolean',
      'checkbox',
      'date',
      'number',
      'select',
      'star',
      'text',
    ]);
  });

  it('get("text") returns { label: "Text", cellType: "text" }', () => {
    const reg = createEditorRegistry();
    expect(reg.get('text')).toEqual({ label: 'Text', cellType: 'text' });
  });

  it('get("select") has hasOptions: true', () => {
    const reg = createEditorRegistry();
    const desc = reg.get('select');
    expect(desc?.hasOptions).toBe(true);
  });

  it('register("custom", {label: "Custom"}) succeeds', () => {
    const reg = createEditorRegistry();
    expect(() => reg.register('custom', { label: 'Custom' })).not.toThrow();
  });

  it('register("text", ...) throws with "already registered"', () => {
    const reg = createEditorRegistry();
    expect(() =>
      reg.register('text', { label: 'Text Duplicate' })
    ).toThrowError(/already registered/);
  });

  it('get("custom") returns the registered descriptor', () => {
    const reg = createEditorRegistry();
    reg.register('custom', { label: 'Custom', hasOptions: false });
    expect(reg.get('custom')).toEqual({ label: 'Custom', hasOptions: false });
  });

  it('keys() includes "custom" after registering', () => {
    const reg = createEditorRegistry();
    reg.register('custom', { label: 'Custom' });
    expect(reg.keys()).toContain('custom');
  });

  it('keys() returns sorted list after registering', () => {
    const reg = createEditorRegistry();
    reg.register('zzz', { label: 'ZZZ' });
    reg.register('aaa', { label: 'AAA' });
    const keys = reg.keys();
    expect(keys).toContain('zzz');
    expect(keys).toContain('aaa');
    // Verify sort order: aaa should come before zzz
    expect(keys.indexOf('aaa')).toBeLessThan(keys.indexOf('zzz'));
  });

  it('two createEditorRegistry() instances are independent', () => {
    const reg1 = createEditorRegistry();
    const reg2 = createEditorRegistry();
    reg1.register('only-in-reg1', { label: 'Only In Reg1' });
    expect(reg1.get('only-in-reg1')).toBeDefined();
    expect(reg2.get('only-in-reg1')).toBeUndefined();
  });

  it('get() returns undefined for unregistered name', () => {
    const reg = createEditorRegistry();
    expect(reg.get('nonexistent-editor')).toBeUndefined();
  });

  it('register stores a copy of the descriptor (not the same reference)', () => {
    const reg = createEditorRegistry();
    const desc = { label: 'Mutable' };
    reg.register('mutable', desc);
    // Mutating the original should not affect the stored descriptor
    desc.label = 'Changed';
    expect(reg.get('mutable')?.label).toBe('Mutable');
  });
});

// ---------------------------------------------------------------------------
// editorRegistry (default singleton)
// ---------------------------------------------------------------------------

describe('editorRegistry (default singleton)', () => {
  it('is a shared singleton — built-in editors are accessible', () => {
    expect(editorRegistry.get('text')).toBeDefined();
    expect(editorRegistry.get('number')).toBeDefined();
    expect(editorRegistry.get('select')).toBeDefined();
  });

  it('default editorRegistry is a shared singleton (modifying it shows in subsequent get)', () => {
    // Use a timestamp-based unique name to avoid cross-test pollution
    const uniqueName = `singleton-test-${Date.now()}`;
    editorRegistry.register(uniqueName, { label: 'Singleton Test' });
    // The same module-level reference reflects the modification
    expect(editorRegistry.get(uniqueName)).toBeDefined();
    expect(editorRegistry.get(uniqueName)?.label).toBe('Singleton Test');
  });

  it('editorRegistry keys() is sorted', () => {
    const keys = editorRegistry.keys();
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });
});
