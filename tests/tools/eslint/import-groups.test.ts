import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import { importGroups } from '../../../tools/eslint/import-groups.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

const four = ["import a from 'a';", "import b from 'b';", "import c from './c';", "import d from './d';"];

tester.run('import-groups', importGroups, {
  valid: [
    four.slice(0, 3).join('\n'),
    ['// Libs', four[0], four[1], '', '// Utils', four[2], '', '// Types', four[3]].join('\n'),
  ],
  invalid: [
    { code: four.join('\n'), errors: [{ messageId: 'missing' }] },
    {
      code: ['// Utils', four[0], '// Libs', four[1], four[2], four[3]].join('\n'),
      errors: [{ messageId: 'order' }],
    },
    { code: ['// React', four[0], four[1], four[2], four[3]].join('\n'), errors: [{ messageId: 'unknown' }] },
    { code: [four[0], '// Libs', four[1], four[2], four[3]].join('\n'), errors: [{ messageId: 'headerless' }] },
    {
      code: ['// Libs', four[0], '// Utils', four[1], '// Libs', four[2], four[3]].join('\n'),
      errors: [{ messageId: 'repeated' }],
    },
  ],
});
