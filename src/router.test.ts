import { describe, expect, it } from 'vitest';
import { parseHash } from './router';

describe('parseHash', () => {
  it('reads the page', () => {
    expect(parseHash('#/gantt').page).toBe('gantt');
    expect(parseHash('#/diagrams').page).toBe('diagrams');
    expect(parseHash('#/gantt?anything=ignored').page).toBe('gantt');
  });
  it('an empty or unknown hash opens the last workspace, defaulting to diagrams', () => {
    expect(parseHash('').page).toBe('diagrams');
    expect(parseHash('', 'gantt').page).toBe('gantt');
    expect(parseHash('#/nope', 'gantt').page).toBe('diagrams');
  });
});
