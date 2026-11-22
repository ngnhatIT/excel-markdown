/* Vite: `import css from './x.css?raw'` trả nội dung file dạng chuỗi (dùng ở main, renderer và vitest). */
declare module '*.css?raw' {
  const text: string
  export default text
}
