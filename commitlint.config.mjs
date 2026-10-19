/**
 * Conventional Commits, plus the rules this repository holds itself to in every
 * message: no em dashes, no emojis and no co-author trailer, all of which read
 * as text nobody wrote. Bodies are paragraphs, so their lines are not wrapped.
 */
const NO_EM_DASH = /—/u;
const EMOJI = /\p{Extended_Pictographic}/u;
const CO_AUTHOR = /^co-authored-by:/im;

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'written-by-a-person': [2, 'always'],
  },
  plugins: [
    {
      rules: {
        'written-by-a-person': ({ raw }) => {
          if (NO_EM_DASH.test(raw)) {
            return [false, 'use a spaced hyphen, not an em dash'];
          }
          if (EMOJI.test(raw)) {
            return [false, 'no emojis in commit messages'];
          }
          if (CO_AUTHOR.test(raw)) {
            return [false, 'no Co-Authored-By trailer'];
          }
          return [true];
        },
      },
    },
  ],
};
