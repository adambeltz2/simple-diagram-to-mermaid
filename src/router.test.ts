import { describe, expect, it } from 'vitest';
import { parseHash } from './router';

describe('parseHash', () => {
  it('reads the page and query', () => {
    expect(parseHash('#/gantt').page).toBe('gantt');
    expect(parseHash('#/gantt?d=zAbC').params.get('d')).toBe('zAbC');
    expect(parseHash('#/diagrams').page).toBe('diagrams');
  });
  it('an empty or unknown hash opens the last workspace, defaulting to diagrams', () => {
    expect(parseHash('').page).toBe('diagrams');
    expect(parseHash('', 'gantt').page).toBe('gantt');
    expect(parseHash('#/nope', 'gantt').page).toBe('diagrams');
  });
});
