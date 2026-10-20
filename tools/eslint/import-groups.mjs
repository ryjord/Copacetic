// The import group headers AGENTS.md asks for, checked rather than remembered.
const GROUPS = ['Libs', 'Components', 'Icons', 'Store', 'Utils', 'Types'];
// Below this a file's imports are read at a glance, so the headers are not required.
const MOST_WITHOUT_HEADERS = 3;

/** @type {import('eslint').Rule.RuleModule} */
export const importGroups = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Group imports under the // Libs, // Components, ... headers, in that order' },
    messages: {
      missing: 'A file with {{count}} imports groups them under headers: {{groups}}.',
      unknown: '"{{text}}" is not an import group; use one of {{groups}}.',
      order: '"// {{text}}" comes after "// {{previous}}"; the order is {{groups}}.',
      repeated: '"// {{text}}" appears twice; put that group\'s imports together.',
      headerless: 'This import comes before any group header.',
    },
    schema: [],
  },
  create(context) {
    const groups = GROUPS.join(', ');
    return {
      Program(program) {
        const imports = program.body.filter((node) => node.type === 'ImportDeclaration');
        const lastImport = imports.at(-1);
        if (!lastImport) {
          return;
        }
        const headers = context.sourceCode
          .getAllComments()
          .filter((comment) => comment.type === 'Line' && comment.range[1] <= lastImport.range[0])
          .map((comment) => ({ comment, text: comment.value.trim() }))
          .filter(({ text }) => /^[A-Z][a-z]+$/.test(text));
        if (imports.length <= MOST_WITHOUT_HEADERS && headers.length === 0) {
          return;
        }
        if (headers.length === 0) {
          context.report({ node: imports[0], messageId: 'missing', data: { count: imports.length, groups } });
          return;
        }
        let previous = -1;
        const seen = new Set();
        for (const { comment, text } of headers) {
          const position = GROUPS.indexOf(text);
          if (position === -1) {
            context.report({ loc: comment.loc, messageId: 'unknown', data: { text, groups } });
            continue;
          }
          if (seen.has(text)) {
            context.report({ loc: comment.loc, messageId: 'repeated', data: { text } });
          } else if (position < previous) {
            context.report({
              loc: comment.loc,
              messageId: 'order',
              data: { text, previous: GROUPS[previous], groups },
            });
          }
          seen.add(text);
          previous = Math.max(previous, position);
        }
        if (imports[0].range[0] < headers[0].comment.range[0]) {
          context.report({ node: imports[0], messageId: 'headerless' });
        }
      },
    };
  },
};
