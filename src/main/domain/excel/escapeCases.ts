// Bộ case dùng chung cho hai chiều: escape (Excel -> Markdown, escape.test.ts)
// và giải escape (Markdown -> Excel, md2xlsx/inline.test.ts).

export const INLINE_CASES = [
  '<null>',
  '<input type="text"> を使用',
  '</div>',
  '<!-- メモ -->',
  '<https://example.com>',
  '*必須*',
  '2*3*4',
  '__x__',
  '_x_',
  'a_b_ c',
  '&nbsp;',
  '&amp; と &#123;',
  '`code`',
  '[仕様](http://example.com/a)',
  '![img](x.png)',
  '[ref]: http://x',
  '1~10, 20~30',
  '~~del~~',
  'C:\\Users\\x\\file',
  '\\*not\\*',
]

// Không cần escape -> giữ nguyên trong file .md cho dễ đọc
export const UNTOUCHED = ['snake_case_name', 'a < b', '<画面名>', '1~10', 'x > y', 'https://example.com/a_b?x=1&y=2']

export const BLOCK_CASES = ['# 見出し', '###', '> 引用', '- item', '+ item', '* item', '1. one', '2) two', '---', '- - -', '***', '___', '[ref]: http://x']
