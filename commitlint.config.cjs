const SUBJECT_ISSUE_REFERENCE_PATTERN = /(?:\s\(#\d+\)|(?:^|\s)#\d+|(?:^|\s)[A-Z][A-Z0-9]+-\d+)(?:\s|$)/;
const ISSUE_REFERENCE_PATTERN = /(?:#\d+|[A-Z][A-Z0-9]+-\d+)/;
const ISSUE_FOOTER_PATTERN = /^Refs:\s(?:#\d+|[A-Z][A-Z0-9]+-\d+)$/;

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore', 'ci', 'build', 'perf', 'revert', 'wip'],
    ],
    'header-max-length': [2, 'always', 100],
    'subject-min-length': [2, 'always', 3],
    'subject-max-length': [2, 'always', 100],
    'subject-case': [0],
    'subject-no-issue-reference': [2, 'always'],
    'footer-issue-reference-format': [2, 'always'],
  },
  plugins: [
    {
      rules: {
        'subject-no-issue-reference': ({ subject }) => {
          if (!subject) {
            return [true];
          }

          return [
            !SUBJECT_ISSUE_REFERENCE_PATTERN.test(subject),
            '이슈나 티켓 ID는 커밋 제목에 넣지 말고 footer에 `Refs: #123` 또는 `Refs: ECOM-123` 형식으로 작성하세요.',
          ];
        },
        'footer-issue-reference-format': ({ footer, subject }) => {
          if (!footer) {
            return [true];
          }

          const footerLines = footer
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
          const issueLines = footerLines.filter((line) => ISSUE_REFERENCE_PATTERN.test(line));

          if (issueLines.length === 0) {
            return [true];
          }

          return [
            issueLines.every((line) => ISSUE_FOOTER_PATTERN.test(line)),
            `이슈 참조는 footer에 \`Refs: #123\` 또는 \`Refs: ECOM-123\` 형식으로 작성하세요. 현재 subject: ${
              subject ?? ''
            }`,
          ];
        },
      },
    },
  ],
};
