import {describe,it,expect} from 'vitest';
import {normalizeWord} from '../../src/lib/normalize';
describe('canonical words',()=>{
 it('folds case, whitespace and ё without changing semantics',()=>{expect(normalizeWord('  ХОРОШИЙ  коллектив\n')).toBe('хороший коллектив');expect(normalizeWord('Надёжность')).toBe('надежность');expect(normalizeWord('Высокая зарплата')).not.toBe(normalizeWord('зарплата'));});
 it('normalizes Unicode composition',()=>expect(normalizeWord('и\u0306')).toBe('й'));
});
